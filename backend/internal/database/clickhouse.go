package database

import (
	"database/sql"
	"fmt"

	"data-analysis-platform/internal/config"

	chdriver "github.com/ClickHouse/clickhouse-go/v2"
)

var ClickHouseDB *sql.DB

// InitClickHouse 初始化 ClickHouse 连接（可选，未配置时降级跳过）
func InitClickHouse(cfg *config.Config) error {
	opts := &chdriver.Options{
		Addr: []string{fmt.Sprintf("%s:%s", cfg.ClickHouse.Host, cfg.ClickHouse.Port)},
		Auth: chdriver.Auth{
			Database: cfg.ClickHouse.DBName,
			Username: cfg.ClickHouse.User,
			Password: cfg.ClickHouse.Password,
		},
	}

	conn := chdriver.OpenDB(opts)
	if err := conn.Ping(); err != nil {
		return fmt.Errorf("clickhouse ping failed: %w", err)
	}

	ClickHouseDB = conn
	return nil
}
