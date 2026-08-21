package api

import (
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// 门户（arsenal 产品与服务）上游接口基址
const portalAPIBase = "https://work.learnings.ai/portal/api/workplace/v1"

// RegisterPortalRoutes 注册门户同源代理路由。
// 前端不能直连 work.learnings.ai（公网源访问内网地址会被浏览器 CORS/PNA 拦截），
// 统一走后端代理并转发 Cookie 完成鉴权。
func RegisterPortalRoutes(rg *gin.RouterGroup) {
	portal := rg.Group("/portal")
	{
		portal.GET("/navigation", func(c *gin.Context) {
			proxyToPortal(c, "GET", portalAPIBase+"/navigation")
		})
		portal.POST("/applications/search", func(c *gin.Context) {
			proxyToPortal(c, "POST", portalAPIBase+"/applications/search")
		})
	}
}

// proxyToPortal 把请求转发给门户上游，透传 Cookie / 请求体 / Content-Type，并原样返回响应。
func proxyToPortal(c *gin.Context, method, upstreamURL string) {
	var body io.Reader
	if c.Request.Body != nil {
		body = c.Request.Body
	}
	req, err := http.NewRequest(method, upstreamURL, body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if cookie := c.GetHeader("Cookie"); cookie != "" {
		req.Header.Set("Cookie", cookie)
	}
	if ct := c.GetHeader("Content-Type"); ct != "" {
		req.Header.Set("Content-Type", ct)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	contentType := resp.Header.Get("Content-Type")
	if contentType == "" {
		contentType = "application/json"
	}
	c.Data(resp.StatusCode, contentType, data)
}
