package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// BaseModel 基础模型
type BaseModel struct {
	ID        uuid.UUID `gorm:"type:uuid;primary_key;default:gen_random_uuid()" json:"id"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// Workspace 项目空间模型
type Workspace struct {
	BaseModel
	Name        string `json:"name"`
	Description string `json:"description"`
}

// DataSource 数据源模型
type DataSource struct {
	BaseModel
	WorkspaceID string `json:"workspaceId" gorm:"column:workspace_id;type:uuid;index"`
	Name        string `json:"name"`
	Type        string `json:"type" gorm:"default:'mysql'"`
	Host        string `json:"host"`
	Port        int    `json:"port" gorm:"default:3306"`
	Database    string `json:"database"`
	Username    string `json:"username"`
	Password    string `json:"-"` // 不在JSON响应中暴露密码
	Credentials string `json:"-" gorm:"type:text"` // BigQuery Service Account JSON 凭证
	IsActive    bool   `json:"isActive" gorm:"default:true"`
}

// GetPassword 仅在内部使用，包含密码字段
func (ds DataSource) GetPassword() string {
	return ds.Password
}

// Dataset 数据集模型
type Dataset struct {
	BaseModel
	WorkspaceID  string  `json:"workspaceId" gorm:"column:workspace_id;type:uuid;index"`
	Name         string  `json:"name"`
	SQL          string  `json:"sql"`
	Description  string  `json:"description"`
	FieldsConfig string  `json:"fieldsConfig" gorm:"type:jsonb;default:'[]'"`
	DataSourceID string  `json:"dataSourceId" gorm:"column:data_source_id;type:uuid"`
	Charts       []Chart `json:"-" gorm:"foreignKey:DatasetID"`
}

// ChartType 图表类型
type ChartType string

const (
	ChartTypeCrossTable ChartType = "crossTable"
	ChartTypeBar        ChartType = "bar"
	ChartTypeLine       ChartType = "line"
	ChartTypePie        ChartType = "pie"
	ChartTypeIndicator  ChartType = "indicator"
)

// Chart 图表模型
type Chart struct {
	BaseModel
	WorkspaceID string    `json:"workspaceId" gorm:"column:workspace_id;type:uuid;index"`
	Name        string    `json:"name"`
	DatasetID   uuid.UUID `json:"datasetId"`
	Type        ChartType `json:"type"`
	Config      string    `json:"config" gorm:"type:jsonb;default:'{}'"`
	Dataset     Dataset   `json:"-" gorm:"foreignKey:DatasetID"`
}

// DashboardLayoutItem 看板布局项
type DashboardLayoutItem struct {
	ChartID string `json:"chartId"`
	X       int    `json:"x"`
	Y       int    `json:"y"`
	Width   int    `json:"width"`
	Height  int    `json:"height"`
}

// Dashboard 看板模型
type Dashboard struct {
	BaseModel
	WorkspaceID string `json:"workspaceId" gorm:"column:workspace_id;type:uuid;index"`
	Name        string `json:"name"`
	Layout      string `json:"layout" gorm:"type:jsonb;default:'[]'"`
	Filters     string `json:"filters" gorm:"type:jsonb;default:'[]'"`
}

// BeforeCreate 创建前钩子，生成UUID
func (m *BaseModel) BeforeCreate(tx *gorm.DB) error {
	if m.ID == uuid.Nil {
		m.ID = uuid.New()
	}
	return nil
}
