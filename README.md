# Insight - 数据分析平台

## 项目概述

Insight 是一个现代化的数据分析平台，支持多数据源接入、SQL 数据集构建、可视化图表配置和交互式看板搭建。项目采用前后端分离架构，后端使用 Go + Gin，前端使用 React + TypeScript + Ant Design。

## 技术栈

### 后端
- Go 1.25 / Gin / GORM
- PostgreSQL（主存储，UUID 主键，JSONB 字段）
- 多数据库驱动：MySQL、PostgreSQL、SQL Server、Oracle、BigQuery

### 前端
- React 18 / TypeScript 5 / Vite 5
- Ant Design 5（UI 组件）
- AntV G2（柱状图、折线图、饼图、指标卡）
- AntV S2（交叉表 / 透视表）
- React Router 6 / Axios

### 部署
- Docker + Docker Compose
- PostgreSQL 15（容器化）
- 多阶段构建（Go + Nginx）

## 核心功能

### 1. 数据源管理（`/data-sources`）
支持 PostgreSQL、MySQL、Oracle、SQL Server、BigQuery 等数据库类型。提供连接测试、激活/停用管理，密码在 API 响应中自动脱敏。

### 2. 数据集管理（`/datasets`）
基于 SQL 查询创建数据集，自动检测字段类型（维度/度量），支持字段预览和数据预览。

### 3. 图表配置（`/charts`、`/chart-config`）
支持 5 种图表类型：

| 类型 | 说明 | 配置项 |
|------|------|--------|
| 交叉表 | 透视分析 | 行字段、列字段、度量字段 |
| 柱状图 | 分类对比 | X 轴、Y 轴（支持多个）、分组 |
| 折线图 | 趋势分析 | X 轴、Y 轴（支持多个）、分组 |
| 饼图 | 占比分析 | 分组字段、度量字段 |
| 指标卡 | KPI 展示 | 指标字段 |

图表配置页支持拖拽字段分配、聚合方式选择（求和/平均/最大/最小/计数/去重计数）、实时数据预览和 SQL 查看。

### 4. 看板管理（`/dashboards`）
- 创建看板并添加/移除图表
- 网格布局，支持中图（半宽）和大图（全宽）切换
- 筛选器系统：支持单选、多选、日期区间三种类型，可绑定到指定图表，支持默认值，筛选值变化时实时刷新数据
- 筛选器配置随看板持久化保存

### 5. 首页（`/`）
快捷导航 + 最近更新的数据集、图表、看板。

## 项目结构

```
├── backend/
│   ├── cmd/main.go                # 入口，自动迁移 + 路由注册
│   ├── config.yml                 # 配置文件
│   └── internal/
│       ├── api/                   # 路由与处理函数
│       │   ├── routes.go          # 路由注册
│       │   ├── datasource.go      # 数据源 API
│       │   ├── dataset.go         # 数据集 API
│       │   ├── chart.go           # 图表 API（含动态 SQL 生成）
│       │   ├── dashboard.go       # 看板 API
│       │   ├── home.go            # 首页 API
│       │   └── utils.go           # SQL 安全工具函数
│       ├── config/config.go       # 配置加载（文件 + 环境变量）
│       ├── database/database.go   # 数据库连接
│       └── models/models.go       # 数据模型
├── frontend/
│   └── src/
│       ├── App.tsx                # 路由定义
│       ├── components/
│       │   ├── Layout/            # 全局布局（导航 + 内容区）
│       │   ├── ChartRenderer.tsx  # 通用图表渲染组件
│       │   ├── FilterConfigModal/ # 筛选器配置弹窗
│       │   ├── DashboardList/     # 看板列表侧边栏
│       │   └── ErrorBoundary.tsx  # 错误边界
│       └── pages/
│           ├── HomePage/          # 首页
│           ├── DataSourcesPage/   # 数据源管理
│           ├── DatasetsPage/      # 数据集管理
│           ├── ChartsPage/        # 图表列表
│           ├── ChartConfigPage/   # 图表配置（拖拽式）
│           ├── DashboardsPage/    # 看板展示
│           ├── DashboardEditPage/ # 看板编辑
│           └── NotFound/          # 404
├── shared/
│   └── api.interface.ts           # 前后端共享类型定义
├── docker-compose.yml             # PostgreSQL 容器
├── Dockerfile                     # 后端镜像
└── Dockerfile.frontend            # 前端镜像（Nginx）
```

## 快速开始

### 环境要求
- Go 1.21+
- Node.js 18+
- PostgreSQL 15+

---

## 本地开发启动

### 1. 启动数据库
```bash
docker compose up -d
```

### 2. 启动后端
```bash
cd backend
go mod download
go run cmd/main.go
# 服务运行在 http://localhost:8080
# lsof -ti:8080 | xargs kill -9 2>/dev/null; cd backend; go mod download; go run cmd/main.go
```

### 3. 启动前端
```bash
cd frontend
npm install
npm run dev
# 服务运行在 http://localhost:3000
```

前端开发服务器会自动将 `/api` 请求代理到后端 `http://localhost:8080`，修改源码后页面自动热更新。

---

## 服务器部署（持久化服务）

服务器上前后端均通过 **systemd** 管理，开机自启，崩溃自动重启。

### 服务地址

| 服务 | 地址 | 说明 |
|------|------|------|
| 前端（Vite dev server） | `http://172.31.16.190:3000` | 实时编译，改代码自动热更新 |
| 后端 API | `http://172.31.16.190:8080` | Go 编译后的二进制 |

### 服务管理

```bash
# 查看状态
sudo systemctl status insight          # 后端
sudo systemctl status insight-frontend # 前端

# 启动 / 停止 / 重启
sudo systemctl start insight
sudo systemctl restart insight
sudo systemctl stop insight

sudo systemctl restart insight-frontend
```

### 更新部署

拉取代码后，根据改动范围执行以下步骤：

**只改了前端代码**（`frontend/src/` 下）：
```bash
# Vite dev server 会自动热更新，无需任何操作
# 如果热更新失效，重启前端服务即可
sudo systemctl restart insight-frontend
```

**改了后端代码**（`backend/` 下）：
```bash
# 重新编译
cd /home/ubuntu/dev/insight/backend
/usr/local/go/bin/go build -o /home/ubuntu/insight-backend ./cmd/...

# 重启服务
sudo systemctl restart insight
```

**同时改了前后端**（或需要对外发布前端静态构建版）：
```bash
# 编译后端
cd /home/ubuntu/dev/insight/backend
/usr/local/go/bin/go build -o /home/ubuntu/insight-backend ./cmd/...

# 构建前端（生成 frontend/dist/）
cd /home/ubuntu/dev/insight/frontend
node_modules/.bin/vite build

# 重启后端（后端同时服务 frontend/dist/ 静态文件，通过 :8080 访问）
sudo systemctl restart insight
```

### 日志查看

```bash
tail -f /home/ubuntu/insight-backend.log  # 后端日志
tail -f /home/ubuntu/vite.log             # 前端日志
```

### 配置

后端配置通过 `backend/config.yml` 或环境变量：

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `SERVER_PORT` | 8080 | 服务端口 |
| `DB_HOST` | localhost | 数据库地址 |
| `DB_PORT` | 5432 | 数据库端口 |
| `DB_USER` | postgres | 数据库用户 |
| `DB_PASSWORD` | （空） | 数据库密码 |
| `DB_NAME` | data_analysis | 数据库名 |
| `DB_SSLMODE` | disable | SSL 模式 |

## API 接口

| 模块 | 路径 | 说明 |
|------|------|------|
| 数据源 | `/api/data-sources` | CRUD + 连接测试 |
| 数据集 | `/api/datasets` | CRUD + 字段查询 + 数据预览 |
| 图表 | `/api/charts` | CRUD + 图表数据（含筛选） |
| 看板 | `/api/dashboards` | CRUD（含布局和筛选器持久化） |
| 首页 | `/api/recent-updates` | 最近更新 |

## 许可证

MIT
