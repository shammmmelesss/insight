package api

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strconv"
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

// SendLarkDirectMessage 通过 Bot 给指定 open_id 用户发私信
func SendLarkDirectMessage(openID, title, content string) error {
	token, err := getTenantAccessToken()
	if err != nil {
		return err
	}
	msg := map[string]interface{}{
		"zh_cn": map[string]interface{}{
			"title": title,
			"content": [][]map[string]interface{}{
				{{"tag": "text", "text": content}},
			},
		},
	}
	msgJSON, _ := json.Marshal(msg)
	payload, _ := json.Marshal(map[string]string{
		"receive_id": openID,
		"msg_type":   "post",
		"content":    string(msgJSON),
	})
	req, _ := http.NewRequest("POST",
		"https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id",
		bytes.NewReader(payload))
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	var result struct {
		Code int    `json:"code"`
		Msg  string `json:"msg"`
	}
	json.NewDecoder(resp.Body).Decode(&result)
	if result.Code != 0 {
		return fmt.Errorf("lark im error: %s", result.Msg)
	}
	return nil
}

func larkWebhookSign(secret string, ts int64) string {
	msg := strconv.FormatInt(ts, 10) + "\n" + secret
	h := hmac.New(sha256.New, []byte(msg))
	return base64.StdEncoding.EncodeToString(h.Sum(nil))
}

// SendLarkWebhookMessage 通过 Webhook 发送飞书群消息，lines 中每个元素单独一行
func SendLarkWebhookMessage(title string, lines []string) error {
	webhookURL := os.Getenv("LARK_WEBHOOK_URL")
	secret := os.Getenv("LARK_WEBHOOK_SECRET")
	if webhookURL == "" || secret == "" {
		return fmt.Errorf("LARK_WEBHOOK_URL or LARK_WEBHOOK_SECRET not configured")
	}

	paragraphs := make([][]map[string]interface{}, len(lines))
	for i, line := range lines {
		paragraphs[i] = []map[string]interface{}{{"tag": "text", "text": line}}
	}

	ts := time.Now().Unix()
	payload := map[string]interface{}{
		"timestamp": strconv.FormatInt(ts, 10),
		"sign":      larkWebhookSign(secret, ts),
		"msg_type":  "post",
		"content": map[string]interface{}{
			"post": map[string]interface{}{
				"zh_cn": map[string]interface{}{
					"title":   title,
					"content": paragraphs,
				},
			},
		},
	}
	body, _ := json.Marshal(payload)
	resp, err := http.Post(webhookURL, "application/json", bytes.NewReader(body))
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	var result struct {
		Code       int    `json:"code"`
		Msg        string `json:"msg"`
		StatusCode int    `json:"StatusCode"`
		StatusMsg  string `json:"StatusMessage"`
	}
	json.NewDecoder(resp.Body).Decode(&result)
	if result.Code != 0 {
		return fmt.Errorf("lark webhook error (code=%d): %s", result.Code, result.Msg)
	}
	if result.StatusCode != 0 {
		return fmt.Errorf("lark webhook error (StatusCode=%d): %s", result.StatusCode, result.StatusMsg)
	}
	return nil
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
