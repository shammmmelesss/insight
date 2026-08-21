package api

import (
	"github.com/gin-gonic/gin"
)

func RegisterRoutes(r *gin.Engine) {
	// API路由组
	api := r.Group("/api")
	{
		// 项目空间路由（不需要workspace过滤）
		RegisterWorkspaceRoutes(api)
		// 数据源路由
		RegisterDataSourceRoutes(api)
		// 数据集路由
		RegisterDatasetRoutes(api)
		// 图表路由
		RegisterChartRoutes(api)
		// 看板路由
		RegisterDashboardRoutes(api)
		// 监控路由
		RegisterMonitorRoutes(api)
		// 飞书路由
		RegisterLarkRoutes(api)
		// 门户（产品与服务）代理路由
		RegisterPortalRoutes(api)
		// 当前用户
		api.GET("/me", GetMe)
		// 首页最近更新路由
		RegisterHomeRoutes(api)
		// SQL查询历史记录路由
		RegisterQueryHistoryRoutes(api)
	}
}