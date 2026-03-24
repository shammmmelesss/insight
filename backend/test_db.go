package main

import (
	"fmt"
	"log"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func main() {
	// 直接使用正确的连接字符串
	dsn := "host=localhost port=5432 user=Frank password= dbname=data_analysis sslmode=disable"
	fmt.Printf("Connecting with DSN: %s\n", dsn)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("Failed to connect: %v", err)
	}

	log.Println("Connected successfully!")
	
	// 获取底层sql.DB对象
	sqlDB, err := db.DB()
	if err != nil {
		log.Fatalf("Failed to get sql.DB: %v", err)
	}
	defer sqlDB.Close()
	
	// 测试连接
	if err := sqlDB.Ping(); err != nil {
		log.Fatalf("Failed to ping: %v", err)
	}
	
	log.Println("Ping successful!")
}