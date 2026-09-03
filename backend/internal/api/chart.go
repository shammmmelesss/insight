package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"data-analysis-platform/internal/database"
	"data-analysis-platform/internal/models"

	"github.com/gin-gonic/gin"
)

// RegisterChartRoutes 注册图表路由
func RegisterChartRoutes(rg *gin.RouterGroup) {
	chart := rg.Group("/charts")
	{
		chart.GET("", ListCharts)
		chart.POST("", CreateChart)
		chart.GET("/:id", GetChart)
		chart.PUT("/:id", UpdateChart)
		chart.DELETE("/:id", DeleteChart)
		chart.GET("/select-list", GetChartSelectList)
		chart.GET("/:id/data", GetChartData)
		chart.POST("/:id/preview", PreviewChartData)
		chart.GET("/:id/dashboards", GetChartDashboards)
		chart.POST("/:id/copy", CopyChart)
	}
}

// chartDashboardCount 统计引用该图表的看板数量
func chartDashboardCount(chartID string) int64 {
	var count int64
	if err := database.DB.Raw(
		`SELECT COUNT(*) FROM dashboards WHERE layout @> CAST(? AS jsonb)`,
		fmt.Sprintf(`[{"chartId":"%s"}]`, chartID),
	).Scan(&count).Error; err != nil {
		log.Printf("chartDashboardCount query failed for chart %s: %v", chartID, err)
		return 0
	}
	return count
}

// chartResponse 构建图表响应（含看板数量）
func chartResponse(chart models.Chart) map[string]interface{} {
	return map[string]interface{}{
		"id":             chart.ID,
		"name":           chart.Name,
		"datasetId":      chart.DatasetID,
		"type":           chart.Type,
		"config":         chart.Config,
		"workspaceId":    chart.WorkspaceID,
		"createdAt":      chart.CreatedAt,
		"updatedAt":      chart.UpdatedAt,
		"createdBy":      chart.CreatedBy,
		"createdByName":  chart.CreatedByName,
		"updatedBy":      chart.UpdatedBy,
		"updatedByName":  chart.UpdatedByName,
		"dashboardCount": chartDashboardCount(chart.ID.String()),
	}
}

// ListCharts 获取图表列表
func ListCharts(c *gin.Context) {
	workspaceID := GetWorkspaceID(c)
	charts := make([]models.Chart, 0)
	query := database.DB
	if workspaceID != "" {
		query = query.Where("workspace_id = ?", workspaceID)
	}
	result := query.Find(&charts)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	items := make([]map[string]interface{}, 0, len(charts))
	for _, chart := range charts {
		items = append(items, chartResponse(chart))
	}

	c.JSON(http.StatusOK, gin.H{
		"items":    items,
		"total":    len(items),
		"page":     1,
		"pageSize": len(items),
	})
}

// GetChartDashboards 获取引用该图表的看板列表
func GetChartDashboards(c *gin.Context) {
	id := c.Param("id")
	var dashboards []models.Dashboard
	result := database.DB.Raw(
		`SELECT * FROM dashboards WHERE layout @> CAST(? AS jsonb)`,
		fmt.Sprintf(`[{"chartId":"%s"}]`, id),
	).Scan(&dashboards)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": dashboards, "total": len(dashboards)})
}

// CreateChart 创建图表
func CreateChart(c *gin.Context) {
	var req struct {
		Name      string `json:"name" binding:"required"`
		DatasetID string `json:"datasetId" binding:"required"`
		Type      string `json:"type" binding:"required"`
		Config    string `json:"config"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// 验证图表类型
	chartType := models.ChartType(req.Type)
	if !isValidChartType(chartType) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid chart type"})
		return
	}

	datasetUUID, err := parseUUID(req.DatasetID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid datasetId"})
		return
	}

	// 设置默认配置
	if req.Config == "" {
		req.Config = "{}"
	}

	chart := models.Chart{
		WorkspaceID: GetWorkspaceID(c),
		Name:        req.Name,
		DatasetID:   datasetUUID,
		Type:        chartType,
		Config:      req.Config,
	}
	setCreator(c, &chart.AuditFields)

	result := database.DB.Create(&chart)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusCreated, chart)
}

// CopyChart 复制图表
func CopyChart(c *gin.Context) {
	id := c.Param("id")
	var original models.Chart
	if err := database.DB.First(&original, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Chart not found"})
		return
	}

	copied := models.Chart{
		WorkspaceID: original.WorkspaceID,
		Name:        original.Name + "_copy",
		DatasetID:   original.DatasetID,
		Type:        original.Type,
		Config:      original.Config,
	}
	setCreator(c, &copied.AuditFields)
	if err := database.DB.Create(&copied).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, chartResponse(copied))
}

// GetChart 获取图表详情
func GetChart(c *gin.Context) {
	id := c.Param("id")
	var chart models.Chart
	result := database.DB.First(&chart, "id = ?", id)
	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Chart not found"})
		return
	}

	c.JSON(http.StatusOK, chart)
}

// UpdateChart 更新图表
func UpdateChart(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Name      string `json:"name" binding:"required"`
		DatasetID string `json:"datasetId" binding:"required"`
		Type      string `json:"type" binding:"required"`
		Config    string `json:"config"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	chartType := models.ChartType(req.Type)
	if !isValidChartType(chartType) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid chart type"})
		return
	}

	datasetUUID, err := parseUUID(req.DatasetID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid datasetId"})
		return
	}

	var chart models.Chart
	result := database.DB.First(&chart, "id = ?", id)
	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Chart not found"})
		return
	}

	if !canModify(chart.CreatedBy, c) {
		abortForbidden(c, "只有创建人才能修改此图表")
		return
	}

	chart.Name = req.Name
	chart.DatasetID = datasetUUID
	chart.Type = chartType
	chart.Config = req.Config
	setUpdater(c, &chart.AuditFields)

	result = database.DB.Save(&chart)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, chart)
}

// DeleteChart 删除图表
func DeleteChart(c *gin.Context) {
	id := c.Param("id")

	var chart models.Chart
	if err := database.DB.First(&chart, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Chart not found"})
		return
	}
	if !canModify(chart.CreatedBy, c) {
		abortForbidden(c, "只有创建人才能删除此图表")
		return
	}

	result := database.DB.Delete(&models.Chart{}, "id = ?", id)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// GetChartSelectList 获取图表下拉列表
func GetChartSelectList(c *gin.Context) {
	workspaceID := GetWorkspaceID(c)
	charts := make([]models.Chart, 0)
	query := database.DB.Select("id, name, type, dataset_id")
	if workspaceID != "" {
		query = query.Where("workspace_id = ?", workspaceID)
	}
	result := query.Find(&charts)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	options := make([]map[string]interface{}, 0)
	for _, chart := range charts {
		options = append(options, map[string]interface{}{
			"id":        chart.ID.String(),
			"name":      chart.Name,
			"type":      chart.Type,
			"datasetId": chart.DatasetID.String(),
		})
	}

	c.JSON(http.StatusOK, gin.H{"items": options})
}

// GetChartData 获取图表数据
func GetChartData(c *gin.Context) {
	id := c.Param("id")
	var chart models.Chart
	result := database.DB.First(&chart, "id = ?", id)
	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Chart not found"})
		return
	}

	// 获取关联的数据集
	var dataset models.Dataset
	result = database.DB.First(&dataset, "id = ?", chart.DatasetID)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Dataset not found for chart"})
		return
	}

	// 获取数据源
	var dataSource models.DataSource
	result = database.DB.First(&dataSource, "id = ?", dataset.DataSourceID)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "DataSource not found for dataset"})
		return
	}

	// 解析看板级筛选器参数（作用于外层聚合结果）
	filtersParam := c.Query("filters")
	var filterConditions []FilterCondition
	if filtersParam != "" {
		if err := json.Unmarshal([]byte(filtersParam), &filterConditions); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "解析筛选器参数失败: " + err.Error()})
			return
		}
	}

	// 解析图表级筛选器参数（用户在图表上交互修改的筛选值，始终作用于内层原始数据）
	chartFiltersParam := c.Query("chartFilters")
	var chartFilterOverrides []FilterCondition
	if chartFiltersParam != "" {
		if err := json.Unmarshal([]byte(chartFiltersParam), &chartFilterOverrides); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "解析图表筛选器参数失败: " + err.Error()})
			return
		}
	}

	// 解析分组维度覆盖参数：柱状图/折线图场景下，用户可在图表上自由选择用于聚合的分组维度
	// nil 表示未覆盖（使用配置中的全部分组字段）；非 nil（含空数组）表示按所选子集聚合
	var groupOverride []string
	if groupParam := c.Query("groupFields"); groupParam != "" {
		if err := json.Unmarshal([]byte(groupParam), &groupOverride); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "解析分组维度参数失败: " + err.Error()})
			return
		}
		if groupOverride == nil {
			groupOverride = []string{}
		}
	}

	// 抽取类型数据集使用 ClickHouse 表，直连类型使用原始数据源
	dsCalcExprs := extractCalcFieldExprs(dataset.FieldsConfig)
	var querySQL string
	var db *sql.DB
	var err error
	if dataset.Type == models.DatasetTypeExtract {
		if database.ClickHouseDB == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "ClickHouse 未连接，请检查配置"})
			return
		}
		if dataset.ExtractStatus == models.ExtractStatusRunning {
			c.JSON(http.StatusOK, gin.H{"data": []interface{}{}, "extracting": true, "message": "数据正在写入，请稍候"})
			return
		}
		if dataset.ExtractStatus != models.ExtractStatusSuccess {
			c.JSON(http.StatusBadRequest, gin.H{"error": "数据尚未抽取成功，请先执行抽取"})
			return
		}
		ckTable := "ds_" + strings.ReplaceAll(dataset.ID.String(), "-", "_")
		ckSQL := fmt.Sprintf("SELECT * FROM %s", ckTable)
		querySQL, err = buildChartSQL(chart.Config, string(chart.Type), ckSQL, filterConditions, dsCalcExprs, groupOverride, chartFilterOverrides)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "构建SQL失败: " + err.Error()})
			return
		}
		db = database.ClickHouseDB
	} else {
		querySQL, err = buildChartSQL(chart.Config, string(chart.Type), dataset.SQL, filterConditions, dsCalcExprs, groupOverride, chartFilterOverrides)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "构建SQL失败: " + err.Error()})
			return
		}
		db, err = connectToDataSource(dataSource)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "连接数据源失败: " + err.Error()})
			return
		}
		defer db.Close()
	}

	var rows *sql.Rows
	rows, err = db.Query(querySQL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "执行SQL失败: " + err.Error()})
		return
	}
	defer rows.Close()

	columnTypes, err := rows.ColumnTypes()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取列信息失败: " + err.Error()})
		return
	}

	resultData := make([]map[string]interface{}, 0)
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
					row[colName] = safeFloat(floatVal)
				} else {
					row[colName] = s
				}
			} else if floatVal, ok := val.(float64); ok {
				row[colName] = safeFloat(floatVal)
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
		"chart": chart,
		"data":  resultData,
		"sql":   querySQL,
	})
}

// PreviewChartData 用未保存的 config 预览图表数据
func PreviewChartData(c *gin.Context) {
	id := c.Param("id")
	var body struct {
		Config string `json:"config"`
		Type   string `json:"type"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求参数错误: " + err.Error()})
		return
	}

	var chart models.Chart
	if err := database.DB.First(&chart, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Chart not found"})
		return
	}

	var dataset models.Dataset
	if err := database.DB.First(&dataset, "id = ?", chart.DatasetID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Dataset not found"})
		return
	}

	var dataSource models.DataSource
	if err := database.DB.First(&dataSource, "id = ?", dataset.DataSourceID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "DataSource not found"})
		return
	}

	dsCalcExprs := extractCalcFieldExprs(dataset.FieldsConfig)
	var querySQL string
	var db *sql.DB
	var err error
	if dataset.Type == models.DatasetTypeExtract {
		if database.ClickHouseDB == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "ClickHouse 未连接"})
			return
		}
		if dataset.ExtractStatus == models.ExtractStatusRunning {
			c.JSON(http.StatusOK, gin.H{"data": []interface{}{}, "extracting": true, "message": "数据正在写入，请稍候"})
			return
		}
		if dataset.ExtractStatus != models.ExtractStatusSuccess {
			c.JSON(http.StatusBadRequest, gin.H{"error": "数据尚未抽取成功"})
			return
		}
		ckTable := "ds_" + strings.ReplaceAll(dataset.ID.String(), "-", "_")
		ckSQL := fmt.Sprintf("SELECT * FROM %s", ckTable)
		querySQL, err = buildChartSQL(body.Config, body.Type, ckSQL, nil, dsCalcExprs, nil, nil)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "构建SQL失败: " + err.Error()})
			return
		}
		db = database.ClickHouseDB
	} else {
		querySQL, err = buildChartSQL(body.Config, body.Type, dataset.SQL, nil, dsCalcExprs, nil, nil)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "构建SQL失败: " + err.Error()})
			return
		}
		db, err = connectToDataSource(dataSource)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "连接数据源失败: " + err.Error()})
			return
		}
		defer db.Close()
	}

	rows, err := db.Query(querySQL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "执行SQL失败: " + err.Error()})
		return
	}
	defer rows.Close()

	columnTypes, err := rows.ColumnTypes()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取列信息失败: " + err.Error()})
		return
	}

	resultData := make([]map[string]interface{}, 0)
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
					row[colName] = safeFloat(floatVal)
				} else {
					row[colName] = s
				}
			} else if floatVal, ok := val.(float64); ok {
				row[colName] = safeFloat(floatVal)
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

	c.JSON(http.StatusOK, gin.H{"data": resultData, "sql": querySQL})
}

// dateRangeFilterValue 前端 DateRangeFilterPicker 保存的筛选值结构
type dateRangeFilterValue struct {
	StartType    string          `json:"startType"`    // "dynamic" | "static"
	StartDynamic int             `json:"startDynamic"` // 距今天 N 天前（dynamic 时使用）
	StartStatic  json.RawMessage `json:"startStatic"`  // ISO 日期字符串 或 null（static 时使用）
	EndType      string          `json:"endType"`
	EndDynamic   int             `json:"endDynamic"`
	EndStatic    json.RawMessage `json:"endStatic"`
}

// resolveDateRangeFilterVal 将 dateRangeFilterValue 解析为 YYYY-MM-DD 格式的起止日期
func resolveDateRangeFilterVal(drv dateRangeFilterValue) (string, string, error) {
	today := time.Now()
	parseStaticDate := func(raw json.RawMessage) (time.Time, error) {
		var s string
		if err := json.Unmarshal(raw, &s); err != nil {
			return time.Time{}, err
		}
		if t, err := time.Parse(time.RFC3339, s); err == nil {
			return t, nil
		}
		return time.Parse("2006-01-02", s)
	}
	var start, end time.Time
	if drv.StartType == "static" {
		t, err := parseStaticDate(drv.StartStatic)
		if err != nil {
			return "", "", err
		}
		start = t
	} else {
		start = today.AddDate(0, 0, -drv.StartDynamic)
	}
	if drv.EndType == "static" {
		t, err := parseStaticDate(drv.EndStatic)
		if err != nil {
			return "", "", err
		}
		end = t
	} else {
		end = today.AddDate(0, 0, -drv.EndDynamic)
	}
	return start.Format("2006-01-02"), end.Format("2006-01-02"), nil
}

// FilterCondition 筛选条件
type FilterCondition struct {
	Field      string   `json:"field"`
	Type       string   `json:"type"`     // "multiple", "single", "dateRange"
	DataType   string   `json:"dataType"` // "number", "text", "date" 等
	Values     []string `json:"values"`
	Expression string   `json:"expression,omitempty"` // 计算字段表达式，非空时替代 Field 用于 WHERE 子句
	Exclude    bool     `json:"exclude,omitempty"`    // 排除模式：true 时使用 NOT IN 而非 IN
}

// chartFilterFieldConfig 图表配置中的筛选字段
type chartFilterFieldConfig struct {
	OriginalName string `json:"originalName"`
	IsCalculated bool   `json:"isCalculated"`
	Expression   string `json:"expression"`
	Config       *struct {
		FilterType    string          `json:"filterType"`
		FilterDefault json.RawMessage `json:"filterDefault"`
		FilterExclude bool            `json:"filterExclude"`
	} `json:"config"`
}

// extractCalcFieldExprs 从数据集 FieldsConfig JSON 中提取计算字段的原始名称→表达式映射
func extractCalcFieldExprs(fieldsConfigJSON string) map[string]string {
	result := make(map[string]string)
	var fieldsConfig []map[string]interface{}
	if err := json.Unmarshal([]byte(fieldsConfigJSON), &fieldsConfig); err != nil {
		return result
	}
	for _, field := range fieldsConfig {
		origName, _ := field["originalName"].(string)
		isCalc, _ := field["isCalculated"].(bool)
		expr, _ := field["expression"].(string)
		if origName != "" && isCalc && expr != "" {
			result[origName] = expr
		}
	}
	return result
}

// buildChartSQL 根据图表配置生成聚合SQL，带输入校验防止SQL注入
// dsCalcExprs 是从数据集 FieldsConfig 提取的计算字段表达式映射，用于解析筛选中的计算字段
// maxChartRows 单个图表查询返回的最大行数，防止数据量过大拖垮前端渲染
const maxChartRows = 200000

// groupOverride 为 nil 时使用配置中的全部分组字段；非 nil（含空切片）时仅按其中列出的分组字段聚合
// chartFilterOverrides 为用户在图表上交互修改的图表级筛选值：当某字段被覆盖时，
// 用覆盖值替换该字段在图表配置中的默认筛选值；两者都始终作用于内层（_inner）
func buildChartSQL(configJSON string, chartType string, datasetSQL string, filters []FilterCondition, dsCalcExprs map[string]string, groupOverride []string, chartFilterOverrides []FilterCondition) (string, error) {
	var config struct {
		RowFields       []fieldConfig              `json:"rowFields"`
		ColFields       []fieldConfig              `json:"colFields"`
		MeasureFields   []fieldConfig              `json:"measureFields"`
		XAxisFields     []fieldConfig              `json:"xAxisFields"`
		YAxisFields     []fieldConfig              `json:"yAxisFields"`
		Y2AxisFields    []fieldConfig              `json:"y2AxisFields"`
		GroupFields     []fieldConfig              `json:"groupFields"`
		IndicatorFields []fieldConfig              `json:"indicatorFields"`
		FilterFields    []chartFilterFieldConfig   `json:"filterFields"`
		FilterValues    map[string]json.RawMessage `json:"filterValues"`
	}

	if err := json.Unmarshal([]byte(configJSON), &config); err != nil {
		return datasetSQL, nil
	}

	// 应用分组维度覆盖：仅保留用户所选的分组字段（保持配置中的原始顺序）
	// 该逻辑在字段被用于 SELECT / GROUP BY 之前执行，因此同时作用于两者
	if groupOverride != nil {
		allowed := make(map[string]bool, len(groupOverride))
		for _, name := range groupOverride {
			allowed[name] = true
		}
		filtered := make([]fieldConfig, 0, len(config.GroupFields))
		for _, f := range config.GroupFields {
			if allowed[f.OriginalName] {
				filtered = append(filtered, f)
			}
		}
		config.GroupFields = filtered
	}

	// 收集所有维度字段的计算表达式，用于筛选条件中替换字段名
	// 优先使用数据集 FieldsConfig 中的表达式（最权威），再用图表配置中维度字段的表达式
	calcExprMap := make(map[string]string)
	for name, expr := range dsCalcExprs {
		calcExprMap[name] = expr
	}
	allDimFields := make([]fieldConfig, 0)
	allDimFields = append(allDimFields, config.RowFields...)
	allDimFields = append(allDimFields, config.ColFields...)
	allDimFields = append(allDimFields, config.XAxisFields...)
	allDimFields = append(allDimFields, config.GroupFields...)
	for _, f := range allDimFields {
		if f.IsCalculated && f.Expression != "" && isValidExpression(f.Expression) {
			if _, exists := calcExprMap[f.OriginalName]; !exists {
				calcExprMap[f.OriginalName] = f.Expression
			}
		}
	}

	// resolveFilterExpr 将计算字段的筛选条件中的字段名替换为其表达式
	resolveFilterExpr := func(fc FilterCondition) FilterCondition {
		if expr, ok := calcExprMap[fc.Field]; ok {
			fc.Expression = expr
		}
		return fc
	}

	// 从图表配置中提取图表级筛选条件
	var chartFilters []FilterCondition
	for _, ff := range config.FilterFields {
		if !isValidIdentifier(ff.OriginalName) {
			continue
		}
		rawVal, ok := config.FilterValues[ff.OriginalName]
		if !ok || rawVal == nil {
			if ff.Config != nil && ff.Config.FilterDefault != nil {
				rawVal = ff.Config.FilterDefault
			} else {
				continue
			}
		}
		filterType := "multiple"
		if ff.Config != nil && ff.Config.FilterType != "" {
			filterType = ff.Config.FilterType
		}

		// 日期区间：尝试解析 DateRangeFilterValue 对象（前端动态/静态日期范围）
		if filterType == "dateRange" {
			var drv dateRangeFilterValue
			if err := json.Unmarshal(rawVal, &drv); err == nil && drv.StartType != "" {
				start, end, err := resolveDateRangeFilterVal(drv)
				if err == nil && start != "" && end != "" {
					fc := FilterCondition{
						Field:    ff.OriginalName,
						Type:     "dateRange",
						DataType: "text",
						Values:   []string{start, end},
					}
					if ff.IsCalculated && ff.Expression != "" && isValidExpression(ff.Expression) {
						fc.Expression = ff.Expression
					} else {
						fc = resolveFilterExpr(fc)
					}
					chartFilters = append(chartFilters, fc)
				}
				continue
			}
		}

		var values []string
		var arr []interface{}
		if err := json.Unmarshal(rawVal, &arr); err == nil {
			for _, v := range arr {
				if s, ok := v.(string); ok && s != "" {
					values = append(values, s)
				}
			}
		} else {
			var s string
			if err := json.Unmarshal(rawVal, &s); err == nil && s != "" {
				values = []string{s}
			}
		}
		if len(values) == 0 {
			continue
		}
		fc := FilterCondition{
			Field:    ff.OriginalName,
			Type:     filterType,
			DataType: "text",
			Values:   values,
			Exclude:  ff.Config != nil && ff.Config.FilterExclude,
		}
		// 计算字段：优先使用 filterField 自身存储的表达式，其次查 calcExprMap
		if ff.IsCalculated && ff.Expression != "" && isValidExpression(ff.Expression) {
			fc.Expression = ff.Expression
		} else {
			fc = resolveFilterExpr(fc)
		}
		chartFilters = append(chartFilters, fc)
	}

	// 合并图表级筛选覆盖值：用户在图表上交互修改的筛选值优先于配置中的默认值。
	// 同一字段被覆盖时，剔除配置产生的该字段筛选，再追加覆盖值（均作用于内层）。
	if len(chartFilterOverrides) > 0 {
		overridden := make(map[string]bool, len(chartFilterOverrides))
		for _, o := range chartFilterOverrides {
			overridden[o.Field] = true
		}
		kept := chartFilters[:0]
		for _, fc := range chartFilters {
			if !overridden[fc.Field] {
				kept = append(kept, fc)
			}
		}
		chartFilters = kept
		for _, o := range chartFilterOverrides {
			if !isValidIdentifier(o.Field) || len(o.Values) == 0 {
				continue
			}
			chartFilters = append(chartFilters, resolveFilterExpr(o))
		}
	}

	// 构建内层 SQL：数据集 + 图表级筛选
	// 结构：SELECT * FROM (<datasetSQL>) AS _inner WHERE <图表筛选>
	innerSQL := buildFilteredSQL(fmt.Sprintf("SELECT * FROM (%s) AS _inner", datasetSQL), chartFilters)

	var selectFields []string
	var groupByFields []string
	var orderByFields []string
	seen := make(map[string]bool)

	sortDir := func(f fieldConfig) string {
		if f.Config != nil && f.Config.Sort == "降序" {
			return "DESC"
		}
		return "ASC"
	}

	addDimension := func(f fieldConfig) error {
		name := f.OriginalName
		if !isValidIdentifier(name) {
			return fmt.Errorf("非法字段名: %s", name)
		}
		if !seen[name] {
			seen[name] = true
			if f.IsCalculated && f.Expression != "" {
				if !isValidExpression(f.Expression) {
					return fmt.Errorf("非法计算字段表达式: %s", name)
				}
				alias := sanitizeAlias(name)
				selectFields = append(selectFields, fmt.Sprintf("%s AS %s", f.Expression, alias))
				groupByFields = append(groupByFields, f.Expression)
			} else {
				selectFields = append(selectFields, name)
				groupByFields = append(groupByFields, name)
			}
		}
		return nil
	}

	var err error
	switch chartType {
	case "crossTable":
		for _, f := range config.RowFields {
			if err = addDimension(f); err != nil {
				return "", err
			}
			orderByFields = append(orderByFields, fmt.Sprintf("%s %s", f.OriginalName, sortDir(f)))
		}
		for _, f := range config.ColFields {
			if err = addDimension(f); err != nil {
				return "", err
			}
		}
		for _, f := range config.MeasureFields {
			agg, e := buildAggField(f)
			if e != nil {
				return "", e
			}
			selectFields = append(selectFields, agg)
		}
	case "bar", "line":
		for _, f := range config.XAxisFields {
			if err = addDimension(f); err != nil {
				return "", err
			}
			orderByFields = append(orderByFields, fmt.Sprintf("%s %s", f.OriginalName, sortDir(f)))
		}
		for _, f := range config.YAxisFields {
			agg, e := buildAggField(f)
			if e != nil {
				return "", e
			}
			selectFields = append(selectFields, agg)
		}
		for _, f := range config.GroupFields {
			if err = addDimension(f); err != nil {
				return "", err
			}
		}
	case "pie":
		for _, f := range config.GroupFields {
			if err = addDimension(f); err != nil {
				return "", err
			}
		}
		for _, f := range config.MeasureFields {
			agg, e := buildAggField(f)
			if e != nil {
				return "", e
			}
			selectFields = append(selectFields, agg)
		}
	case "indicator":
		for _, f := range config.IndicatorFields {
			agg, e := buildAggField(f)
			if e != nil {
				return "", e
			}
			selectFields = append(selectFields, agg)
		}
	case "dualAxis":
		for _, f := range config.XAxisFields {
			if err = addDimension(f); err != nil {
				return "", err
			}
			orderByFields = append(orderByFields, fmt.Sprintf("%s %s", f.OriginalName, sortDir(f)))
		}
		for _, f := range config.YAxisFields {
			agg, e := buildAggField(f)
			if e != nil {
				return "", e
			}
			selectFields = append(selectFields, agg)
		}
		for _, f := range config.Y2AxisFields {
			agg, e := buildAggField(f)
			if e != nil {
				return "", e
			}
			selectFields = append(selectFields, agg)
		}
	}

	if len(selectFields) == 0 {
		return fmt.Sprintf("%s LIMIT %d", innerSQL, maxChartRows), nil
	}

	// 解析看板级筛选中的计算字段表达式
	resolvedFilters := make([]FilterCondition, len(filters))
	for i, f := range filters {
		resolvedFilters[i] = resolveFilterExpr(f)
	}

	// 构建外层 SQL：图表聚合字段 + 看板级筛选
	// 结构：SELECT <fields> FROM (<innerSQL>) AS dataset WHERE <看板筛选> GROUP BY ... ORDER BY ...
	sql := buildFilteredSQL(fmt.Sprintf("SELECT %s FROM (%s) AS dataset", strings.Join(selectFields, ", "), innerSQL), resolvedFilters)

	if len(groupByFields) > 0 {
		sql += fmt.Sprintf(" GROUP BY %s", strings.Join(groupByFields, ", "))
	}
	if len(orderByFields) > 0 {
		sql += fmt.Sprintf(" ORDER BY %s", strings.Join(orderByFields, ", "))
	}
	// 限制返回行数，避免数据量过大导致前端图表渲染卡顿
	sql += fmt.Sprintf(" LIMIT %d", maxChartRows)
	return sql, nil
}

// buildFilteredSQL 在 base SQL 后追加 WHERE 筛选条件，校验字段名防止 SQL 注入
func buildFilteredSQL(base string, filters []FilterCondition) string {
	sql := base + " WHERE 1=1"
	for _, f := range filters {
		if len(f.Values) == 0 {
			continue
		}
		// 计算字段使用表达式，普通字段使用字段名
		var fieldExpr string
		if f.Expression != "" {
			if !isValidExpression(f.Expression) {
				continue
			}
			fieldExpr = f.Expression
		} else {
			if !isValidIdentifier(f.Field) {
				continue
			}
			fieldExpr = f.Field
		}
		switch f.Type {
		case "dateRange":
			if len(f.Values) == 2 && f.Values[0] != "" && f.Values[1] != "" {
				start := truncateISODatetime(sanitizeSQLString(f.Values[0]))
				end := truncateISODatetime(sanitizeSQLString(f.Values[1]))
				sql += fmt.Sprintf(" AND %s BETWEEN '%s' AND '%s'", fieldExpr, start, end)
			}
		case "single", "multiple":
			op := "IN"
			if f.Exclude {
				op = "NOT IN"
			}
			if f.DataType == "number" {
				// 数字类型：校验每个值确实是数字
				var safeValues []string
				for _, v := range f.Values {
					if _, err := strconv.ParseFloat(v, 64); err == nil {
						safeValues = append(safeValues, v)
					}
				}
				if len(safeValues) > 0 {
					sql += fmt.Sprintf(" AND %s %s (%s)", fieldExpr, op, strings.Join(safeValues, ", "))
				}
			} else {
				quoted := make([]string, len(f.Values))
				for i, v := range f.Values {
					val := truncateISODatetime(sanitizeSQLString(v))
					quoted[i] = fmt.Sprintf("'%s'", val)
				}
				sql += fmt.Sprintf(" AND %s %s (%s)", fieldExpr, op, strings.Join(quoted, ", "))
			}
		}
	}
	return sql
}

// sanitizeSQLString 转义SQL字符串中的单引号，防止注入
func sanitizeSQLString(s string) string {
	return strings.ReplaceAll(s, "'", "''")
}

// truncateISODatetime 将 ISO 8601 datetime 截断为日期部分 (YYYY-MM-DD)
// 兼容 ClickHouse Date 类型不接受带时间的字符串的问题
func truncateISODatetime(v string) string {
	if len(v) > 10 && v[10] == 'T' {
		return v[:10]
	}
	return v
}

// toTime 兼容 time.Time 和 *time.Time（BigQuery 驱动返回指针类型）
func toTime(val interface{}) (time.Time, bool) {
	if t, ok := val.(time.Time); ok {
		return t, true
	}
	if tp, ok := val.(*time.Time); ok && tp != nil {
		return *tp, true
	}
	return time.Time{}, false
}

// safeFloat 将 NaN/Inf 替换为 nil，避免 JSON 序列化失败
// ClickHouse 计算字段除以零时会返回 NaN 或 Inf
func safeFloat(f float64) interface{} {
	if math.IsNaN(f) || math.IsInf(f, 0) {
		return nil
	}
	return f
}

type fieldConfig struct {
	OriginalName string `json:"originalName"`
	DisplayName  string `json:"displayName"`
	Type         string `json:"type"`
	IsCalculated bool   `json:"isCalculated"`
	Expression   string `json:"expression"`
	Config       *struct {
		Aggregation string `json:"aggregation"`
		Sort        string `json:"sort"`
	} `json:"config"`
}

func buildAggField(f fieldConfig) (string, error) {
	if !isValidIdentifier(f.OriginalName) {
		return "", fmt.Errorf("非法字段名: %s", f.OriginalName)
	}

	aggLabel := "count"
	if f.Config != nil && f.Config.Aggregation != "" {
		aggLabel = chineseAggToAlias(f.Config.Aggregation)
	}
	alias := sanitizeAlias(fmt.Sprintf("%s_%s", f.OriginalName, aggLabel))

	// 计算字段直接使用表达式，校验后不包裹聚合函数
	if f.IsCalculated && f.Expression != "" {
		if !isValidExpression(f.Expression) {
			return "", fmt.Errorf("非法计算字段表达式: %s", f.OriginalName)
		}
		return fmt.Sprintf("%s AS %s", f.Expression, alias), nil
	}

	agg := "COUNT"
	if f.Config != nil && f.Config.Aggregation != "" {
		switch f.Config.Aggregation {
		case "求和":
			agg = "SUM"
		case "平均值":
			agg = "AVG"
		case "最大值":
			agg = "MAX"
		case "最小值":
			agg = "MIN"
		case "去重计数":
			alias = sanitizeAlias(fmt.Sprintf("%s_count_distinct", f.OriginalName))
			return fmt.Sprintf("COUNT(DISTINCT %s) AS %s", f.OriginalName, alias), nil
		case "计数":
			agg = "COUNT"
		}
	}
	return fmt.Sprintf("%s(%s) AS %s", agg, f.OriginalName, alias), nil
}

// sanitizeAlias 将别名中的非法字符替换为下划线
func sanitizeAlias(alias string) string {
	result := strings.Builder{}
	for i, ch := range alias {
		if (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '_' {
			result.WriteRune(ch)
		} else if i > 0 {
			result.WriteRune('_')
		}
	}
	if result.Len() == 0 {
		return "col"
	}
	return result.String()
}

func getAggLabel(agg string) string {
	switch agg {
	case "SUM":
		return "sum"
	case "AVG":
		return "avg"
	case "MAX":
		return "max"
	case "MIN":
		return "min"
	case "COUNT":
		return "count"
	default:
		return "count"
	}
}

func chineseAggToAlias(agg string) string {
	switch agg {
	case "求和":
		return "sum"
	case "平均值":
		return "avg"
	case "最大值":
		return "max"
	case "最小值":
		return "min"
	case "去重计数":
		return "count_distinct"
	default:
		return "count"
	}
}

// isValidChartType 校验图表类型
func isValidChartType(t models.ChartType) bool {
	switch t {
	case models.ChartTypeCrossTable, models.ChartTypeBar, models.ChartTypeLine, models.ChartTypePie, models.ChartTypeIndicator, models.ChartTypeDualAxis:
		return true
	}
	return false
}
