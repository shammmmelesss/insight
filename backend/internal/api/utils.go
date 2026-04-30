package api

import (
	"fmt"
	"regexp"

	"github.com/google/uuid"
)

// parseUUID 解析UUID字符串，返回uuid.UUID类型和错误
func parseUUID(id string) (uuid.UUID, error) {
	uid, err := uuid.Parse(id)
	if err != nil {
		return uuid.Nil, fmt.Errorf("invalid UUID: %s", id)
	}
	return uid, nil
}

// isValidIdentifier 校验SQL标识符（字段名/表名），只允许字母、数字、下划线
var validIdentifierRegex = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]*$`)

func isValidIdentifier(name string) bool {
	return validIdentifierRegex.MatchString(name)
}

// isValidExpression 校验计算字段表达式，防止SQL注入。
// 只允许：标识符、数字、算术运算符、括号、空白、点、逗号。
// 拒绝：分号、引号、注释符（-- 和 /* */）。
var (
	validExpressionCharsRegex = regexp.MustCompile(`^[a-zA-Z0-9_\s\+\-\*\/\(\)\.,]+$`)
	dangerousExpressionRegex  = regexp.MustCompile(`--|/\*|\*/|;|'|"`)
)

func isValidExpression(expr string) bool {
	if expr == "" {
		return false
	}
	if dangerousExpressionRegex.MatchString(expr) {
		return false
	}
	return validExpressionCharsRegex.MatchString(expr)
}
