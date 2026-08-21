package api

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"data-analysis-platform/internal/config"
	"data-analysis-platform/internal/database"
	"data-analysis-platform/internal/models"
)

// TestBQStorageExtractManual 手动集成测试：真实调用 BigQuery Storage Read 抽取路径。
// 仅在设置 RUN_BQ_EXTRACT_TEST=1 时运行，避免污染常规 go test。
//
//	CLICKHOUSE_HOST=... DATASET_ID=... LIMIT=100000 RUN_BQ_EXTRACT_TEST=1 \
//	  go test ./internal/api/ -run TestBQStorageExtractManual -v -timeout 20m
func TestBQStorageExtractManual(t *testing.T) {
	if os.Getenv("RUN_BQ_EXTRACT_TEST") != "1" {
		t.Skip("set RUN_BQ_EXTRACT_TEST=1 to run")
	}

	cfg, err := config.LoadConfig()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if err := database.InitDB(cfg); err != nil {
		t.Fatalf("init db: %v", err)
	}
	if err := database.InitClickHouse(cfg); err != nil {
		t.Fatalf("init clickhouse: %v", err)
	}
	if database.ClickHouseDB == nil {
		t.Fatal("clickhouse not connected")
	}

	datasetID := os.Getenv("DATASET_ID")
	if datasetID == "" {
		t.Fatal("DATASET_ID required")
	}
	var dataset models.Dataset
	if err := database.DB.First(&dataset, "id = ?", datasetID).Error; err != nil {
		t.Fatalf("load dataset: %v", err)
	}
	var ds models.DataSource
	if err := database.DB.First(&ds, "id = ?", dataset.DataSourceID).Error; err != nil {
		t.Fatalf("load datasource: %v", err)
	}
	if !isBigQuery(ds.Type) {
		t.Fatalf("dataset %s is not BigQuery (type=%s)", datasetID, ds.Type)
	}

	query := os.Getenv("QUERY")
	if query == "" {
		limit := os.Getenv("LIMIT")
		if limit == "" {
			limit = "1000"
		}
		query = fmt.Sprintf("SELECT * FROM (%s) AS _t LIMIT %s", dataset.SQL, limit)
	}
	t.Logf("query: %s", query)

	staging := "ds_test_bqstorage_staging"
	// 清理可能残留的测试表
	database.ClickHouseDB.Exec("DROP TABLE IF EXISTS " + staging)
	defer database.ClickHouseDB.Exec("DROP TABLE IF EXISTS " + staging)

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Minute)
	defer cancel()

	start := time.Now()
	if err := extractBigQueryToStaging(ctx, ds, query, staging); err != nil {
		t.Fatalf("extractBigQueryToStaging failed: %v", err)
	}
	elapsed := time.Since(start)

	// 校验：行数
	var count uint64
	if err := database.ClickHouseDB.QueryRow("SELECT count() FROM " + staging).Scan(&count); err != nil {
		t.Fatalf("count staging: %v", err)
	}
	t.Logf("✅ 抽取完成: %d 行, 耗时 %s", count, elapsed)

	// 校验：表结构（列名 + CK 类型）
	rows, err := database.ClickHouseDB.Query("DESCRIBE TABLE " + staging)
	if err != nil {
		t.Fatalf("describe: %v", err)
	}
	defer rows.Close()
	t.Log("列结构:")
	for rows.Next() {
		var name, typ, def, defExpr, comment, codec, ttl string
		// clickhouse DESCRIBE 返回多列，按位置扫描前两列，其余用占位
		if err := rows.Scan(&name, &typ, &def, &defExpr, &comment, &codec, &ttl); err != nil {
			// 列数因 CK 版本而异，退化为只扫前两列
			t.Logf("  (scan 部分失败: %v)", err)
			break
		}
		t.Logf("  %-30s %s", name, typ)
	}
}
