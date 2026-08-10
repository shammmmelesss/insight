package database

import (
	"fmt"
	"log"

	"data-analysis-platform/internal/models"
)

// AutoMigrate 迁移所有 GORM 模型，任一失败即返回错误。
func AutoMigrate() error {
	if DB == nil {
		return fmt.Errorf("database not initialized")
	}
	if err := DB.AutoMigrate(
		&models.Workspace{},
		&models.DataSource{},
		&models.Dataset{},
		&models.Chart{},
		&models.Dashboard{},
		&models.Monitor{},
		&models.MonitorRecord{},
		&models.QueryHistory{},
	); err != nil {
		return fmt.Errorf("auto migrate models: %w", err)
	}
	return nil
}

// MigrateOrphanedData 将 workspace_id 为空的历史数据分配到第一个项目空间。
func MigrateOrphanedData() error {
	if DB == nil {
		return fmt.Errorf("database not initialized")
	}

	// 检查是否有 workspace_id 为空的数据
	var count int64
	if err := DB.Raw("SELECT COUNT(*) FROM dashboards WHERE workspace_id IS NULL").Scan(&count).Error; err != nil {
		return fmt.Errorf("count orphaned dashboards: %w", err)
	}
	if count == 0 {
		return nil
	}

	// 获取第一个项目空间，没有则创建
	var workspace models.Workspace
	if err := DB.Order("created_at asc").First(&workspace).Error; err != nil {
		workspace = models.Workspace{Name: "默认空间", Description: "系统自动创建的默认项目空间"}
		if err := DB.Create(&workspace).Error; err != nil {
			return fmt.Errorf("create default workspace: %w", err)
		}
	}

	wsID := workspace.ID.String()
	log.Printf("Migrating orphaned data to workspace: %s (%s)", workspace.Name, wsID)

	// 使用原生 SQL 避免 GORM 类型转换问题
	tables := []string{"data_sources", "datasets", "charts", "dashboards"}
	for _, table := range tables {
		if err := DB.Exec("UPDATE "+table+" SET workspace_id = ? WHERE workspace_id IS NULL", wsID).Error; err != nil {
			return fmt.Errorf("migrate orphaned rows in %s: %w", table, err)
		}
	}

	log.Println("Orphaned data migration completed")
	return nil
}
