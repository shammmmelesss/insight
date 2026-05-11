package api

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

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
	TimeField        string `json:"timeField"`
	WhereClause      string `json:"whereClause"`
	TriggerAggFunc   string `json:"triggerAggFunc"`
	TriggerMetric    string `json:"triggerMetric"`
	TriggerOperator  string `json:"triggerOperator"`
	TriggerThreshold string `json:"triggerThreshold"`
	TriggerSchedule  string `json:"triggerSchedule"`
	NotifyChannels   string `json:"notifyChannels"`
	NotifyLarkUsers  string `json:"notifyLarkUsers"`
	CreatedBy        string `json:"createdBy"`
	UpdatedBy        string `json:"updatedBy"`
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
		TimeField:        req.TimeField,
		WhereClause:      req.WhereClause,
		TriggerAggFunc:   req.TriggerAggFunc,
		TriggerMetric:    req.TriggerMetric,
		TriggerOperator:  req.TriggerOperator,
		TriggerThreshold: req.TriggerThreshold,
		TriggerSchedule:  triggerSchedule,
		NotifyChannels:   notifyChannels,
		NotifyLarkUsers:  notifyLarkUsers,
		CreatedBy:        req.CreatedBy,
		UpdatedBy:        req.CreatedBy,
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
	monitor.TimeField = req.TimeField
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
		upper := monitor.TriggerAggFunc
		// 转大写比较
		for _, ch := range monitor.TriggerAggFunc {
			if ch >= 'a' && ch <= 'z' {
				upper = ""
				for _, c := range monitor.TriggerAggFunc {
					if c >= 'a' && c <= 'z' {
						upper += string(rune(c - 32))
					} else {
						upper += string(c)
					}
				}
				break
			}
		}
		if !allowedAggFuncs[upper] {
			c.JSON(http.StatusBadRequest, gin.H{"error": "不支持的聚合函数: " + monitor.TriggerAggFunc})
			return
		}
		aggFunc = upper
	}

	// COUNT 不需要指定字段名，其他函数需要
	var aggExpr string
	if aggFunc == "COUNT" {
		aggExpr = "COUNT(*)"
	} else {
		aggExpr = fmt.Sprintf(`%s("%s")`, aggFunc, monitor.TriggerMetric)
	}

	whereClause := ""
	if monitor.WhereClause != "" {
		whereClause = " WHERE " + monitor.WhereClause
	}
	aggSQL := fmt.Sprintf(`SELECT %s AS _val FROM (%s) AS _t%s`, aggExpr, dataset.SQL, whereClause)

	var db *sql.DB
	if dataset.Type == models.DatasetTypeExtract {
		if database.ClickHouseDB == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "ClickHouse 未连接"})
			return
		}
		ckTable := "ds_" + replaceHyphens(dataset.ID.String())
		aggSQL = fmt.Sprintf(`SELECT %s AS _val FROM insight.%s%s`, aggExpr, ckTable, whereClause)
		db = database.ClickHouseDB
	} else {
		var dataSource models.DataSource
		if err := database.DB.First(&dataSource, "id = ?", dataset.DataSourceID).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "数据源不存在"})
			return
		}
		db, err = connectToDataSource(dataSource)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "连接数据源失败: " + err.Error()})
			return
		}
		defer db.Close()
	}

	row := db.QueryRow(aggSQL)
	var valRaw interface{}
	if err := row.Scan(&valRaw); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询指标失败: " + err.Error()})
		return
	}

	// 转为 float64 进行比较
	var currentValue float64
	switch v := valRaw.(type) {
	case float64:
		currentValue = v
	case float32:
		currentValue = float64(v)
	case int64:
		currentValue = float64(v)
	case int32:
		currentValue = float64(v)
	case []byte:
		currentValue, _ = strconv.ParseFloat(string(v), 64)
	case string:
		currentValue, _ = strconv.ParseFloat(v, 64)
	default:
		currentValue, _ = strconv.ParseFloat(fmt.Sprintf("%v", v), 64)
	}

	threshold, err := strconv.ParseFloat(monitor.TriggerThreshold, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "阈值格式错误: " + err.Error()})
		return
	}

	triggered := false
	switch monitor.TriggerOperator {
	case ">":
		triggered = currentValue > threshold
	case ">=":
		triggered = currentValue >= threshold
	case "<":
		triggered = currentValue < threshold
	case "<=":
		triggered = currentValue <= threshold
	case "=":
		triggered = currentValue == threshold
	case "!=":
		triggered = currentValue != threshold
	}

	notifyErrors := []string{}
	if triggered {
		title := fmt.Sprintf("⚠️ 监控告警：%s", monitor.Name)
		content := fmt.Sprintf("指标 %s（%s）当前值 %.4g，满足条件 %s %.4g，已触发告警。",
			monitor.TriggerMetric, aggFunc, currentValue, monitor.TriggerOperator, threshold)
		if sendErr := SendLarkWebhookMessage(title, content); sendErr != nil {
			notifyErrors = append(notifyErrors, "webhook: "+sendErr.Error())
		}
		if monitor.NotifyLarkUsers != "" && monitor.NotifyLarkUsers != "[]" {
			var larkUsers []struct {
				OpenID string `json:"openId"`
			}
			if jsonErr := json.Unmarshal([]byte(monitor.NotifyLarkUsers), &larkUsers); jsonErr == nil {
				for _, u := range larkUsers {
					if u.OpenID != "" {
						if sendErr := SendLarkDirectMessage(u.OpenID, title, content); sendErr != nil {
							notifyErrors = append(notifyErrors, "direct("+u.OpenID+"): "+sendErr.Error())
						}
					}
				}
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"triggered":    triggered,
		"currentValue": currentValue,
		"threshold":    threshold,
		"operator":     monitor.TriggerOperator,
		"metric":       monitor.TriggerMetric,
		"aggFunc":      aggFunc,
		"sql":          aggSQL,
		"notifyErrors": notifyErrors,
	})
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
