package main

import (
	"fmt"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"data-analysis-platform/internal/api"
	"data-analysis-platform/internal/config"
	"data-analysis-platform/internal/database"
	"data-analysis-platform/internal/models"
)

func main() {
	// 加载配置
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// 初始化数据库
	err = database.InitDB(cfg)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	// 自动迁移数据库模型
	database.DB.AutoMigrate(
		&models.Workspace{},
		&models.DataSource{},
		&models.Dataset{},
		&models.Chart{},
		&models.Dashboard{},
	)

	// 将 workspace_id 为空的历史数据迁移到第一个项目空间
	migrateOrphanedData()

	// 创建Gin引擎
	r := gin.Default()

	// CORS中间件 — 限制允许的来源
	r.Use(corsMiddleware(cfg.Server.AllowedOrigins))

	// 数据库可用性中间件
	r.Use(dbCheckMiddleware())

	// 健康检查端点
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// 注册API路由
	api.RegisterRoutes(r)

	// 启动服务器
	port := cfg.Server.Port
	log.Printf("Server is running on port %s", port)
	r.Run(fmt.Sprintf(":%s", port))
}

// migrateOrphanedData 将 workspace_id 为空的历史数据分配到第一个项目空间
func migrateOrphanedData() {
	// 检查是否有 workspace_id 为空的数据
	var count int64
	database.DB.Raw("SELECT COUNT(*) FROM dashboards WHERE workspace_id IS NULL").Scan(&count)
	if count == 0 {
		return
	}

	// 获取第一个项目空间，没有则创建
	var workspace models.Workspace
	result := database.DB.Order("created_at asc").First(&workspace)
	if result.Error != nil {
		workspace = models.Workspace{Name: "默认空间", Description: "系统自动创建的默认项目空间"}
		database.DB.Create(&workspace)
	}

	wsID := workspace.ID.String()
	log.Printf("Migrating orphaned data to workspace: %s (%s)", workspace.Name, wsID)

	// 使用原生 SQL 避免 GORM 类型转换问题
	tables := []string{"data_sources", "datasets", "charts", "dashboards"}
	for _, table := range tables {
		database.DB.Exec("UPDATE "+table+" SET workspace_id = ? WHERE workspace_id IS NULL", wsID)
	}

	log.Println("Orphaned data migration completed")
}

// corsMiddleware 设置CORS，允许来源列表从配置加载（支持环境变量 ALLOWED_ORIGINS）
func corsMiddleware(allowedOrigins []string) gin.HandlerFunc {
	originSet := make(map[string]struct{}, len(allowedOrigins))
	for _, o := range allowedOrigins {
		originSet[o] = struct{}{}
	}
	return func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		_, allowed := originSet[origin]

		if allowed {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		}

		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Workspace-Id")
		c.Writer.Header().Set("Access-Control-Max-Age", "86400")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}

// dbCheckMiddleware 统一检查数据库连接是否可用
func dbCheckMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		// 健康检查端点不需要数据库
		if c.Request.URL.Path == "/health" {
			c.Next()
			return
		}
		if database.DB == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"error": "Database connection not available"})
			c.Abort()
			return
		}
		c.Next()
	}
}
