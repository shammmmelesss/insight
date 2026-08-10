package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"data-analysis-platform/internal/database"
	"data-analysis-platform/internal/models"

	"github.com/gin-gonic/gin"
)

func RegisterMonitorRoutes(rg *gin.RouterGroup) {
	monitor := rg.Group("/monitors")
	{
		monitor.GET("", ListMonitors)
		monitor.POST("", CreateMonitor)
		monitor.GET("/:id", GetMonitor)
		monitor.PUT("/:id", UpdateMonitor)
		monitor.DELETE("/:id", DeleteMonitor)
		monitor.POST("/:id/trigger", TriggerMonitor)
		monitor.GET("/:id/records", ListMonitorRecords)
	}
}

func ListMonitors(c *gin.Context) {
	workspaceID := GetWorkspaceID(c)
	monitors := make([]models.Monitor, 0)
	query := database.DB
	if workspaceID != "" {
		query = query.Where("workspace_id = ?", workspaceID)
	}
	result := query.Order("created_at ASC").Find(&monitors)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"items":    monitors,
		"total":    len(monitors),
		"page":     1,
		"pageSize": len(monitors),
	})
}

type monitorRequest struct {
	Name             string `json:"name" binding:"required"`
	DatasetID        string `json:"datasetId"`
	DimensionField   string `json:"dimensionField"`
	WhereClause      string `json:"whereClause"`
	TriggerAggFunc   string `json:"triggerAggFunc"`
	TriggerMetric    string `json:"triggerMetric"`
	TriggerOperator  string `json:"triggerOperator"`
	TriggerThreshold string `json:"triggerThreshold"`
	TriggerSchedule  string `json:"triggerSchedule"`
	NotifyChannels  string `json:"notifyChannels"`
	NotifyLarkUsers string `json:"notifyLarkUsers"`
	WebhookURL      string `json:"webhookUrl"`
	WebhookSecret   string `json:"webhookSecret"`
	CreatedBy       string `json:"createdBy"`
	UpdatedBy       string `json:"updatedBy"`
}

func CreateMonitor(c *gin.Context) {
	var req monitorRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	triggerSchedule := req.TriggerSchedule
	if triggerSchedule == "" {
		triggerSchedule = "{}"
	}
	notifyChannels := req.NotifyChannels
	if notifyChannels == "" {
		notifyChannels = "[]"
	}
	notifyLarkUsers := req.NotifyLarkUsers
	if notifyLarkUsers == "" {
		notifyLarkUsers = "[]"
	}
	monitor := models.Monitor{
		WorkspaceID:      GetWorkspaceID(c),
		Name:             req.Name,
		DatasetID:        req.DatasetID,
		DimensionField:   req.DimensionField,
		WhereClause:      req.WhereClause,
		TriggerAggFunc:   req.TriggerAggFunc,
		TriggerMetric:    req.TriggerMetric,
		TriggerOperator:  req.TriggerOperator,
		TriggerThreshold: req.TriggerThreshold,
		TriggerSchedule:  triggerSchedule,
		NotifyChannels:  notifyChannels,
		NotifyLarkUsers: notifyLarkUsers,
		WebhookURL:      req.WebhookURL,
		WebhookSecret:   req.WebhookSecret,
		CreatedBy:       req.CreatedBy,
		UpdatedBy:       req.CreatedBy,
	}
	if err := database.DB.Create(&monitor).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, monitor)
}

func GetMonitor(c *gin.Context) {
	id, err := parseUUID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var monitor models.Monitor
	if err := database.DB.First(&monitor, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "monitor not found"})
		return
	}
	c.JSON(http.StatusOK, monitor)
}

func UpdateMonitor(c *gin.Context) {
	id, err := parseUUID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	var monitor models.Monitor
	if err := database.DB.First(&monitor, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "monitor not found"})
		return
	}
	var req monitorRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	monitor.Name = req.Name
	monitor.DatasetID = req.DatasetID
	monitor.DimensionField = req.DimensionField
	monitor.WhereClause = req.WhereClause
	monitor.TriggerAggFunc = req.TriggerAggFunc
	monitor.TriggerMetric = req.TriggerMetric
	monitor.TriggerOperator = req.TriggerOperator
	monitor.TriggerThreshold = req.TriggerThreshold
	if req.TriggerSchedule != "" {
		monitor.TriggerSchedule = req.TriggerSchedule
	}
	if req.NotifyChannels != "" {
		monitor.NotifyChannels = req.NotifyChannels
	}
	if req.NotifyLarkUsers != "" {
		monitor.NotifyLarkUsers = req.NotifyLarkUsers
	}
	monitor.WebhookURL = req.WebhookURL
	monitor.WebhookSecret = req.WebhookSecret
	monitor.UpdatedBy = req.UpdatedBy
	if err := database.DB.Save(&monitor).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, monitor)
}

func DeleteMonitor(c *gin.Context) {
	id, err := parseUUID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := database.DB.Delete(&models.Monitor{}, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// TriggerMonitor 立即执行监控检查，返回当前指标值和是否触发告警
func TriggerMonitor(c *gin.Context) {
	id, err := parseUUID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var monitor models.Monitor
	if err := database.DB.First(&monitor, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "monitor not found"})
		return
	}
	if monitor.DatasetID == "" || monitor.TriggerMetric == "" || monitor.TriggerOperator == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "监控配置不完整，请设置数据、触发方式"})
		return
	}

	var dataset models.Dataset
	if err := database.DB.First(&dataset, "id = ?", monitor.DatasetID).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "数据集不存在"})
		return
	}

	// 校验并确定聚合函数
	allowedAggFuncs := map[string]bool{"SUM": true, "COUNT": true, "AVG": true, "MAX": true, "MIN": true}
	aggFunc := "SUM"
	if monitor.TriggerAggFunc != "" {
		upper := strings.ToUpper(monitor.TriggerAggFunc)
		if !allowedAggFuncs[upper] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "不支持的聚合函数: " + monitor.TriggerAggFunc})
			return
		}
		aggFunc = upper
	}

	// 解析 fieldsConfig，若 triggerMetric 是计算字段则用其表达式替换
	metricExpr := monitor.TriggerMetric
	isCalculatedField := false
	if dataset.FieldsConfig != "" {
		var fieldCfgs []struct {
			OriginalName string `json:"originalName"`
			IsCalculated bool   `json:"isCalculated"`
			Expression   string `json:"expression"`
		}
		if err := json.Unmarshal([]byte(dataset.FieldsConfig), &fieldCfgs); err == nil {
			for _, f := range fieldCfgs {
				if f.OriginalName == monitor.TriggerMetric && f.IsCalculated && f.Expression != "" {
					metricExpr = f.Expression
					isCalculatedField = true
					break
				}
			}
		}
	}

	// 校验指标：计算字段按表达式规则校验，普通字段按列名规则校验，防止注入
	if aggFunc != "COUNT" {
		if isCalculatedField || strings.Contains(metricExpr, "(") {
			if !isValidExpression(metricExpr) {
				c.JSON(http.StatusBadRequest, gin.H{"error": "非法的指标表达式: " + metricExpr})
				return
			}
		} else if !isSafeColumnName(metricExpr) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "非法的指标字段名: " + metricExpr})
			return
		}
	}

	// 计算字段或已含聚合函数的表达式直接使用，普通字段包一层聚合函数
	var aggExpr string
	if aggFunc == "COUNT" {
		aggExpr = "COUNT(*)"
	} else if isCalculatedField || strings.Contains(metricExpr, "(") {
		aggExpr = metricExpr
	} else {
		aggExpr = fmt.Sprintf(`%s(%s)`, aggFunc, metricExpr)
	}

	threshold, err := strconv.ParseFloat(monitor.TriggerThreshold, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "阈值格式错误: " + err.Error()})
		return
	}

	// 校验比较运算符，防止 SQL 注入
	if !isValidOperator(monitor.TriggerOperator) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "不支持的比较运算符: " + monitor.TriggerOperator})
		return
	}

	whereClause := ""
	if monitor.WhereClause != "" {
		whereClause = " WHERE " + monitor.WhereClause
	}

	dim := monitor.DimensionField
	// 校验分组维度字段名，防止反引号注入
	if dim != "" && !isSafeColumnName(dim) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "非法的维度字段名: " + dim})
		return
	}
	var querySQL string
	var db *sql.DB
	if dataset.Type == models.DatasetTypeExtract {
		if database.ClickHouseDB == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "ClickHouse 未连接"})
			return
		}
		ckTable := "insight.ds_" + replaceHyphens(dataset.ID.String())
		if dim != "" {
			querySQL = fmt.Sprintf(
				"SELECT `%s` AS _dim, %s AS _val FROM %s%s GROUP BY `%s` HAVING %s %s %g",
				dim, aggExpr, ckTable, whereClause, dim, aggExpr, monitor.TriggerOperator, threshold,
			)
		} else {
			querySQL = fmt.Sprintf("SELECT '' AS _dim, %s AS _val FROM %s%s HAVING %s %s %g",
				aggExpr, ckTable, whereClause, aggExpr, monitor.TriggerOperator, threshold)
		}
	} else {
		var dataSource models.DataSource
		if err := database.DB.First(&dataSource, "id = ?", dataset.DataSourceID).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "数据源不存在"})
			return
		}
		var dbConn *sql.DB
		dbConn, err = connectToDataSource(dataSource)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "连接数据源失败: " + err.Error()})
			return
		}
		defer dbConn.Close()
		if dim != "" {
			querySQL = fmt.Sprintf(
				"SELECT %s AS _dim, %s AS _val FROM (%s) AS _t%s GROUP BY %s HAVING %s %s %g",
				dim, aggExpr, dataset.SQL, whereClause, dim, aggExpr, monitor.TriggerOperator, threshold,
			)
		} else {
			querySQL = fmt.Sprintf(
				"SELECT '' AS _dim, %s AS _val FROM (%s) AS _t%s HAVING %s %s %g",
				aggExpr, dataset.SQL, whereClause, aggExpr, monitor.TriggerOperator, threshold,
			)
		}
		db = dbConn
	}

	if dataset.Type == models.DatasetTypeExtract {
		db = database.ClickHouseDB
	}

	rows, queryErr := db.Query(querySQL)
	if queryErr != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败: " + queryErr.Error()})
		return
	}
	defer rows.Close()

	var resultRows []monitorResultRow
	for rows.Next() {
		var dimVal interface{}
		var valRaw interface{}
		if err := rows.Scan(&dimVal, &valRaw); err != nil {
			continue
		}
		var val float64
		switch v := valRaw.(type) {
		case float64:
			val = v
		case float32:
			val = float64(v)
		case int64:
			val = float64(v)
		case int32:
			val = float64(v)
		case []byte:
			val, _ = strconv.ParseFloat(string(v), 64)
		case string:
			val, _ = strconv.ParseFloat(v, 64)
		default:
			val, _ = strconv.ParseFloat(fmt.Sprintf("%v", v), 64)
		}
		resultRows = append(resultRows, monitorResultRow{
			Dimension: fmt.Sprintf("%v", dimVal),
			Value:     val,
		})
	}

	triggered := len(resultRows) > 0
	notifyErrors := []string{}
	if triggered {
		notifyErrors = sendMonitorNotification(monitor, dataset, resultRows, aggFunc, threshold)
	}

	resultRowsJSON, _ := json.Marshal(resultRows)
	notifyErrorsJSON, _ := json.Marshal(notifyErrors)
	record := models.MonitorRecord{
		MonitorID:     monitor.ID.String(),
		CurrentValue:  float64(len(resultRows)),
		Threshold:     threshold,
		Operator:      monitor.TriggerOperator,
		AggFunc:       aggFunc,
		Metric:        monitor.TriggerMetric,
		Triggered:     triggered,
		NotifySuccess: !triggered || len(notifyErrors) == 0,
		NotifyErrors:  string(notifyErrorsJSON),
		SQL:           querySQL,
		ResultRows:    string(resultRowsJSON),
	}
	database.DB.Create(&record)

	c.JSON(http.StatusOK, gin.H{
		"triggered":    triggered,
		"rows":         resultRows,
		"threshold":    threshold,
		"operator":     monitor.TriggerOperator,
		"metric":       monitor.TriggerMetric,
		"aggFunc":      aggFunc,
		"sql":          querySQL,
		"notifyErrors": notifyErrors,
	})
}

func ListMonitorRecords(c *gin.Context) {
	id, err := parseUUID(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	records := make([]models.MonitorRecord, 0)
	result := database.DB.Where("monitor_id = ?", id).Order("created_at DESC").Limit(100).Find(&records)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"items": records,
		"total": len(records),
	})
}

// StartMonitorScheduler 每分钟检查一次，触发到点的监控任务
func StartMonitorScheduler() {
	go func() {
		for {
			now := time.Now()
			next := now.Truncate(time.Minute).Add(time.Minute)
			time.Sleep(time.Until(next))
			runScheduledMonitors()
		}
	}()
}

func runScheduledMonitors() {
	var monitors []models.Monitor
	if err := database.DB.Where("trigger_schedule IS NOT NULL AND trigger_schedule::text != '{}'").Find(&monitors).Error; err != nil {
		return
	}

	loc, _ := time.LoadLocation("Asia/Shanghai")
	now := time.Now().In(loc)
	currentTime := fmt.Sprintf("%02d:%02d", now.Hour(), now.Minute())
	currentWeekday := int(now.Weekday()) // 0=Sunday
	currentDay := now.Day()

	for _, m := range monitors {
		var schedule struct {
			Frequency string `json:"frequency"`
			Time      string `json:"time"`
			Weekday   *int   `json:"weekday"`
			Day       *int   `json:"day"`
		}
		if err := json.Unmarshal([]byte(m.TriggerSchedule), &schedule); err != nil {
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
			continue
		}

		monitor := m
		go func() {
			log.Printf("[monitor-scheduler] triggering monitor %s (%s)", monitor.ID, monitor.Name)
			if err := runMonitor(monitor); err != nil {
				log.Printf("[monitor-scheduler] monitor %s failed: %v", monitor.ID, err)
			}
		}()
	}

	retryFailedNotifications()
}

// runMonitor 执行监控检查逻辑（与 TriggerMonitor HTTP 接口共用）
func runMonitor(monitor models.Monitor) error {
	if monitor.DatasetID == "" || monitor.TriggerMetric == "" || monitor.TriggerOperator == "" {
		return fmt.Errorf("监控配置不完整")
	}

	var dataset models.Dataset
	if err := database.DB.First(&dataset, "id = ?", monitor.DatasetID).Error; err != nil {
		return fmt.Errorf("数据集不存在: %w", err)
	}

	allowedAggFuncs := map[string]bool{"SUM": true, "COUNT": true, "AVG": true, "MAX": true, "MIN": true}
	aggFunc := "SUM"
	if monitor.TriggerAggFunc != "" {
		upper := strings.ToUpper(monitor.TriggerAggFunc)
		if !allowedAggFuncs[upper] {
			return fmt.Errorf("不支持的聚合函数: %s", monitor.TriggerAggFunc)
		}
		aggFunc = upper
	}

	metricExpr := monitor.TriggerMetric
	isCalculatedField := false
	if dataset.FieldsConfig != "" {
		var fieldCfgs []struct {
			OriginalName string `json:"originalName"`
			IsCalculated bool   `json:"isCalculated"`
			Expression   string `json:"expression"`
		}
		if err := json.Unmarshal([]byte(dataset.FieldsConfig), &fieldCfgs); err == nil {
			for _, f := range fieldCfgs {
				if f.OriginalName == monitor.TriggerMetric && f.IsCalculated && f.Expression != "" {
					metricExpr = f.Expression
					isCalculatedField = true
					break
				}
			}
		}
	}

	var aggExpr string
	if aggFunc == "COUNT" {
		aggExpr = "COUNT(*)"
	} else if isCalculatedField || strings.Contains(metricExpr, "(") {
		aggExpr = metricExpr
	} else {
		aggExpr = fmt.Sprintf(`%s(%s)`, aggFunc, metricExpr)
	}

	threshold, err := strconv.ParseFloat(monitor.TriggerThreshold, 64)
	if err != nil {
		return fmt.Errorf("阈值格式错误: %w", err)
	}

	whereClause := ""
	if monitor.WhereClause != "" {
		whereClause = " WHERE " + monitor.WhereClause
	}

	dim := monitor.DimensionField
	var querySQL string
	var db *sql.DB

	if dataset.Type == models.DatasetTypeExtract {
		if database.ClickHouseDB == nil {
			return fmt.Errorf("ClickHouse 未连接")
		}
		ckTable := "insight.ds_" + replaceHyphens(dataset.ID.String())
		if dim != "" {
			querySQL = fmt.Sprintf(
				"SELECT `%s` AS _dim, %s AS _val FROM %s%s GROUP BY `%s` HAVING %s %s %g",
				dim, aggExpr, ckTable, whereClause, dim, aggExpr, monitor.TriggerOperator, threshold,
			)
		} else {
			querySQL = fmt.Sprintf("SELECT '' AS _dim, %s AS _val FROM %s%s HAVING %s %s %g",
				aggExpr, ckTable, whereClause, aggExpr, monitor.TriggerOperator, threshold)
		}
		db = database.ClickHouseDB
	} else {
		var dataSource models.DataSource
		if err := database.DB.First(&dataSource, "id = ?", dataset.DataSourceID).Error; err != nil {
			return fmt.Errorf("数据源不存在: %w", err)
		}
		dbConn, err := connectToDataSource(dataSource)
		if err != nil {
			return fmt.Errorf("连接数据源失败: %w", err)
		}
		defer dbConn.Close()
		if dim != "" {
			querySQL = fmt.Sprintf(
				"SELECT %s AS _dim, %s AS _val FROM (%s) AS _t%s GROUP BY %s HAVING %s %s %g",
				dim, aggExpr, dataset.SQL, whereClause, dim, aggExpr, monitor.TriggerOperator, threshold,
			)
		} else {
			querySQL = fmt.Sprintf(
				"SELECT '' AS _dim, %s AS _val FROM (%s) AS _t%s HAVING %s %s %g",
				aggExpr, dataset.SQL, whereClause, aggExpr, monitor.TriggerOperator, threshold,
			)
		}
		db = dbConn
	}

	rows, queryErr := db.Query(querySQL)
	if queryErr != nil {
		return fmt.Errorf("查询失败: %w", queryErr)
	}
	defer rows.Close()

	var resultRows []monitorResultRow
	for rows.Next() {
		var dimVal interface{}
		var valRaw interface{}
		if err := rows.Scan(&dimVal, &valRaw); err != nil {
			continue
		}
		var val float64
		switch v := valRaw.(type) {
		case float64:
			val = v
		case float32:
			val = float64(v)
		case int64:
			val = float64(v)
		case int32:
			val = float64(v)
		case []byte:
			val, _ = strconv.ParseFloat(string(v), 64)
		case string:
			val, _ = strconv.ParseFloat(v, 64)
		default:
			val, _ = strconv.ParseFloat(fmt.Sprintf("%v", v), 64)
		}
		resultRows = append(resultRows, monitorResultRow{
			Dimension: fmt.Sprintf("%v", dimVal),
			Value:     val,
		})
	}

	triggered := len(resultRows) > 0
	notifyErrors := []string{}
	if triggered {
		notifyErrors = sendMonitorNotification(monitor, dataset, resultRows, aggFunc, threshold)
	}

	resultRowsJSON, _ := json.Marshal(resultRows)
	notifyErrorsJSON, _ := json.Marshal(notifyErrors)
	record := models.MonitorRecord{
		MonitorID:     monitor.ID.String(),
		CurrentValue:  float64(len(resultRows)),
		Threshold:     threshold,
		Operator:      monitor.TriggerOperator,
		AggFunc:       aggFunc,
		Metric:        monitor.TriggerMetric,
		Triggered:     triggered,
		NotifySuccess: !triggered || len(notifyErrors) == 0,
		NotifyErrors:  string(notifyErrorsJSON),
		SQL:           querySQL,
		ResultRows:    string(resultRowsJSON),
	}
	database.DB.Create(&record)

	log.Printf("[monitor-scheduler] monitor %s done: triggered=%v rows=%d", monitor.ID, triggered, len(resultRows))
	return nil
}

func replaceHyphens(s string) string {
	result := make([]byte, len(s))
	for i := 0; i < len(s); i++ {
		if s[i] == '-' {
			result[i] = '_'
		} else {
			result[i] = s[i]
		}
	}
	return string(result)
}

type monitorResultRow struct {
	Dimension string  `json:"dimension"`
	Value     float64 `json:"value"`
}

// sendMonitorNotification 发送告警通知，返回失败错误列表（空表示全部成功）
func sendMonitorNotification(monitor models.Monitor, dataset models.Dataset, resultRows []monitorResultRow, aggFunc string, threshold float64) []string {
	type fieldMeta struct {
		OriginalName string `json:"originalName"`
		DisplayName  string `json:"displayName"`
	}
	var fieldMetas []fieldMeta
	if dataset.FieldsConfig != "" {
		json.Unmarshal([]byte(dataset.FieldsConfig), &fieldMetas)
	}
	getDisplayName := func(original string) string {
		for _, f := range fieldMetas {
			if f.OriginalName == original && f.DisplayName != "" {
				return f.DisplayName
			}
		}
		return original
	}

	dimLabel := getDisplayName(monitor.DimensionField)
	metricLabel := fmt.Sprintf("%s(%s)", aggFunc, getDisplayName(monitor.TriggerMetric))
	title := fmt.Sprintf("⚠️ 监控告警：%s", monitor.Name)

	var lines []string
	lines = append(lines, monitor.Name)
	if monitor.DimensionField != "" {
		lines = append(lines, fmt.Sprintf("%s | %s", dimLabel, metricLabel))
	} else {
		lines = append(lines, metricLabel)
	}
	for _, r := range resultRows {
		if monitor.DimensionField != "" {
			lines = append(lines, fmt.Sprintf("%s | %.4g", r.Dimension, r.Value))
		} else {
			lines = append(lines, fmt.Sprintf("%.4g", r.Value))
		}
	}
	lines = append(lines, fmt.Sprintf("满足条件 %s %g，已触发告警", monitor.TriggerOperator, threshold))

	var channels []string
	json.Unmarshal([]byte(monitor.NotifyChannels), &channels)

	useLarkUser := false
	for _, ch := range channels {
		if ch == "lark_user" {
			useLarkUser = true
			break
		}
	}

	var notifyErrors []string
	if useLarkUser {
		var users []struct {
			OpenID string `json:"openId"`
			Name   string `json:"name"`
		}
		json.Unmarshal([]byte(monitor.NotifyLarkUsers), &users)
		content := strings.Join(lines, "\n")
		for _, u := range users {
			if sendErr := SendLarkDirectMessage(u.OpenID, title, content); sendErr != nil {
				notifyErrors = append(notifyErrors, fmt.Sprintf("lark_user(%s): %s", u.Name, sendErr.Error()))
			}
		}
	} else {
		if sendErr := SendLarkWebhookMessageWith(monitor.WebhookURL, monitor.WebhookSecret, title, lines); sendErr != nil {
			notifyErrors = append(notifyErrors, "webhook: "+sendErr.Error())
		}
	}
	return notifyErrors
}

// retryFailedNotifications 对之前发送失败的告警记录重新发送通知
func retryFailedNotifications() {
	var records []models.MonitorRecord
	if err := database.DB.Where("triggered = true AND notify_success = false").
		Order("created_at DESC").
		Limit(50).
		Find(&records).Error; err != nil {
		return
	}
	for _, record := range records {
		var monitor models.Monitor
		if err := database.DB.First(&monitor, "id = ?", record.MonitorID).Error; err != nil {
			// 监控已删除，停止重试
			database.DB.Model(&record).Updates(map[string]interface{}{"notify_success": true, "notify_errors": "[]"})
			continue
		}
		var dataset models.Dataset
		if err := database.DB.First(&dataset, "id = ?", monitor.DatasetID).Error; err != nil {
			continue
		}
		var rows []monitorResultRow
		json.Unmarshal([]byte(record.ResultRows), &rows)

		errs := sendMonitorNotification(monitor, dataset, rows, record.AggFunc, record.Threshold)
		errJSON, _ := json.Marshal(errs)
		if len(errs) == 0 {
			database.DB.Model(&record).Updates(map[string]interface{}{
				"notify_success": true,
				"notify_errors":  "[]",
			})
			log.Printf("[monitor-retry] notification succeeded for record %s (monitor: %s)", record.ID, monitor.Name)
		} else {
			database.DB.Model(&record).Update("notify_errors", string(errJSON))
			log.Printf("[monitor-retry] notification still failing for record %s: %v", record.ID, errs)
		}
	}
}
