package api

import (
	"database/sql"
	"encoding/base64"
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"data-analysis-platform/internal/database"
	"data-analysis-platform/internal/models"

	_ "github.com/go-sql-driver/mysql"
	_ "github.com/lib/pq"
	_ "github.com/microsoft/go-mssqldb"
	_ "github.com/oracle/oci-go-sdk/v65/database"
	_ "github.com/viant/bigquery"
)

// RegisterDataSourceRoutes 注册数据源路由
func RegisterDataSourceRoutes(rg *gin.RouterGroup) {
	dataSource := rg.Group("/data-sources")
	{
		dataSource.GET("", ListDataSources)
		dataSource.POST("", CreateDataSource)
		dataSource.GET("/:id", GetDataSource)
		dataSource.PUT("/:id", UpdateDataSource)
		dataSource.DELETE("/:id", DeleteDataSource)
		dataSource.POST("/:id/test", TestDataSourceConnection)
	}
}

// dataSourceResponse 构建数据源响应（脱敏敏感字段）
func dataSourceResponse(ds models.DataSource) gin.H {
	maskedPassword := ""
	if ds.Password != "" {
		maskedPassword = "******"
	}
	maskedCredentials := ""
	if ds.Credentials != "" {
		maskedCredentials = "******"
	}
	return gin.H{
		"id":          ds.ID,
		"name":        ds.Name,
		"type":        ds.Type,
		"host":        ds.Host,
		"port":        ds.Port,
		"database":    ds.Database,
		"username":    ds.Username,
		"password":    maskedPassword,
		"credentials": maskedCredentials,
		"isActive":    ds.IsActive,
		"createdAt":   ds.CreatedAt,
		"updatedAt":   ds.UpdatedAt,
	}
}

// isBigQuery 判断是否为BigQuery类型
func isBigQuery(dsType string) bool {
	return dsType == "BigQuery" || dsType == "bigquery"
}

// ListDataSources 获取数据源列表
func ListDataSources(c *gin.Context) {
	workspaceID := GetWorkspaceID(c)
	dataSources := make([]models.DataSource, 0)
	query := database.DB
	if workspaceID != "" {
		query = query.Where("workspace_id = ?", workspaceID)
	}
	result := query.Find(&dataSources)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	items := make([]gin.H, 0)
	for _, ds := range dataSources {
		items = append(items, dataSourceResponse(ds))
	}

	c.JSON(http.StatusOK, gin.H{
		"items":    items,
		"total":    len(items),
		"page":     1,
		"pageSize": len(items),
	})
}

// CreateDataSource 创建数据源
func CreateDataSource(c *gin.Context) {
	var req struct {
		Name        string `json:"name" binding:"required"`
		Type        string `json:"type"`
		Host        string `json:"host"`
		Port        int    `json:"port"`
		Database    string `json:"database" binding:"required"`
		Username    string `json:"username"`
		Password    string `json:"password"`
		Credentials string `json:"credentials"` // BigQuery Service Account JSON
		IsActive    bool   `json:"isActive"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if req.Type == "" {
		req.Type = "mysql"
	}

	// BigQuery 不需要 host/port/username/password，但需要 credentials
	if isBigQuery(req.Type) {
		if req.Credentials == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "BigQuery 数据源需要提供 Service Account JSON 凭证"})
			return
		}
	} else {
		// 传统数据库需要 host/username/password
		if req.Host == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "请输入主机地址"})
			return
		}
		if req.Username == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "请输入用户名"})
			return
		}
		if req.Password == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "请输入密码"})
			return
		}
		if req.Port == 0 {
			req.Port = 3306
		}
	}

	dataSource := models.DataSource{
		WorkspaceID: GetWorkspaceID(c),
		Name:        req.Name,
		Type:        req.Type,
		Host:        req.Host,
		Port:        req.Port,
		Database:    req.Database,
		Username:    req.Username,
		Password:    req.Password,
		Credentials: req.Credentials,
		IsActive:    req.IsActive,
	}

	result := database.DB.Create(&dataSource)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusCreated, dataSourceResponse(dataSource))
}

// GetDataSource 获取数据源详情
func GetDataSource(c *gin.Context) {
	id := c.Param("id")
	var dataSource models.DataSource
	result := database.DB.First(&dataSource, "id = ?", id)
	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "DataSource not found"})
		return
	}

	c.JSON(http.StatusOK, dataSourceResponse(dataSource))
}

// UpdateDataSource 更新数据源
func UpdateDataSource(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Name        string `json:"name" binding:"required"`
		Type        string `json:"type"`
		Host        string `json:"host"`
		Port        int    `json:"port"`
		Database    string `json:"database" binding:"required"`
		Username    string `json:"username"`
		Password    string `json:"password"`
		Credentials string `json:"credentials"`
		IsActive    bool   `json:"isActive"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var dataSource models.DataSource
	result := database.DB.First(&dataSource, "id = ?", id)
	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "DataSource not found"})
		return
	}

	dataSource.Name = req.Name
	dataSource.Type = req.Type
	dataSource.Database = req.Database
	dataSource.IsActive = req.IsActive

	if isBigQuery(req.Type) {
		// BigQuery: 更新凭证（脱敏值不覆盖）
		if req.Credentials != "" && req.Credentials != "******" {
			dataSource.Credentials = req.Credentials
		}
		// 清空传统字段
		dataSource.Host = ""
		dataSource.Port = 0
		dataSource.Username = ""
		dataSource.Password = ""
	} else {
		// 传统数据库
		dataSource.Host = req.Host
		dataSource.Port = req.Port
		dataSource.Username = req.Username
		if req.Password != "******" {
			dataSource.Password = req.Password
		}
		dataSource.Credentials = ""
	}

	result = database.DB.Save(&dataSource)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, dataSourceResponse(dataSource))
}

// DeleteDataSource 删除数据源
func DeleteDataSource(c *gin.Context) {
	id := c.Param("id")
	result := database.DB.Delete(&models.DataSource{}, "id = ?", id)
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": result.Error.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

// TestDataSourceConnection 测试数据源连接
func TestDataSourceConnection(c *gin.Context) {
	id := c.Param("id")
	var dataSource models.DataSource
	result := database.DB.First(&dataSource, "id = ?", id)
	if result.Error != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "DataSource not found"})
		return
	}

	db, err := connectToDataSource(dataSource)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"success": false,
			"message": "Connection failed: " + err.Error(),
		})
		return
	}
	defer db.Close()

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Connection successful",
	})
}

// connectToDataSource 根据数据源信息建立数据库连接
func connectToDataSource(dataSource models.DataSource) (*sql.DB, error) {
	var dsn string
	var driverName string

	switch dataSource.Type {
	case "MySQL", "mysql":
		driverName = "mysql"
		dsn = fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&parseTime=True&loc=Local",
			dataSource.Username, dataSource.Password, dataSource.Host, dataSource.Port, dataSource.Database)
	case "PostgreSQL", "postgresql", "postgres":
		driverName = "postgres"
		dsn = fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=disable",
			dataSource.Host, dataSource.Port, dataSource.Username, dataSource.Password, dataSource.Database)
	case "SQL Server", "sqlserver":
		driverName = "sqlserver"
		dsn = fmt.Sprintf("sqlserver://%s:%s@%s:%d?database=%s",
			dataSource.Username, dataSource.Password, dataSource.Host, dataSource.Port, dataSource.Database)
	case "Oracle", "oracle":
		driverName = "oracle"
		dsn = fmt.Sprintf("oracle://%s:%s@%s:%d/%s",
			dataSource.Username, dataSource.Password, dataSource.Host, dataSource.Port, dataSource.Database)
	case "BigQuery", "bigquery":
		driverName = "bigquery"
		// DSN 格式: bigquery://projectID/datasetID?credJSON=<base64>
		// Database 字段存储 projectID
		projectID := dataSource.Database
		dsn = fmt.Sprintf("bigquery://%s", projectID)
		if dataSource.Credentials != "" {
			encoded := base64.RawURLEncoding.EncodeToString([]byte(dataSource.Credentials))
			dsn = fmt.Sprintf("bigquery://%s?credJSON=%s", projectID, encoded)
		}
	default:
		return nil, fmt.Errorf("不支持的数据源类型: %s", dataSource.Type)
	}

	db, err := sql.Open(driverName, dsn)
	if err != nil {
		return nil, err
	}

	if err := db.Ping(); err != nil {
		db.Close()
		return nil, err
	}

	return db, nil
}
