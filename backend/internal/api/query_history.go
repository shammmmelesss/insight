package api

import (
	"net/http"

	"data-analysis-platform/internal/database"
	"data-analysis-platform/internal/models"
	"github.com/gin-gonic/gin"
)

const maxQueryHistory = 100

func RegisterQueryHistoryRoutes(rg *gin.RouterGroup) {
	h := rg.Group("/query-history")
	{
		h.GET("", ListQueryHistory)
		h.POST("", CreateQueryHistory)
		h.DELETE("", ClearQueryHistory)
	}
}

func ListQueryHistory(c *gin.Context) {
	workspaceID := GetWorkspaceID(c)
	var items []models.QueryHistory
	query := database.DB.Order("created_at DESC").Limit(maxQueryHistory)
	if workspaceID != "" {
		query = query.Where("workspace_id = ?", workspaceID)
	}
	if err := query.Find(&items).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func CreateQueryHistory(c *gin.Context) {
	workspaceID := GetWorkspaceID(c)
	var req models.QueryHistory
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	req.WorkspaceID = workspaceID

	if err := database.DB.Create(&req).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// keep only the latest maxQueryHistory records per workspace
	database.DB.Exec(`
		DELETE FROM query_histories
		WHERE workspace_id = ?
		  AND id NOT IN (
		    SELECT id FROM query_histories
		    WHERE workspace_id = ?
		    ORDER BY created_at DESC
		    LIMIT ?
		  )
	`, workspaceID, workspaceID, maxQueryHistory)

	c.JSON(http.StatusCreated, req)
}

func ClearQueryHistory(c *gin.Context) {
	workspaceID := GetWorkspaceID(c)
	query := database.DB
	if workspaceID != "" {
		query = query.Where("workspace_id = ?", workspaceID)
	}
	if err := query.Delete(&models.QueryHistory{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
