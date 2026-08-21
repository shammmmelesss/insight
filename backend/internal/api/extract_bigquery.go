package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"strings"
	"time"

	"cloud.google.com/go/bigquery"
	"cloud.google.com/go/civil"
	"google.golang.org/api/iterator"
	"google.golang.org/api/option"

	"data-analysis-platform/internal/database"
	"data-analysis-platform/internal/models"
)

// storageAccelExpectRows 是判定"本应走 Storage 却没走"的行数阈值。
// 低于此值走 REST 属官方 client 正常优化（小结果不建 ReadSession），不算降级。
const storageAccelExpectRows = 500000

// extractBigQueryToStaging 使用 BigQuery Storage Read API 抽取数据并写入 staging 表。
//
// 相比 database/sql 走的 REST + 逐行 JSON 解码（纯 CPU 密集、大结果集会吃满多核），
// Storage Read API 由官方客户端自动完成：将查询结果落到临时表 → 建 Storage ReadSession
// → 用 Arrow 分块流式读取。吞吐更高、CPU 占用显著更低。
//
// EnableStorageReadClient 后，RowIterator 在结果足够大时自动走 Storage 通道（可用
// IsAccelerated() 判断），小结果集仍走 jobs.query 优化路径——无需业务侧判断。
func extractBigQueryToStaging(ctx context.Context, dataSource models.DataSource, query, stagingName string) error {
	projectID := dataSource.Database
	if projectID == "" {
		return fmt.Errorf("BigQuery 数据源缺少 projectID")
	}

	var opts []option.ClientOption
	if dataSource.Credentials != "" {
		opts = append(opts, option.WithCredentialsJSON([]byte(dataSource.Credentials)))
	}
	client, err := bigquery.NewClient(ctx, projectID, opts...)
	if err != nil {
		return fmt.Errorf("连接 BigQuery 失败: %w", err)
	}
	defer client.Close()

	// 开启 Storage Read API 加速；失败仅告警并回退到默认 REST 读取，不阻断抽取。
	// 注意：Storage 客户端是独立连接，必须把同样的凭证 opts 传进去，否则会去找
	// 默认凭证(ADC)而失败。
	storageEnabled := true
	if err := client.EnableStorageReadClient(ctx, opts...); err != nil {
		storageEnabled = false
		log.Printf("[extract] table=%s Storage Read API 启用失败，回退 REST（无加速）: %v", stagingName, err)
	}

	q := client.Query(query)
	it, err := q.Read(ctx)
	if err != nil {
		return fmt.Errorf("执行 BigQuery 查询失败: %w", err)
	}

	insertSQL := "" // 建表后填充
	var writer *ckBatchWriter
	schemaReady := false

	// ensureSchema 在拿到 schema 后建 staging 表并初始化批量写入器（幂等）。
	ensureSchema := func(schema bigquery.Schema) error {
		if schemaReady {
			return nil
		}
		if len(schema) == 0 {
			return fmt.Errorf("无法获取 BigQuery 结果结构")
		}
		if err := createClickHouseTableFromBQSchema(stagingName, schema); err != nil {
			return fmt.Errorf("建表失败: %w", err)
		}
		insertSQL = buildBQInsertSQL(stagingName, schema)
		writer = newCKBatchWriter(insertSQL)
		schemaReady = true
		return nil
	}

	var rowCount int64
	var row []bigquery.Value
	for {
		if err := ctx.Err(); err != nil {
			if writer != nil {
				writer.rollback()
			}
			return err
		}
		err := it.Next(&row)
		if err == iterator.Done {
			break
		}
		if err != nil {
			if writer != nil {
				writer.rollback()
			}
			return fmt.Errorf("读取 BigQuery 数据失败: %w", err)
		}
		// schema 在某些优化路径下首次 Next() 后才可用。
		if err := ensureSchema(it.Schema); err != nil {
			return err
		}
		args := make([]interface{}, len(it.Schema))
		for i, field := range it.Schema {
			var v bigquery.Value
			if i < len(row) {
				v = row[i]
			}
			args[i] = bqValueToCKValue(v, field)
		}
		if err := writer.add(args); err != nil {
			writer.rollback()
			return fmt.Errorf("写入数据失败: %w", err)
		}
		rowCount++
	}

	if !schemaReady {
		// 结果为空：仍按 schema 建空表，保证正式表存在、图表查询不报错。
		if err := ensureSchema(it.Schema); err != nil {
			return err
		}
	}

	if err := writer.flush(); err != nil {
		return fmt.Errorf("写入数据失败: %w", err)
	}

	// 显式记录本次抽取的读取通道，便于确认 Storage 加速是否真正生效：
	//   accelerated=true  → 走了 Storage Read API（Arrow 流，低 CPU）
	//   accelerated=false → 退回官方 REST 逐行读取。小结果集走 REST 属正常——官方 client
	//                       对小结果故意不建 ReadSession（固定开销不划算）；仅当结果集足够
	//                       大（超过 storageAccelExpectRows）却仍未加速，才可能是 Storage
	//                       未生效（readsessions 权限 / Storage API 开关），标 DEGRADED 需排查。
	accelerated := it.IsAccelerated()
	level := "OK"
	if storageEnabled && !accelerated && rowCount >= storageAccelExpectRows {
		level = "DEGRADED"
	}
	log.Printf("[extract] BigQuery 抽取完成 table=%s rows=%d storage_enabled=%v accelerated=%v [%s]",
		stagingName, rowCount, storageEnabled, accelerated, level)
	return nil
}

// buildBQInsertSQL 按 BQ schema 生成 staging 表的批量 INSERT 语句。
func buildBQInsertSQL(tableName string, schema bigquery.Schema) string {
	colNames := make([]string, len(schema))
	for i, f := range schema {
		colNames[i] = fmt.Sprintf("`%s`", f.Name)
	}
	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(schema)), ",")
	return fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)",
		tableName, strings.Join(colNames, ","), placeholders)
}

// createClickHouseTableFromBQSchema 依据 BigQuery schema 在 ClickHouse 建（重建）staging 表。
func createClickHouseTableFromBQSchema(tableName string, schema bigquery.Schema) error {
	ckDB := database.ClickHouseDB
	if _, err := ckDB.Exec(fmt.Sprintf("DROP TABLE IF EXISTS %s", tableName)); err != nil {
		return err
	}

	cols := make([]string, len(schema))
	for i, f := range schema {
		cols[i] = fmt.Sprintf("`%s` %s", f.Name, bqTypeToCKType(f))
	}
	createSQL := fmt.Sprintf(
		"CREATE TABLE %s (%s) ENGINE = MergeTree() ORDER BY tuple()",
		tableName, strings.Join(cols, ", "),
	)
	_, err := ckDB.Exec(createSQL)
	return err
}

// bqTypeToCKType 将 BigQuery 字段类型映射为 ClickHouse 类型。
// 数组（Repeated）与嵌套 RECORD 无对应标量类型，统一以 JSON 字符串存储。
func bqTypeToCKType(f *bigquery.FieldSchema) string {
	if f.Repeated || f.Type == bigquery.RecordFieldType {
		return "Nullable(String)"
	}
	switch f.Type {
	case bigquery.IntegerFieldType:
		return "Nullable(Int64)"
	case bigquery.FloatFieldType, bigquery.NumericFieldType, bigquery.BigNumericFieldType:
		return "Nullable(Float64)"
	case bigquery.BooleanFieldType:
		return "Nullable(UInt8)"
	case bigquery.TimestampFieldType, bigquery.DateTimeFieldType:
		return "Nullable(DateTime)"
	case bigquery.DateFieldType:
		return "Nullable(Date)"
	default: // STRING / BYTES / TIME / GEOGRAPHY / JSON 等
		return "Nullable(String)"
	}
}

// bqValueToCKValue 将 bigquery.Value 转换为 ClickHouse 驱动可接受的 Go 类型。
func bqValueToCKValue(v bigquery.Value, f *bigquery.FieldSchema) interface{} {
	if v == nil {
		return nil
	}
	// 数组或嵌套记录：JSON 序列化为字符串。
	if f.Repeated || f.Type == bigquery.RecordFieldType {
		b, err := json.Marshal(v)
		if err != nil {
			return fmt.Sprintf("%v", v)
		}
		return string(b)
	}
	switch val := v.(type) {
	case bool:
		if val {
			return uint8(1)
		}
		return uint8(0)
	case *big.Rat: // NUMERIC / BIGNUMERIC
		fl, _ := val.Float64()
		return fl
	case civil.Date:
		return val.In(time.UTC)
	case civil.DateTime:
		return val.In(time.UTC)
	case civil.Time:
		return val.String()
	case []byte:
		return string(val)
	default: // int64 / float64 / string / time.Time 直接透传
		return v
	}
}

// ckBatchWriter 分批提交写入 ClickHouse，避免单事务缓冲全部结果导致超时/撑爆内存。
// 每批一个独立事务，批大小复用 insertBatchSize。
type ckBatchWriter struct {
	insertSQL string
	tx        *sql.Tx
	stmt      *sql.Stmt
	n         int
}

func newCKBatchWriter(insertSQL string) *ckBatchWriter {
	return &ckBatchWriter{insertSQL: insertSQL}
}

func (w *ckBatchWriter) begin() error {
	tx, err := database.ClickHouseDB.Begin()
	if err != nil {
		return err
	}
	stmt, err := tx.Prepare(w.insertSQL)
	if err != nil {
		tx.Rollback()
		return err
	}
	w.tx, w.stmt = tx, stmt
	return nil
}

func (w *ckBatchWriter) add(args []interface{}) error {
	if w.tx == nil {
		if err := w.begin(); err != nil {
			return err
		}
	}
	if _, err := w.stmt.Exec(args...); err != nil {
		return err
	}
	w.n++
	if w.n >= insertBatchSize {
		return w.flush()
	}
	return nil
}

// flush 提交当前批次并重置状态；无待提交批次时为空操作。
func (w *ckBatchWriter) flush() error {
	if w.tx == nil {
		return nil
	}
	if w.stmt != nil {
		w.stmt.Close()
	}
	err := w.tx.Commit()
	w.tx, w.stmt, w.n = nil, nil, 0
	return err
}

// rollback 回滚当前未提交批次（错误路径）。
func (w *ckBatchWriter) rollback() {
	if w.stmt != nil {
		w.stmt.Close()
	}
	if w.tx != nil {
		w.tx.Rollback()
	}
	w.tx, w.stmt, w.n = nil, nil, 0
}
