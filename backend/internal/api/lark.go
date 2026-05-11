package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

func RegisterLarkRoutes(rg *gin.RouterGroup) {
	lark := rg.Group("/lark")
	{
		lark.GET("/users/search", SearchLarkUsers)
	}
}

// tenantToken 缓存
var (
	cachedToken   string
	tokenExpireAt time.Time
	tokenMu       sync.Mutex
)

func getTenantAccessToken() (string, error) {
	tokenMu.Lock()
	defer tokenMu.Unlock()

	if cachedToken != "" && time.Now().Before(tokenExpireAt) {
		return cachedToken, nil
	}

	appID := os.Getenv("LARK_APP_ID")
	appSecret := os.Getenv("LARK_APP_SECRET")
	if appID == "" || appSecret == "" {
		return "", fmt.Errorf("LARK_APP_ID or LARK_APP_SECRET not configured")
	}

	body, _ := json.Marshal(map[string]string{"app_id": appID, "app_secret": appSecret})
	resp, err := http.Post(
		"https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
		"application/json",
		bytes.NewReader(body),
	)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var result struct {
		Code              int    `json:"code"`
		Msg               string `json:"msg"`
		TenantAccessToken string `json:"tenant_access_token"`
		Expire            int    `json:"expire"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	if result.Code != 0 {
		return "", fmt.Errorf("lark auth error: %s", result.Msg)
	}

	cachedToken = result.TenantAccessToken
	tokenExpireAt = time.Now().Add(time.Duration(result.Expire-60) * time.Second)
	return cachedToken, nil
}

// SearchLarkUsers 搜索飞书用户
func SearchLarkUsers(c *gin.Context) {
	keyword := c.Query("keyword")
	if keyword == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "keyword is required"})
		return
	}

	token, err := getTenantAccessToken()
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": err.Error()})
		return
	}

	req, _ := http.NewRequest("GET",
		fmt.Sprintf("https://open.feishu.cn/open-apis/contact/v3/users/find_by_keyword?keyword=%s&page_size=20", keyword),
		nil,
	)
	req.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": err.Error()})
		return
	}
	defer resp.Body.Close()

	data, _ := io.ReadAll(resp.Body)

	var result struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
		Data struct {
			UserList []struct {
				OpenID string `json:"open_id"`
				Name   string `json:"name"`
				Avatar struct {
					AvatarMiddle string `json:"avatar_middle"`
				} `json:"avatar"`
			} `json:"user_list"`
		} `json:"data"`
	}

	if err := json.Unmarshal(data, &result); err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "failed to parse lark response"})
		return
	}
	if result.Code != 0 {
		c.JSON(http.StatusBadGateway, gin.H{"error": result.Msg})
		return
	}

	users := make([]map[string]string, 0)
	for _, u := range result.Data.UserList {
		users = append(users, map[string]string{
			"openId": u.OpenID,
			"name":   u.Name,
			"avatar": u.Avatar.AvatarMiddle,
		})
	}
	c.JSON(http.StatusOK, gin.H{"items": users})
}
