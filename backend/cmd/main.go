package main

import (
	"fmt"
	"log"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	_ "time/tzdata"

	"github.com/gin-gonic/gin"
	"data-analysis-platform/internal/api"
	"data-analysis-platform/internal/config"
	"data-analysis-platform/internal/database"
)

func main() {
	// 加载配置
	cfg, err := config.LoadConfig()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// 将 config 中的 Lark 配置写入环境变量（环境变量已有值时不覆盖）
	if cfg.Lark.AppID != "" && os.Getenv("LARK_APP_ID") == "" {
		os.Setenv("LARK_APP_ID", cfg.Lark.AppID)
	}
	if cfg.Lark.AppSecret != "" && os.Getenv("LARK_APP_SECRET") == "" {
		os.Setenv("LARK_APP_SECRET", cfg.Lark.AppSecret)
	}
	// 初始化数据库
	err = database.InitDB(cfg)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}

	// 初始化 ClickHouse（可选，连接失败时仅警告）
	if err := database.InitClickHouse(cfg); err != nil {
		log.Printf("ClickHouse not available, extract feature disabled: %v", err)
	} else {
		log.Println("Connected to ClickHouse successfully")
		api.StartExtractScheduler()
		log.Println("Extract scheduler started")
	}

	api.StartMonitorScheduler()
	log.Println("Monitor scheduler started")

	// 自动迁移数据库模型
	if err := database.AutoMigrate(); err != nil {
		log.Fatalf("Failed to auto migrate: %v", err)
	}

	// 将 workspace_id 为空的历史数据迁移到第一个项目空间
	if err := database.MigrateOrphanedData(); err != nil {
		log.Fatalf("Failed to migrate orphaned data: %v", err)
	}

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

	// 服务前端静态文件：hash 命名的资源支持预压缩(.br/.gz) + 长期不可变缓存
	r.GET("/assets/*filepath", serveStaticAsset("../frontend/dist/assets"))
	r.StaticFile("/favicon.ico", "../frontend/dist/favicon.ico")
	r.NoRoute(func(c *gin.Context) {
		c.Header("Cache-Control", "no-cache, no-store, must-revalidate")
		c.File("../frontend/dist/index.html")
	})

	// 启动服务器
	port := cfg.Server.Port
	log.Printf("Server is running on port %s", port)
	r.Run(fmt.Sprintf(":%s", port))
}

// serveStaticAsset 服务前端 hash 静态资源：优先发送预压缩文件(.br/.gz)，并设置长期不可变缓存。
// 因为文件名带内容 hash，内容变更即换名，可安全使用 immutable 缓存一年。
func serveStaticAsset(root string) gin.HandlerFunc {
	absRoot, _ := filepath.Abs(root)
	return func(c *gin.Context) {
		rel := filepath.Clean("/" + c.Param("filepath"))
		fullPath := filepath.Join(absRoot, rel)
		// 防目录穿越：最终路径必须仍在 root 内
		if !strings.HasPrefix(fullPath, absRoot+string(os.PathSeparator)) {
			c.Status(http.StatusForbidden)
			return
		}
		if info, err := os.Stat(fullPath); err != nil || info.IsDir() {
			c.Status(http.StatusNotFound)
			return
		}

		// 依原始扩展名设置 Content-Type（预压缩文件不能靠内容嗅探）
		if ct := mime.TypeByExtension(filepath.Ext(fullPath)); ct != "" {
			c.Header("Content-Type", ct)
		}
		c.Header("Cache-Control", "public, max-age=31536000, immutable")
		c.Header("Vary", "Accept-Encoding")

		accept := c.GetHeader("Accept-Encoding")
		if strings.Contains(accept, "br") {
			if _, err := os.Stat(fullPath + ".br"); err == nil {
				c.Header("Content-Encoding", "br")
				c.File(fullPath + ".br")
				return
			}
		}
		if strings.Contains(accept, "gzip") {
			if _, err := os.Stat(fullPath + ".gz"); err == nil {
				c.Header("Content-Encoding", "gzip")
				c.File(fullPath + ".gz")
				return
			}
		}
		c.File(fullPath)
	}
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
