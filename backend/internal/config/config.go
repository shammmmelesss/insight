package config

import (
	"os"

	"github.com/jinzhu/configor"
)

type Config struct {
	Server struct {
		Port string `default:"8080"`
	}
	Database struct {
		Host     string `default:"localhost"`
		Port     string `default:"5432"`
		User     string `default:"postgres"`
		Password string `default:""`
		DBName   string `default:"data_analysis"`
		SSLMode  string `default:"disable"`
	}
}

func LoadConfig() (*Config, error) {
	var cfg Config
	err := configor.Load(&cfg, "config.yml")
	if err != nil {
		// 配置文件加载失败，使用默认值
		cfg.Server.Port = "8080"
		cfg.Database.Host = "localhost"
		cfg.Database.Port = "5432"
		cfg.Database.User = "postgres"
		cfg.Database.Password = ""
		cfg.Database.DBName = "data_analysis"
		cfg.Database.SSLMode = "disable"
	}

	// 环境变量覆盖（优先级最高）
	if v := os.Getenv("DB_HOST"); v != "" {
		cfg.Database.Host = v
	}
	if v := os.Getenv("DB_PORT"); v != "" {
		cfg.Database.Port = v
	}
	if v := os.Getenv("DB_USER"); v != "" {
		cfg.Database.User = v
	}
	if v := os.Getenv("DB_PASSWORD"); v != "" {
		cfg.Database.Password = v
	}
	if v := os.Getenv("DB_NAME"); v != "" {
		cfg.Database.DBName = v
	}
	if v := os.Getenv("DB_SSLMODE"); v != "" {
		cfg.Database.SSLMode = v
	}
	if v := os.Getenv("SERVER_PORT"); v != "" {
		cfg.Server.Port = v
	}

	return &cfg, nil
}
