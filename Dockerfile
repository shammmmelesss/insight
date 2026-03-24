# 使用官方的Go镜像作为基础镜像
FROM golang:1.25-alpine AS builder

# 设置工作目录
WORKDIR /app

# 复制go.mod和go.sum文件
COPY backend/go.mod backend/go.sum ./

# 下载依赖
RUN go mod download

# 复制整个后端代码
COPY backend/ ./

# 构建应用
RUN go build -o main ./cmd/main.go

# 使用更小的alpine镜像作为运行时
FROM alpine:latest

# 设置工作目录
WORKDIR /app

# 复制构建好的应用
COPY --from=builder /app/main .

# 复制配置文件
COPY backend/config.yml .

# 暴露端口
EXPOSE 8080

# 运行应用
CMD ["./main"]