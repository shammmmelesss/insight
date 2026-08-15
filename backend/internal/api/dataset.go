package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"data-analysis-platform/internal/database"
	"data-analysis-platform/internal/models"
	"github.com/gin-gonic/gin"

	_ "github.com/go-sql-driver/mysql"
	_ "github.com/lib/pq"
	_ "github.com/microsoft/go-mssqldb"
	_ "github.com/oracle/oci-go-sdk/v65/database"
)

const queryTimeout = 30 * time.Second

var extractCancels sync.Map

// RegisterDatasetRoutes 注册数据集路由
func RegisterDatasetRoutes(rg *gin.RouterGroup) {
	dataset := rg.Group("/datasets")
	{
		dataset.GET("", ListDatasets)
		dataset.POST("", CreateDataset)
		dataset.GET("/:id", GetDataset)
		dataset.PUT("/:id", UpdateDataset)
		dataset.DELETE("/:id", DeleteDataset)
		dataset.GET("/select-list", GetDatasetSelectList)
		dataset.GET("/:id/fields", GetDatasetFields)
		dataset.GET("/:id/field-values", GetDatasetFieldValues)
		dataset.GET("/:id/charts", GetDatasetCharts)
		dataset.POST("/preview", PreviewDataset)
		dataset.POST("/:id/extract", TriggerExtract)
		dataset.POST("/:id/stop-extract", StopExtract)
		dataset.POST("/:id/clear-data", ClearExtractData)
	}
}

// datasetResponse 构建数据集响应
func datasetResponse(dataset models.Dataset) map[string]interface{} {
	var fieldsConfig []interface{}
	if err := json.Unmarshal([]byte(dataset.FieldsConfig), &fieldsConfig); err != nil {
		fieldsConfig = []interface{}{}
	}

	var extractSchedule map[string]interface{}
	scheduleStr := dataset.ExtractSchedule
	if scheduleStr == "" {
		scheduleStr = "{}"
	}
	if err := json.Unmarshal([]byte(scheduleStr), &extractSchedule); err != nil {
		extractSchedule = map[string]interface{}{}
	}

	var chartCount int64
	database.DB.Model(&models.Chart{}).Where("dataset_id = ?", dataset.ID).Count(&chartCount)

	datasetType := dataset.Type
	if datasetType == "" {
		datasetType = models.DatasetTypeDirect
	}

	extractStatus := dataset.ExtractStatus
	if extractStatus == "" {
		extractStatus = models.ExtractStatusIdle
	}

	return map[string]interface{}{
		"id":              dataset.ID,
		"name":            dataset.Name,
		"sql":             dataset.SQL,
		"description":     dataset.Description,
		"fieldsConfig":    fieldsConfig,
		"dataSourceId":    dataset.DataSourceID,
		"type":            datasetType,
		"extractSchedule": extractSchedule,
		"extractStatus":   extractStatus,
		"lastExtractAt":   dataset.LastExtractAt,
		"extractError":    dataset.ExtractError,
		"chartCount":      chartCount,
		"createdAt":       dataset.CreatedAt,
		"updatedAt":       dataset.UpdatedAt,
		"createdBy":       dataset.CreatedBy,
		"createdByName":   dataset.CreatedByName,
		"updatedBy":       dataset.UpdatedBy,
		"updatedByName":   dataset.UpdatedByName,
	}
}

// ListDatasets 获取数据集列表
func ListDatasets(c *gin.Context) {
	workspaceID := GetWorkspaceID(c)
	datasets := make([]models.Dataset, 0)
	query := database.DB
	if workspaceID != "" {
		query = query.Where("workspace_id = ?", workspaceID)
	}
	result := query.Find(&datasets)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	responseItems := make([]map[string]interface{}, 0)
	for _, ds := range datasets {
		responseItems = append(responseItems, datasetResponse(ds))
	}

	c.JSON(http.StatusOK, gin.H{
		"items":    responseItems,
		"total":    len(responseItems),
		"page":     1,
		"pageSize": len(responseItems),
	})
}

// CreateDataset 创建数据集
func CreateDataset(c *gin.Context) {
	var req struct {
		Name            string                 `json:"name" binding:"required"`
		SQL             string                 `json:"sql" binding:"required"`
		Description     string                 `json:"description"`
		FieldsConfig    []interface{}          `json:"fieldsConfig"`
		DataSourceId    string                 `json:"dataSourceId" binding:"required"`
		Type            models.DatasetType     `json:"type"`
		ExtractSchedule map[string]interface{} `json:"extractSchedule"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求参数错误: " + err.Error()})
		return
	}

	if req.FieldsConfig == nil {
		req.FieldsConfig = []interface{}{}
	}
	if req.Type == "" {
		req.Type = models.DatasetTypeDirect
	}
	if req.ExtractSchedule == nil {
		req.ExtractSchedule = map[string]interface{}{}
	}

	fieldsConfigJSON, err := json.Marshal(req.FieldsConfig)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "字段配置序列化失败: " + err.Error()})
		return
	}

	scheduleJSON, err := json.Marshal(req.ExtractSchedule)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "抽取计划序列化失败: " + err.Error()})
		return
	}

	dataset := models.Dataset{
		WorkspaceID:     GetWorkspaceID(c),
		Name:            req.Name,
		SQL:             req.SQL,
		Description:     req.Description,
		FieldsConfig:    string(fieldsConfigJSON),
		DataSourceID:    req.DataSourceId,
		Type:            req.Type,
		ExtractSchedule: string(scheduleJSON),
	}
	setCreator(c, &dataset.AuditFields)

	result := database.DB.Create(&dataset)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建数据集失败: " + result.Error.Error()})
		return
	}

	c.JSON(http.StatusCreated, datasetResponse(dataset))
}

// GetDataset 获取数据集详情
func GetDataset(c *gin.Context) {
	id := c.Param("id")
	var dataset models.Dataset
	result := database.DB.First(&dataset, "id = ?", id)
	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Dataset not found"})
		return
	}

	c.JSON(http.StatusOK, datasetResponse(dataset))
}

// UpdateDataset 更新数据集
func UpdateDataset(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Name            string                 `json:"name" binding:"required"`
		SQL             string                 `json:"sql" binding:"required"`
		Description     string                 `json:"description"`
		FieldsConfig    []interface{}          `json:"fieldsConfig"`
		DataSourceId    string                 `json:"dataSourceId" binding:"required"`
		Type            models.DatasetType     `json:"type"`
		ExtractSchedule map[string]interface{} `json:"extractSchedule"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求参数错误: " + err.Error()})
		return
	}

	if req.Type == "" {
		req.Type = models.DatasetTypeDirect
	}
	if req.ExtractSchedule == nil {
		req.ExtractSchedule = map[string]interface{}{}
	}

	var dataset models.Dataset
	result := database.DB.First(&dataset, "id = ?", id)
	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "数据集不存在: " + result.Error.Error()})
		return
	}

	if !canModify(dataset.CreatedBy, c) {
		abortForbidden(c, "只有创建人才能修改此数据集")
		return
	}

	fieldsConfigJSON, err := json.Marshal(req.FieldsConfig)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "字段配置序列化失败: " + err.Error()})
		return
	}

	scheduleJSON, err := json.Marshal(req.ExtractSchedule)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "抽取计划序列化失败: " + err.Error()})
		return
	}

	dataset.Name = req.Name
	dataset.SQL = req.SQL
	dataset.Description = req.Description
	dataset.FieldsConfig = string(fieldsConfigJSON)
	dataset.DataSourceID = req.DataSourceId
	dataset.Type = req.Type
	dataset.ExtractSchedule = string(scheduleJSON)
	setUpdater(c, &dataset.AuditFields)

	result = database.DB.Save(&dataset)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "更新数据集失败: " + result.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, datasetResponse(dataset))
}

// DeleteDataset 删除数据集
func DeleteDataset(c *gin.Context) {
	id := c.Param("id")

	var dataset models.Dataset
	if err := database.DB.First(&dataset, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "数据集不存在"})
		return
	}
	if !canModify(dataset.CreatedBy, c) {
		abortForbidden(c, "只有创建人才能删除此数据集")
		return
	}

	result := database.DB.Delete(&models.Dataset{}, "id = ?", id)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// GetDatasetSelectList 获取数据集下拉列表
func GetDatasetSelectList(c *gin.Context) {
	workspaceID := GetWorkspaceID(c)
	datasets := make([]models.Dataset, 0)
	query := database.DB.Select("id, name")
	if workspaceID != "" {
		query = query.Where("workspace_id = ?", workspaceID)
	}
	result := query.Find(&datasets)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	options := make([]map[string]interface{}, 0)
	for _, dataset := range datasets {
		options = append(options, map[string]interface{}{
			"id":   dataset.ID.String(),
			"name": dataset.Name,
		})
	}

	c.JSON(http.StatusOK, gin.H{"items": options})
}

// GetDatasetFields 获取数据集字段列表
func GetDatasetFields(c *gin.Context) {
	id := c.Param("id")
	var dataset models.Dataset
	result := database.DB.First(&dataset, "id = ?", id)
	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "数据集不存在"})
		return
	}

	// 尝试从数据库查询获取所有字段
	var fieldsFromDB []map[string]interface{}
	var dataSource models.DataSource
	dsResult := database.DB.First(&dataSource, "id = ?", dataset.DataSourceID)
	if dsResult.Error == nil {
		db, err := connectToDataSource(dataSource)
		if err == nil {
			defer db.Close()

			schemaSQL := fmt.Sprintf("SELECT * FROM (%s) AS _schema LIMIT 1", dataset.SQL)
			ctx, cancel := context.WithTimeout(c.Request.Context(), queryTimeout)
			defer cancel()
			rows, err := db.QueryContext(ctx, schemaSQL)
			if err == nil {
				defer rows.Close()

				columnTypes, err := rows.ColumnTypes()
				if err == nil {
					for _, colType := range columnTypes {
						fieldsFromDB = append(fieldsFromDB, map[string]interface{}{
							"id":   colType.Name(),
							"name": colType.Name(),
							"type": colType.DatabaseTypeName(),
						})
					}
				}
			}
		}
	}

	// 从FieldsConfig获取字段信息
	var fieldsConfig []map[string]interface{}
	if err := json.Unmarshal([]byte(dataset.FieldsConfig), &fieldsConfig); err != nil {
		fieldsConfig = []map[string]interface{}{}
	}

	// 构建 originalName -> displayName 映射
	displayNameMap := make(map[string]string)
	for _, field := range fieldsConfig {
		origName, _ := field["originalName"].(string)
		if origName == "" {
			continue
		}
		if dispName, ok := field["displayName"].(string); ok {
			displayNameMap[origName] = dispName
		}
	}

	items := make([]map[string]interface{}, 0)
	for i, field := range fieldsFromDB {
		colName, _ := field["name"].(string)
		displayName := displayNameMap[colName]
		if displayName == "" {
			displayName = colName
		}
		item := map[string]interface{}{
			"id":          field["id"],
			"name":        field["name"],
			"displayName": displayName,
			"type":        field["type"],
			"index":       i,
		}
		items = append(items, item)
	}

	if len(items) == 0 {
		for i, field := range fieldsConfig {
			origName, _ := field["originalName"].(string)
			if origName == "" {
				origName, _ = field["name"].(string)
			}
			displayName := displayNameMap[origName]
			if displayName == "" {
				if dn, ok := field["displayName"].(string); ok {
					displayName = dn
				}
			}
			if displayName == "" {
				displayName = origName
			}
			item := map[string]interface{}{
				"id":          origName,
				"name":        origName,
				"displayName": displayName,
			}
			if id, ok := field["id"]; ok {
				item["id"] = id
			}
			if _, ok := field["type"]; ok {
				item["type"] = field["type"]
			}
			item["index"] = i
			items = append(items, item)
		}
	}

	c.JSON(http.StatusOK, gin.H{"items": items})
}

// GetDatasetFieldValues 获取数据集字段的真实值列表
func GetDatasetFieldValues(c *gin.Context) {
	id := c.Param("id")
	fieldName := c.Query("field")
	if fieldName == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 field 参数"})
		return
	}

	// 校验字段名防止SQL注入
	if !isValidIdentifier(fieldName) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "非法字段名"})
		return
	}

	var dataset models.Dataset
	if err := database.DB.First(&dataset, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "数据集不存在"})
		return
	}

	// 计算字段：从 FieldsConfig 找到其表达式，用表达式替代字段名查询
	queryExpr := fieldName
	var fieldsConfig []map[string]interface{}
	if err := json.Unmarshal([]byte(dataset.FieldsConfig), &fieldsConfig); err == nil {
		for _, field := range fieldsConfig {
			origName, _ := field["originalName"].(string)
			if origName != fieldName {
				continue
			}
			isCalc, _ := field["isCalculated"].(bool)
			expr, _ := field["expression"].(string)
			if isCalc && expr != "" {
				if !isValidExpression(expr) {
					c.JSON(http.StatusBadRequest, gin.H{"error": "非法的计算字段表达式"})
					return
				}
				queryExpr = expr
			}
			break
		}
	}

	alias := sanitizeAlias(fieldName)
	selectExpr := queryExpr
	if queryExpr != fieldName {
		selectExpr = fmt.Sprintf("%s AS %s", queryExpr, alias)
	}

	var db *sql.DB
	var query string

	if dataset.Type == models.DatasetTypeExtract {
		if database.ClickHouseDB == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "ClickHouse 未连接"})
			return
		}
		if dataset.ExtractStatus != models.ExtractStatusSuccess {
			c.JSON(http.StatusBadRequest, gin.H{"error": "数据尚未抽取成功，请先执行抽取"})
			return
		}
		ckTable := "ds_" + strings.ReplaceAll(dataset.ID.String(), "-", "_")
		ckSQL := fmt.Sprintf("SELECT * FROM %s", ckTable)
		query = fmt.Sprintf("SELECT %s FROM (%s) AS dataset GROUP BY %s ORDER BY %s LIMIT 1000",
			selectExpr, ckSQL, queryExpr, queryExpr)
		db = database.ClickHouseDB
	} else {
		var dataSource models.DataSource
		if err := database.DB.First(&dataSource, "id = ?", dataset.DataSourceID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "数据源不存在"})
			return
		}
		var err error
		db, err = connectToDataSource(dataSource)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "连接数据源失败: " + err.Error()})
			return
		}
		defer db.Close()
		query = fmt.Sprintf("SELECT %s FROM (%s) AS dataset WHERE 1=1 GROUP BY %s ORDER BY %s LIMIT 1000",
			selectExpr, dataset.SQL, queryExpr, queryExpr)
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), queryTimeout)
	defer cancel()
	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询字段值失败: " + err.Error()})
		return
	}
	defer rows.Close()

	columnTypes, err := rows.ColumnTypes()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取列信息失败: " + err.Error()})
		return
	}
	var dbTypeName string
	if len(columnTypes) > 0 {
		dbTypeName = strings.ToUpper(columnTypes[0].DatabaseTypeName())
	}

	var values []interface{}
	for rows.Next() {
		var val interface{}
		if err := rows.Scan(&val); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "解析字段值失败: " + err.Error()})
			return
		}
		if b, ok := val.([]byte); ok {
			values = append(values, string(b))
		} else if t, ok := toTime(val); ok {
			if strings.Contains(dbTypeName, "DATETIME") || strings.Contains(dbTypeName, "TIMESTAMP") {
				values = append(values, t.Format("2006-01-02 15:04:05"))
			} else {
				values = append(values, t.Format("2006-01-02"))
			}
		} else {
			values = append(values, val)
		}
	}

	c.JSON(http.StatusOK, gin.H{"values": values})
}

// PreviewDataset 预览数据集SQL查询结果
func PreviewDataset(c *gin.Context) {
	var req struct {
		SQL          string `json:"sql" binding:"required"`
		DataSourceId string `json:"dataSourceId"`
		DatasetId    string `json:"datasetId"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求参数错误: " + err.Error()})
		return
	}

	// 抽取类型数据集直接查 ClickHouse
	if req.DatasetId != "" {
		var ds models.Dataset
		if err := database.DB.First(&ds, "id = ?", req.DatasetId).Error; err == nil &&
			ds.Type == models.DatasetTypeExtract {
			if database.ClickHouseDB == nil {
				c.JSON(http.StatusServiceUnavailable, gin.H{"error": "ClickHouse 未连接"})
				return
			}
			execPreviewQuery(c, database.ClickHouseDB, req.SQL)
			return
		}
	}

	if req.DataSourceId == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求参数错误: dataSourceId 不能为空"})
		return
	}

	var dataSource models.DataSource
	result := database.DB.First(&dataSource, "id = ?", req.DataSourceId)
	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "数据源不存在: " + result.Error.Error()})
		return
	}

	db, err := connectToDataSource(dataSource)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "连接数据源失败: " + err.Error()})
		return
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "数据库连接测试失败: " + err.Error()})
		return
	}
	execPreviewQuery(c, db, req.SQL)
}

func execPreviewQuery(c *gin.Context, db *sql.DB, querySQL string) {
	ctx, cancel := context.WithTimeout(c.Request.Context(), queryTimeout)
	defer cancel()

	rows, err := db.QueryContext(ctx, querySQL)
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			c.JSON(http.StatusRequestTimeout, gin.H{"error": "查询超时，请优化SQL或缩小数据范围"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "执行SQL失败: " + err.Error()})
		return
	}
	defer rows.Close()

	columnTypes, err := rows.ColumnTypes()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取列信息失败: " + err.Error()})
		return
	}

	var columns []map[string]interface{}
	for _, colType := range columnTypes {
		columns = append(columns, map[string]interface{}{
			"name": colType.Name(),
			"type": colType.DatabaseTypeName(),
		})
	}

	var resultData []map[string]interface{}
	columnNames := make([]string, len(columnTypes))
	columnPointers := make([]interface{}, len(columnTypes))
	for i, colType := range columnTypes {
		columnNames[i] = colType.Name()
		columnPointers[i] = new(interface{})
	}

	for rows.Next() {
		if err := rows.Scan(columnPointers...); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "解析查询结果失败: " + err.Error()})
			return
		}

		row := make(map[string]interface{})
		for i, colName := range columnNames {
			val := *(columnPointers[i].(*interface{}))
			if b, ok := val.([]byte); ok {
				s := string(b)
				if intVal, err := strconv.ParseInt(s, 10, 64); err == nil {
					row[colName] = intVal
				} else if floatVal, err := strconv.ParseFloat(s, 64); err == nil {
					row[colName] = floatVal
				} else {
					row[colName] = s
				}
			} else if t, ok := toTime(val); ok {
				dbTypeName := strings.ToUpper(columnTypes[i].DatabaseTypeName())
				if strings.Contains(dbTypeName, "DATETIME") || strings.Contains(dbTypeName, "TIMESTAMP") {
					row[colName] = t.Format("2006-01-02 15:04:05")
				} else {
					row[colName] = t.Format("2006-01-02")
				}
			} else {
				row[colName] = val
			}
		}
		resultData = append(resultData, row)
	}

	if err := rows.Err(); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "处理查询结果失败: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"data":    resultData,
		"columns": columns,
	})
}

// GetDatasetCharts 获取使用特定数据集的图表列表
func GetDatasetCharts(c *gin.Context) {
	id := c.Param("id")
	var charts []models.Chart
	result := database.DB.Where("dataset_id = ?", id).Find(&charts)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"items": charts, "total": len(charts)})
}

// TriggerExtract 手动触发数据集抽取到 ClickHouse
func TriggerExtract(c *gin.Context) {
	id := c.Param("id")

	var dataset models.Dataset
	if err := database.DB.First(&dataset, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "数据集不存在"})
		return
	}
	if dataset.Type != models.DatasetTypeExtract {
		c.JSON(http.StatusBadRequest, gin.H{"error": "仅抽取类型数据集支持此操作"})
		return
	}
	if database.ClickHouseDB == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "ClickHouse 未连接，请检查配置"})
		return
	}
	if dataset.ExtractStatus == models.ExtractStatusRunning {
		c.JSON(http.StatusConflict, gin.H{"error": "抽取任务正在进行中，请稍后再试"})
		return
	}

	// 标记为运行中
	database.DB.Model(&dataset).Updates(map[string]interface{}{
		"extract_status": models.ExtractStatusRunning,
		"extract_error":  "",
	})

	ctx, cancel := context.WithCancel(context.Background())
	extractCancels.Store(dataset.ID.String(), cancel)

	// 异步执行抽取
	go func() {
		defer func() {
			extractCancels.Delete(dataset.ID.String())
			cancel()
		}()
		err := doExtract(ctx, dataset)
		now := time.Now()
		if err != nil {
			errMsg := err.Error()
			if ctx.Err() != nil {
				errMsg = "已手动停止"
			}
			database.DB.Model(&dataset).Updates(map[string]interface{}{
				"extract_status":  models.ExtractStatusFailed,
				"extract_error":   errMsg,
				"last_extract_at": now,
			})
		} else {
			database.DB.Model(&dataset).Updates(map[string]interface{}{
				"extract_status":  models.ExtractStatusSuccess,
				"extract_error":   "",
				"last_extract_at": now,
			})
		}
	}()

	c.JSON(http.StatusOK, gin.H{"message": "抽取任务已启动"})
}

// doExtract 执行数据抽取：从源数据库读取并写入 ClickHouse
func doExtract(ctx context.Context, dataset models.Dataset) error {
	var dataSource models.DataSource
	if err := database.DB.First(&dataSource, "id = ?", dataset.DataSourceID).Error; err != nil {
		return fmt.Errorf("数据源不存在: %w", err)
	}

	srcDB, err := connectToDataSource(dataSource)
	if err != nil {
		return fmt.Errorf("连接数据源失败: %w", err)
	}
	defer srcDB.Close()

	rows, err := srcDB.QueryContext(ctx, dataset.SQL)
	if err != nil {
		return fmt.Errorf("执行 SQL 失败: %w", err)
	}
	defer rows.Close()

	colTypes, err := rows.ColumnTypes()
	if err != nil {
		return fmt.Errorf("获取列信息失败: %w", err)
	}

	tableName := "ds_" + strings.ReplaceAll(dataset.ID.String(), "-", "_")

	if err := ctx.Err(); err != nil {
		return err
	}

	// 建表 DDL
	if err := createClickHouseTable(tableName, colTypes); err != nil {
		return fmt.Errorf("建表失败: %w", err)
	}

	// 批量写入
	if err := insertRows(ctx, tableName, colTypes, rows); err != nil {
		return fmt.Errorf("写入数据失败: %w", err)
	}

	return nil
}

// StopExtract 停止正在运行的抽取任务
func StopExtract(c *gin.Context) {
	id := c.Param("id")

	var dataset models.Dataset
	if err := database.DB.First(&dataset, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "数据集不存在"})
		return
	}
	if dataset.ExtractStatus != models.ExtractStatusRunning {
		c.JSON(http.StatusBadRequest, gin.H{"error": "当前没有正在运行的抽取任务"})
		return
	}

	if cancelVal, ok := extractCancels.Load(id); ok {
		cancelVal.(context.CancelFunc)()
	}

	now := time.Now()
	database.DB.Model(&dataset).Updates(map[string]interface{}{
		"extract_status":  models.ExtractStatusFailed,
		"extract_error":   "已手动停止",
		"last_extract_at": now,
	})

	c.JSON(http.StatusOK, gin.H{"message": "抽取任务已停止"})
}

// ClearExtractData 清空数据集在 ClickHouse 中的数据并重置抽取状态
func ClearExtractData(c *gin.Context) {
	id := c.Param("id")

	var dataset models.Dataset
	if err := database.DB.First(&dataset, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "数据集不存在"})
		return
	}
	if dataset.Type != models.DatasetTypeExtract {
		c.JSON(http.StatusBadRequest, gin.H{"error": "仅抽取类型数据集支持此操作"})
		return
	}
	if dataset.ExtractStatus == models.ExtractStatusRunning {
		c.JSON(http.StatusConflict, gin.H{"error": "抽取任务正在进行中，请先停止后再清空"})
		return
	}

	if database.ClickHouseDB != nil {
		tableName := "ds_" + strings.ReplaceAll(id, "-", "_")
		dropSQL := fmt.Sprintf("DROP TABLE IF EXISTS %s", tableName)
		if _, err := database.ClickHouseDB.Exec(dropSQL); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "清空数据失败: " + err.Error()})
			return
		}
	}

	database.DB.Model(&dataset).Updates(map[string]interface{}{
		"extract_status":  models.ExtractStatusIdle,
		"extract_error":   "",
		"last_extract_at": nil,
	})

	c.JSON(http.StatusOK, gin.H{"message": "数据已清空"})
}

// createClickHouseTable 在 ClickHouse 中创建（或重建）目标表
func createClickHouseTable(tableName string, colTypes []*sql.ColumnType) error {
	ckDB := database.ClickHouseDB

	dropSQL := fmt.Sprintf("DROP TABLE IF EXISTS %s", tableName)
	if _, err := ckDB.Exec(dropSQL); err != nil {
		return err
	}

	var cols []string
	for _, ct := range colTypes {
		ckType := mapToCKType(ct.DatabaseTypeName())
		cols = append(cols, fmt.Sprintf("`%s` %s", ct.Name(), ckType))
	}

	createSQL := fmt.Sprintf(
		"CREATE TABLE %s (%s) ENGINE = MergeTree() ORDER BY tuple()",
		tableName,
		strings.Join(cols, ", "),
	)
	_, err := ckDB.Exec(createSQL)
	return err
}

// insertRows 将查询结果批量插入 ClickHouse
func insertRows(ctx context.Context, tableName string, colTypes []*sql.ColumnType, rows *sql.Rows) error {
	ckDB := database.ClickHouseDB
	colNames := make([]string, len(colTypes))
	for i, ct := range colTypes {
		colNames[i] = fmt.Sprintf("`%s`", ct.Name())
	}

	placeholders := strings.Repeat("?,", len(colTypes))
	placeholders = placeholders[:len(placeholders)-1]
	insertSQL := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)",
		tableName, strings.Join(colNames, ","), placeholders)

	tx, err := ckDB.Begin()
	if err != nil {
		return err
	}
	stmt, err := tx.Prepare(insertSQL)
	if err != nil {
		tx.Rollback()
		return err
	}
	defer stmt.Close()

	vals := make([]interface{}, len(colTypes))
	ptrs := make([]interface{}, len(colTypes))
	for i := range vals {
		ptrs[i] = &vals[i]
	}

	for rows.Next() {
		if ctx.Err() != nil {
			tx.Rollback()
			return ctx.Err()
		}
		if err := rows.Scan(ptrs...); err != nil {
			tx.Rollback()
			return err
		}
		args := make([]interface{}, len(vals))
		for i, v := range vals {
			if b, ok := v.([]byte); ok {
				args[i] = convertBytesToCKValue(string(b), colTypes[i].DatabaseTypeName())
			} else {
				args[i] = v
			}
		}
		if _, err := stmt.Exec(args...); err != nil {
			tx.Rollback()
			return err
		}
	}

	return tx.Commit()
}

// convertBytesToCKValue 将源库 []byte 值按目标 CK 类型转换为合适的 Go 类型
func convertBytesToCKValue(s string, dbType string) interface{} {
	t := strings.ToUpper(dbType)
	switch {
	case strings.Contains(t, "BIGINT"):
		if n, err := strconv.ParseInt(s, 10, 64); err == nil {
			return n
		}
	case strings.Contains(t, "INT"):
		if n, err := strconv.ParseInt(s, 10, 64); err == nil {
			return int32(n)
		}
	case strings.Contains(t, "FLOAT"), strings.Contains(t, "DOUBLE"),
		strings.Contains(t, "DECIMAL"), strings.Contains(t, "NUMERIC"),
		strings.Contains(t, "REAL"):
		if f, err := strconv.ParseFloat(s, 64); err == nil {
			return f
		}
	case strings.Contains(t, "BOOL"):
		if b, err := strconv.ParseBool(s); err == nil {
			if b {
				return uint8(1)
			}
			return uint8(0)
		}
	}
	return s
}

// mapToCKType 将源库字段类型映射为 ClickHouse 类型
func mapToCKType(dbType string) string {
	t := strings.ToUpper(dbType)
	switch {
	case strings.Contains(t, "BIGINT"):
		return "Nullable(Int64)"
	case strings.Contains(t, "INT"):
		return "Nullable(Int32)"
	case strings.Contains(t, "FLOAT"), strings.Contains(t, "DOUBLE"),
		strings.Contains(t, "DECIMAL"), strings.Contains(t, "NUMERIC"),
		strings.Contains(t, "REAL"):
		return "Nullable(Float64)"
	case strings.Contains(t, "BOOL"):
		return "Nullable(UInt8)"
	case strings.Contains(t, "DATETIME"), strings.Contains(t, "TIMESTAMP"):
		return "Nullable(DateTime)"
	case strings.Contains(t, "DATE"):
		return "Nullable(Date)"
	default:
		return "Nullable(String)"
	}
}

// StartExtractScheduler 每分钟检查一次，触发到点的抽取任务
func StartExtractScheduler() {
	go func() {
		for {
			now := time.Now()
			next := now.Truncate(time.Minute).Add(time.Minute)
			time.Sleep(time.Until(next))

			func() {
				defer func() {
					if r := recover(); r != nil {
						log.Printf("[scheduler] extract scheduler panic recovered: %v", r)
					}
				}()
				runScheduledExtracts()
			}()
		}
	}()
}

func runScheduledExtracts() {
	if database.ClickHouseDB == nil {
		return
	}

	var datasets []models.Dataset
	if err := database.DB.Where("type = ?", models.DatasetTypeExtract).Find(&datasets).Error; err != nil {
		log.Printf("[scheduler] failed to query extract datasets: %v", err)
		return
	}

	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		log.Printf("[scheduler] failed to load timezone Asia/Shanghai: %v, falling back to UTC", err)
		loc = time.UTC
	}
	now := time.Now().In(loc)
	currentTime := fmt.Sprintf("%02d:%02d", now.Hour(), now.Minute())
	currentWeekday := int(now.Weekday())
	currentDay := now.Day()

	for _, ds := range datasets {
		if ds.ExtractSchedule == "" || ds.ExtractSchedule == "{}" || ds.ExtractSchedule == "null" {
			continue
		}
		var schedule struct {
			Frequency string `json:"frequency"`
			Time      string `json:"time"`
			Weekday   *int   `json:"weekday"`
			Day       *int   `json:"day"`
		}
		if err := json.Unmarshal([]byte(ds.ExtractSchedule), &schedule); err != nil {
			log.Printf("[scheduler] failed to parse schedule for dataset %s: %v (schedule=%q)", ds.ID, err, ds.ExtractSchedule)
			continue
		}
		if schedule.Time != currentTime {
			continue
		}
		switch schedule.Frequency {
		case "daily":
			// 每天到点就触发
		case "weekly":
			if schedule.Weekday == nil || *schedule.Weekday != currentWeekday {
				continue
			}
		case "monthly":
			if schedule.Day == nil || *schedule.Day != currentDay {
				continue
			}
		default:
			log.Printf("[scheduler] unknown frequency %q for dataset %s", schedule.Frequency, ds.ID)
			continue
		}
		if ds.ExtractStatus == models.ExtractStatusRunning {
			log.Printf("[scheduler] dataset %s is already running, skipping", ds.ID)
			continue
		}

		log.Printf("[scheduler] triggering extract for dataset %s (%s) at %s", ds.ID, ds.Name, currentTime)
		dataset := ds
		database.DB.Model(&dataset).Updates(map[string]interface{}{
			"extract_status": models.ExtractStatusRunning,
			"extract_error":  "",
		})
		ctx, cancel := context.WithCancel(context.Background())
		extractCancels.Store(dataset.ID.String(), cancel)
		go func() {
			defer func() {
				extractCancels.Delete(dataset.ID.String())
				cancel()
			}()
			err := doExtract(ctx, dataset)
			t := time.Now()
			if err != nil {
				errMsg := err.Error()
				if ctx.Err() != nil {
					errMsg = "已手动停止"
				}
				database.DB.Model(&dataset).Updates(map[string]interface{}{
					"extract_status":  models.ExtractStatusFailed,
					"extract_error":   errMsg,
					"last_extract_at": t,
				})
				log.Printf("[scheduler] extract failed for dataset %s: %v", dataset.ID, err)
			} else {
				database.DB.Model(&dataset).Updates(map[string]interface{}{
					"extract_status":  models.ExtractStatusSuccess,
					"extract_error":   "",
					"last_extract_at": t,
				})
				log.Printf("[scheduler] extract succeeded for dataset %s", dataset.ID)
			}
		}()
	}
}
