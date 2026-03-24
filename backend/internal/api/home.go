package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"data-analysis-platform/internal/database"
	"data-analysis-platform/internal/models"
)

// RegisterHomeRoutes 注册首页路由
func RegisterHomeRoutes(rg *gin.RouterGroup) {
	home := rg.Group("/")
	{
		home.GET("recent-updates", GetRecentUpdates)
	}
}

// GetRecentUpdates 获取最近更新
func GetRecentUpdates(c *gin.Context) {
	workspaceID := GetWorkspaceID(c)

	recentDatasets := make([]models.Dataset, 0)
	q := database.DB.Order("updated_at desc").Limit(5)
	if workspaceID != "" {
		q = q.Where("workspace_id = ?", workspaceID)
	}
	q.Find(&recentDatasets)

	recentCharts := make([]models.Chart, 0)
	q = database.DB.Order("updated_at desc").Limit(5)
	if workspaceID != "" {
		q = q.Where("workspace_id = ?", workspaceID)
	}
	q.Find(&recentCharts)

	recentDashboards := make([]models.Dashboard, 0)
	q = database.DB.Order("updated_at desc").Limit(5)
	if workspaceID != "" {
		q = q.Where("workspace_id = ?", workspaceID)
	}
	q.Find(&recentDashboards)

	c.JSON(http.StatusOK, gin.H{
		"recentDatasets":   recentDatasets,
		"recentCharts":     recentCharts,
		"recentDashboards": recentDashboards,
	})
}
