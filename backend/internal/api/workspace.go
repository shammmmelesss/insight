package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"data-analysis-platform/internal/database"
	"data-analysis-platform/internal/models"
)

// RegisterWorkspaceRoutes 注册项目空间路由
func RegisterWorkspaceRoutes(rg *gin.RouterGroup) {
	workspace := rg.Group("/workspaces")
	{
		workspace.GET("", ListWorkspaces)
		workspace.POST("", CreateWorkspace)
		workspace.GET("/:id", GetWorkspace)
		workspace.PUT("/:id", UpdateWorkspace)
		workspace.DELETE("/:id", DeleteWorkspace)
	}
}

// ListWorkspaces 获取项目空间列表
func ListWorkspaces(c *gin.Context) {
	var workspaces []models.Workspace
	result := database.DB.Order("created_at asc").Find(&workspaces)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}
	if workspaces == nil {
		workspaces = []models.Workspace{}
	}
	c.JSON(http.StatusOK, gin.H{"items": workspaces})
}

// CreateWorkspace 创建项目空间
func CreateWorkspace(c *gin.Context) {
	var req struct {
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	workspace := models.Workspace{
		Name:        req.Name,
		Description: req.Description,
	}
	result := database.DB.Create(&workspace)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}
	c.JSON(http.StatusCreated, workspace)
}

// GetWorkspace 获取项目空间详情
func GetWorkspace(c *gin.Context) {
	id := c.Param("id")
	var workspace models.Workspace
	result := database.DB.First(&workspace, "id = ?", id)
	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Workspace not found"})
		return
	}
	c.JSON(http.StatusOK, workspace)
}

// UpdateWorkspace 更新项目空间
func UpdateWorkspace(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var workspace models.Workspace
	result := database.DB.First(&workspace, "id = ?", id)
	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Workspace not found"})
		return
	}

	workspace.Name = req.Name
	workspace.Description = req.Description
	result = database.DB.Save(&workspace)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}
	c.JSON(http.StatusOK, workspace)
}

// DeleteWorkspace 删除项目空间
func DeleteWorkspace(c *gin.Context) {
	id := c.Param("id")
	result := database.DB.Delete(&models.Workspace{}, "id = ?", id)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true})
}

// GetWorkspaceID 从请求头获取当前项目空间ID
func GetWorkspaceID(c *gin.Context) string {
	return c.GetHeader("X-Workspace-Id")
}
