package api

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"

	"github.com/gin-gonic/gin"
	"data-analysis-platform/internal/database"
	"data-analysis-platform/internal/models"
)

// RegisterDashboardRoutes 注册看板路由
func RegisterDashboardRoutes(rg *gin.RouterGroup) {
	dashboard := rg.Group("/dashboards")
	{
		dashboard.GET("", ListDashboards)
		dashboard.POST("", CreateDashboard)
		dashboard.GET("/:id", GetDashboard)
		dashboard.PUT("/:id", UpdateDashboard)
		dashboard.DELETE("/:id", DeleteDashboard)
		dashboard.PUT("/:id/share", ShareDashboard)
	}
}

// GetCurrentUserID 从请求头获取当前用户ID
func GetCurrentUserID(c *gin.Context) string {
	return c.GetHeader("X-User-Id")
}

// GetCurrentUserName 从请求头获取当前用户名（前端用 encodeURIComponent 编码）
func GetCurrentUserName(c *gin.Context) string {
	raw := c.GetHeader("X-User-Name")
	if raw == "" {
		return ""
	}
	decoded, err := url.QueryUnescape(raw)
	if err != nil {
		return raw
	}
	return decoded
}

// canAccessDashboard 检查用户是否有权限访问看板
// 规则：createdBy 为空（历史数据）则所有人可访问；否则只有创建人和被分享用户可访问
func canAccessDashboard(dashboard *models.Dashboard, userID string) bool {
	if dashboard.CreatedBy == "" {
		return true
	}
	if userID == "" {
		return false
	}
	if dashboard.CreatedBy == userID {
		return true
	}
	// 检查 sharedWith JSON 数组中是否包含该用户
	var shared []map[string]interface{}
	if err := json.Unmarshal([]byte(dashboard.SharedWith), &shared); err == nil {
		for _, u := range shared {
			if openID, ok := u["openId"].(string); ok && openID == userID {
				return true
			}
		}
	}
	return false
}

// ListDashboards 获取看板列表
func ListDashboards(c *gin.Context) {
	workspaceID := GetWorkspaceID(c)
	userID := GetCurrentUserID(c)

	dashboards := make([]models.Dashboard, 0)
	query := database.DB
	if workspaceID != "" {
		query = query.Where("workspace_id = ?", workspaceID)
	}
	result := query.Order("created_at ASC").Find(&dashboards)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	// 过滤：只返回有权限的看板
	visible := make([]models.Dashboard, 0, len(dashboards))
	for _, d := range dashboards {
		if canAccessDashboard(&d, userID) {
			visible = append(visible, d)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"items":    visible,
		"total":    len(visible),
		"page":     1,
		"pageSize": len(visible),
	})
}

// CreateDashboard 创建看板（支持同时传入layout和filters）
func CreateDashboard(c *gin.Context) {
	var req struct {
		Name    string `json:"name" binding:"required"`
		Layout  string `json:"layout"`
		Filters string `json:"filters"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	layout := "[]"
	if req.Layout != "" {
		layout = req.Layout
	}

	filters := "[]"
	if req.Filters != "" {
		filters = req.Filters
	}

	dashboard := models.Dashboard{
		WorkspaceID: GetWorkspaceID(c),
		Name:        req.Name,
		Layout:      layout,
		Filters:     filters,
		CreatedBy:   GetCurrentUserID(c),
	}

	result := database.DB.Create(&dashboard)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusCreated, dashboard)
}

// GetDashboard 获取看板详情
func GetDashboard(c *gin.Context) {
	id := c.Param("id")
	userID := GetCurrentUserID(c)

	var dashboard models.Dashboard
	result := database.DB.First(&dashboard, "id = ?", id)
	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Dashboard not found"})
		return
	}

	if !canAccessDashboard(&dashboard, userID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "无权限访问此看板"})
		return
	}

	c.JSON(http.StatusOK, dashboard)
}

// UpdateDashboard 更新看板
func UpdateDashboard(c *gin.Context) {
	id := c.Param("id")
	userID := GetCurrentUserID(c)

	var req struct {
		Name    string `json:"name" binding:"required"`
		Layout  string `json:"layout"`
		Filters string `json:"filters"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var dashboard models.Dashboard
	result := database.DB.First(&dashboard, "id = ?", id)
	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Dashboard not found"})
		return
	}

	if !canAccessDashboard(&dashboard, userID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "无权限修改此看板"})
		return
	}

	dashboard.Name = req.Name
	if req.Layout != "" {
		dashboard.Layout = req.Layout
	}
	if req.Filters != "" {
		dashboard.Filters = req.Filters
	}

	result = database.DB.Save(&dashboard)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, dashboard)
}

// ShareDashboard 更新看板分享用户
func ShareDashboard(c *gin.Context) {
	id := c.Param("id")
	userID := GetCurrentUserID(c)

	var req struct {
		SharedWith string `json:"sharedWith"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var dashboard models.Dashboard
	result := database.DB.First(&dashboard, "id = ?", id)
	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Dashboard not found"})
		return
	}

	if !canAccessDashboard(&dashboard, userID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "无权限分享此看板"})
		return
	}

	sharedWith := strings.TrimSpace(req.SharedWith)
	if sharedWith == "" {
		sharedWith = "[]"
	}
	dashboard.SharedWith = sharedWith

	result = database.DB.Save(&dashboard)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, dashboard)
}

// DeleteDashboard 删除看板
func DeleteDashboard(c *gin.Context) {
	id := c.Param("id")
	userID := GetCurrentUserID(c)

	var dashboard models.Dashboard
	result := database.DB.First(&dashboard, "id = ?", id)
	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Dashboard not found"})
		return
	}

	if !canAccessDashboard(&dashboard, userID) {
		c.JSON(http.StatusForbidden, gin.H{"error": "无权限删除此看板"})
		return
	}

	result = database.DB.Delete(&models.Dashboard{}, "id = ?", id)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}
