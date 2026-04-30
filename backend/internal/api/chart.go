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

	c.JSON(http.StatusOK, gin.H{
		"items":    charts,
		"total":    len(charts),
		"page":     1,
		"pageSize": len(charts),
	})
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
		DatasetID: datasetUUID,
		Type:      chartType,
		Config:    req.Config,
	}

	result := database.DB.Create(&chart)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusCreated, chart)
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

	chart.Name = req.Name
	chart.DatasetID = datasetUUID
	chart.Type = chartType
	chart.Config = req.Config

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

	// 解析筛选器参数
	filtersParam := c.Query("filters")
	var filterConditions []FilterCondition
	if filtersParam != "" {
		if err := json.Unmarshal([]byte(filtersParam), &filterConditions); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "解析筛选器参数失败: " + err.Error()})
			return
		}
	}

	// 根据图表配置生成聚合SQL
	querySQL, err := buildChartSQL(chart.Config, string(chart.Type), dataset.SQL, filterConditions)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "构建SQL失败: " + err.Error()})
		return
	}

	// 连接数据源执行查询
	db, err := connectToDataSource(dataSource)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "连接数据源失败: " + err.Error()})
		return
	}
	defer db.Close()

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
		"chart": chart,
		"data":  resultData,
		"sql":   querySQL,
	})
}

// FilterCondition 筛选条件
type FilterCondition struct {
	Field    string   `json:"field"`
	Type     string   `json:"type"`     // "multiple", "single", "dateRange"
	DataType string   `json:"dataType"` // "number", "text", "date" 等
	Values   []string `json:"values"`
}

// buildChartSQL 根据图表配置生成聚合SQL，带输入校验防止SQL注入
func buildChartSQL(configJSON string, chartType string, datasetSQL string, filters []FilterCondition) (string, error) {
	var config struct {
		RowFields       []fieldConfig `json:"rowFields"`
		ColFields       []fieldConfig `json:"colFields"`
		MeasureFields   []fieldConfig `json:"measureFields"`
		XAxisFields     []fieldConfig `json:"xAxisFields"`
		YAxisFields     []fieldConfig `json:"yAxisFields"`
		GroupFields     []fieldConfig `json:"groupFields"`
		IndicatorFields []fieldConfig `json:"indicatorFields"`
	}

	if err := json.Unmarshal([]byte(configJSON), &config); err != nil {
		return datasetSQL, nil
	}

	var selectFields []string
	var groupByFields []string
	seen := make(map[string]bool)

	addDimension := func(name string) error {
		if !isValidIdentifier(name) {
			return fmt.Errorf("非法字段名: %s", name)
		}
		if !seen[name] {
			seen[name] = true
			selectFields = append(selectFields, name)
			groupByFields = append(groupByFields, name)
		}
		return nil
	}

	var err error
	switch chartType {
	case "crossTable":
		for _, f := range config.RowFields {
			if err = addDimension(f.OriginalName); err != nil {
				return "", err
			}
		}
		for _, f := range config.ColFields {
			if err = addDimension(f.OriginalName); err != nil {
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
			if err = addDimension(f.OriginalName); err != nil {
				return "", err
			}
		}
		for _, f := range config.YAxisFields {
			agg, e := buildAggField(f)
			if e != nil {
				return "", e
			}
			selectFields = append(selectFields, agg)
		}
		for _, f := range config.GroupFields {
			if err = addDimension(f.OriginalName); err != nil {
				return "", err
			}
		}
	case "pie":
		for _, f := range config.GroupFields {
			if err = addDimension(f.OriginalName); err != nil {
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
	}

	if len(selectFields) == 0 {
		return datasetSQL, nil
	}

	sql := fmt.Sprintf("SELECT %s FROM (%s) AS dataset WHERE 1=1", strings.Join(selectFields, ", "), datasetSQL)

	// 注入筛选条件 — 校验字段名防止SQL注入
	for _, f := range filters {
		if len(f.Values) == 0 {
			continue
		}
		if !isValidIdentifier(f.Field) {
			return "", fmt.Errorf("非法筛选字段名: %s", f.Field)
		}
		switch f.Type {
		case "dateRange":
			if len(f.Values) == 2 && f.Values[0] != "" && f.Values[1] != "" {
				start := sanitizeSQLString(f.Values[0])
				end := sanitizeSQLString(f.Values[1])
				sql += fmt.Sprintf(" AND %s BETWEEN '%s' AND '%s'", f.Field, start, end)
			}
		case "single", "multiple":
			if f.DataType == "number" {
				// 数字类型：校验每个值确实是数字
				var safeValues []string
				for _, v := range f.Values {
					if _, err := strconv.ParseFloat(v, 64); err == nil {
						safeValues = append(safeValues, v)
					}
				}
				if len(safeValues) > 0 {
					sql += fmt.Sprintf(" AND %s IN (%s)", f.Field, strings.Join(safeValues, ", "))
				}
			} else {
				quoted := make([]string, len(f.Values))
				for i, v := range f.Values {
					quoted[i] = fmt.Sprintf("'%s'", sanitizeSQLString(v))
				}
				sql += fmt.Sprintf(" AND %s IN (%s)", f.Field, strings.Join(quoted, ", "))
			}
		}
	}

	if len(groupByFields) > 0 {
		sql += fmt.Sprintf(" GROUP BY %s", strings.Join(groupByFields, ", "))
	}
	return sql, nil
}

// sanitizeSQLString 转义SQL字符串中的单引号，防止注入
func sanitizeSQLString(s string) string {
	return strings.ReplaceAll(s, "'", "''")
}

type fieldConfig struct {
	OriginalName string `json:"originalName"`
	DisplayName  string `json:"displayName"`
	Type         string `json:"type"`
	IsCalculated bool   `json:"isCalculated"`
	Expression   string `json:"expression"`
	Config       *struct {
		Aggregation string `json:"aggregation"`
	} `json:"config"`
}

func buildAggField(f fieldConfig) (string, error) {
	if !isValidIdentifier(f.OriginalName) {
		return "", fmt.Errorf("非法字段名: %s", f.OriginalName)
	}

	aggLabel := "计数"
	if f.Config != nil && f.Config.Aggregation != "" {
		aggLabel = f.Config.Aggregation
	}
	alias := sanitizeAlias(f.OriginalName + "_" + aggLabel)

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
			return fmt.Sprintf("COUNT(DISTINCT %s) AS %s", f.OriginalName, sanitizeAlias(f.OriginalName+"_去重计数")), nil
		case "计数":
			agg = "COUNT"
		}
	}
	return fmt.Sprintf("%s(%s) AS %s", agg, f.OriginalName, sanitizeAlias(f.OriginalName+"_"+getAggLabel(agg))), nil
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
		return "求和"
	case "AVG":
		return "平均值"
	case "MAX":
		return "最大值"
	case "MIN":
		return "最小值"
	case "COUNT":
		return "计数"
	default:
		return "计数"
	}
}

// isValidChartType 校验图表类型
func isValidChartType(t models.ChartType) bool {
	switch t {
	case models.ChartTypeCrossTable, models.ChartTypeBar, models.ChartTypeLine, models.ChartTypePie, models.ChartTypeIndicator:
		return true
	}
	return false
}
