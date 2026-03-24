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
- Go 1.25+
- Node.js 18+
- PostgreSQL 15+

### 启动数据库
```bash
docker compose up -d
```

### 启动后端
```bash
cd backend
go mod download
go run cmd/main.go
# 服务运行在 http://localhost:8080
```

### 启动前端
```bash
cd frontend
npm install
npm run dev
# 服务运行在 http://localhost:3000
```

前端开发服务器会自动将 `/api` 请求代理到后端 `http://localhost:8080`。

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
