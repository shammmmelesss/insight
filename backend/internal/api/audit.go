package api

import (
	"net/http"

	"data-analysis-platform/internal/models"
	"github.com/gin-gonic/gin"
)

// canModify 判断当前请求用户是否有权修改/删除某条记录
// 规则：createdBy 为空（历史数据无归属）时放开；否则必须是创建人本人。
// 同时兼容历史上以「用户名」存储 createdBy 的数据（图表、监控早期实现）。
func canModify(createdBy string, c *gin.Context) bool {
	if createdBy == "" {
		return true
	}
	if uid := GetCurrentUserID(c); uid != "" && createdBy == uid {
		return true
	}
	if uname := GetCurrentUserName(c); uname != "" && createdBy == uname {
		return true
	}
	return false
}

// abortForbidden 统一返回「无权限修改」响应
func abortForbidden(c *gin.Context, msg string) {
	if msg == "" {
		msg = "只有创建人才能进行此操作"
	}
	c.JSON(http.StatusForbidden, gin.H{"error": msg})
}

// setCreator 在创建记录时填充创建人与修改人（ID + 姓名）
func setCreator(c *gin.Context, af *models.AuditFields) {
	uid := GetCurrentUserID(c)
	uname := GetCurrentUserName(c)
	af.CreatedBy = uid
	af.CreatedByName = uname
	af.UpdatedBy = uid
	af.UpdatedByName = uname
}

// setUpdater 在更新记录时填充修改人（ID + 姓名）
func setUpdater(c *gin.Context, af *models.AuditFields) {
	af.UpdatedBy = GetCurrentUserID(c)
	af.UpdatedByName = GetCurrentUserName(c)
}
