package database

import (
	"database/sql"
	"fmt"
	"time"

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
		// 大数据量写入时，单批 Commit 需要较长的读超时，避免客户端提前超时
		DialTimeout: 30 * time.Second,
		ReadTimeout: 10 * time.Minute,
		Settings: chdriver.Settings{
			// 兜底的服务端单次执行时限；分批写入后每批都是秒级，此处仅防异常查询无限跑
			"max_execution_time": 1800,
		},
		MaxOpenConns:    10,
		MaxIdleConns:    5,
		ConnMaxLifetime: time.Hour,
	}

	conn := chdriver.OpenDB(opts)
	if err := conn.Ping(); err != nil {
		return fmt.Errorf("clickhouse ping failed: %w", err)
	}

	ClickHouseDB = conn
	return nil
}
