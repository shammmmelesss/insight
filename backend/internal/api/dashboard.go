package api

import (
	"net/http"

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
	}
}

// ListDashboards 获取看板列表
func ListDashboards(c *gin.Context) {
	workspaceID := GetWorkspaceID(c)
	dashboards := make([]models.Dashboard, 0)
	query := database.DB
	if workspaceID != "" {
		query = query.Where("workspace_id = ?", workspaceID)
	}
	result := query.Find(&dashboards)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"items":    dashboards,
		"total":    len(dashboards),
		"page":     1,
		"pageSize": len(dashboards),
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
		Layout:  layout,
		Filters: filters,
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
	var dashboard models.Dashboard
	result := database.DB.First(&dashboard, "id = ?", id)
	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Dashboard not found"})
		return
	}

	c.JSON(http.StatusOK, dashboard)
}

// UpdateDashboard 更新看板
func UpdateDashboard(c *gin.Context) {
	id := c.Param("id")
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

// DeleteDashboard 删除看板
func DeleteDashboard(c *gin.Context) {
	id := c.Param("id")
	result := database.DB.Delete(&models.Dashboard{}, "id = ?", id)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}
