package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"data-analysis-platform/internal/database"
	"data-analysis-platform/internal/models"

	_ "github.com/go-sql-driver/mysql"
	_ "github.com/lib/pq"
	_ "github.com/microsoft/go-mssqldb"
	_ "github.com/oracle/oci-go-sdk/v65/database"
)

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
	}
}

// datasetResponse 构建数据集响应
func datasetResponse(dataset models.Dataset) map[string]interface{} {
	var fieldsConfig []interface{}
	if err := json.Unmarshal([]byte(dataset.FieldsConfig), &fieldsConfig); err != nil {
		fieldsConfig = []interface{}{}
	}

	var chartCount int64
	database.DB.Model(&models.Chart{}).Where("dataset_id = ?", dataset.ID).Count(&chartCount)

	return map[string]interface{}{
		"id":           dataset.ID,
		"name":         dataset.Name,
		"sql":          dataset.SQL,
		"description":  dataset.Description,
		"fieldsConfig": fieldsConfig,
		"dataSourceId": dataset.DataSourceID,
		"chartCount":   chartCount,
		"createdAt":    dataset.CreatedAt,
		"updatedAt":    dataset.UpdatedAt,
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
		Name         string        `json:"name" binding:"required"`
		SQL          string        `json:"sql" binding:"required"`
		Description  string        `json:"description"`
		FieldsConfig []interface{} `json:"fieldsConfig"`
		DataSourceId string        `json:"dataSourceId" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求参数错误: " + err.Error()})
		return
	}

	if req.FieldsConfig == nil {
		req.FieldsConfig = []interface{}{}
	}

	fieldsConfigJSON, err := json.Marshal(req.FieldsConfig)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "字段配置序列化失败: " + err.Error()})
		return
	}

	dataset := models.Dataset{
		WorkspaceID:  GetWorkspaceID(c),
		Name:         req.Name,
		SQL:          req.SQL,
		Description:  req.Description,
		FieldsConfig: string(fieldsConfigJSON),
		DataSourceID: req.DataSourceId,
	}

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
		Name         string        `json:"name" binding:"required"`
		SQL          string        `json:"sql" binding:"required"`
		Description  string        `json:"description"`
		FieldsConfig []interface{} `json:"fieldsConfig"`
		DataSourceId string        `json:"dataSourceId" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求参数错误: " + err.Error()})
		return
	}

	var dataset models.Dataset
	result := database.DB.First(&dataset, "id = ?", id)
	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "数据集不存在: " + result.Error.Error()})
		return
	}

	fieldsConfigJSON, err := json.Marshal(req.FieldsConfig)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "字段配置序列化失败: " + err.Error()})
		return
	}

	dataset.Name = req.Name
	dataset.SQL = req.SQL
	dataset.Description = req.Description
	dataset.FieldsConfig = string(fieldsConfigJSON)
	dataset.DataSourceID = req.DataSourceId

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

			sql := dataset.SQL
			if !strings.Contains(strings.ToUpper(sql), "LIMIT") {
				sql += " LIMIT 1"
			}
			rows, err := db.Query(sql)
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

	items := make([]map[string]interface{}, 0)
	for i, field := range fieldsFromDB {
		item := map[string]interface{}{
			"id":    field["id"],
			"name":  field["name"],
			"type":  field["type"],
			"index": i,
		}
		items = append(items, item)
	}

	if len(items) == 0 {
		for i, field := range fieldsConfig {
			item := map[string]interface{}{
				"id":   field["name"],
				"name": field["name"],
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

	var dataSource models.DataSource
	if err := database.DB.First(&dataSource, "id = ?", dataset.DataSourceID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "数据源不存在"})
		return
	}

	db, err := connectToDataSource(dataSource)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "连接数据源失败: " + err.Error()})
		return
	}
	defer db.Close()

	query := fmt.Sprintf("SELECT %s FROM (%s) AS dataset WHERE 1=1 GROUP BY %s ORDER BY %s",
		fieldName, dataset.SQL, fieldName, fieldName)

	rows, err := db.Query(query)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询字段值失败: " + err.Error()})
		return
	}
	defer rows.Close()

	var values []interface{}
	for rows.Next() {
		var val interface{}
		if err := rows.Scan(&val); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "解析字段值失败: " + err.Error()})
			return
		}
		if b, ok := val.([]byte); ok {
			values = append(values, string(b))
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
		DataSourceId string `json:"dataSourceId" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求参数错误: " + err.Error()})
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

	rows, err := db.Query(req.SQL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "执行SQL失败: " + err.Error() + ", SQL: " + req.SQL})
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
