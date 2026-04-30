package config

import (
	"os"
	"strings"

	"github.com/jinzhu/configor"
)

type Config struct {
	Server struct {
		Port           string   `default:"8080"`
		AllowedOrigins []string `default:"[\"http://localhost:3000\",\"http://127.0.0.1:3000\"]"`
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
		cfg.Server.Port = "8080"
		cfg.Server.AllowedOrigins = []string{"http://localhost:3000", "http://127.0.0.1:3000"}
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
	// ALLOWED_ORIGINS 逗号分隔，如: http://app.example.com,https://app.example.com
	if v := os.Getenv("ALLOWED_ORIGINS"); v != "" {
		cfg.Server.AllowedOrigins = strings.Split(v, ",")
	}

	if len(cfg.Server.AllowedOrigins) == 0 {
		cfg.Server.AllowedOrigins = []string{"http://localhost:3000", "http://127.0.0.1:3000"}
	}

	return &cfg, nil
}
