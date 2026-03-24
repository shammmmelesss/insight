/* 前后端共享的类型写在这里 */

// ==================== 基础类型 ====================

/** 分页请求参数 */
export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

/** 分页响应 */
export interface PaginationResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ==================== 项目空间模块 ====================

/** 项目空间 */
export interface Workspace {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

/** 创建项目空间请求 */
export interface CreateWorkspaceRequest {
  name: string;
  description?: string;
}

/** 更新项目空间请求 */
export interface UpdateWorkspaceRequest {
  name: string;
  description?: string;
}

/** 项目空间列表响应 */
export interface WorkspaceListResponse {
  items: Workspace[];
}

// ==================== 数据集模块 ====================

/** 数据类型 */
export type DataType = "date" | "number" | "text" | "boolean";

/** 字段配置 */
export interface FieldConfig {
  originalName: string;
  displayName: string;
  type: "dimension" | "measure";
  dataType: DataType;
  expression?: string;
}

/** 数据集 */
export interface Dataset {
  id: string;
  name: string;
  sql: string;
  fieldsConfig: FieldConfig[];
  dataSourceId: string;
  description?: string;
  chartCount: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

/** 创建数据集请求 */
export interface CreateDatasetRequest {
  name: string;
  sql: string;
  fieldsConfig: FieldConfig[];
  dataSourceId: string;
}

/** 更新数据集请求 */
export interface UpdateDatasetRequest {
  name: string;
  sql: string;
  fieldsConfig: FieldConfig[];
  dataSourceId: string;
}

/** 数据集列表响应 */
export type DatasetListResponse = PaginationResult<Dataset>;

/** 数据集下拉选项 */
export interface DatasetOption {
  id: string;
  name: string;
}

/** 数据集下拉选项响应 */
export interface DatasetSelectListResponse {
  items: DatasetOption[];
}

/** 数据集字段响应 */
export interface DatasetFieldsResponse {
  id: string;
  name: string;
  fields: FieldConfig[];
}

/** 预览数据集请求 */
export interface PreviewDatasetRequest {
  dataSourceId: string;
  sql: string;
}

/** 预览数据集响应 */
export interface PreviewDatasetResponse {
  columns: Array<{ name: string; type: string }>;
  data: Array<Record<string, any>>;
}

// ==================== 数据源模块 ====================

/** 数据源 */
export interface DataSource {
  id: string;
  name: string;
  type: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  credentials: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 创建数据源请求 */
export interface CreateDataSourceRequest {
  name: string;
  type?: string;
  host?: string;
  port?: number;
  database: string;
  username?: string;
  password?: string;
  credentials?: string;
  isActive?: boolean;
}

/** 更新数据源请求 */
export interface UpdateDataSourceRequest {
  name: string;
  type?: string;
  host?: string;
  port?: number;
  database: string;
  username?: string;
  password?: string;
  credentials?: string;
  isActive?: boolean;
}

/** 数据源列表响应 */
export type DataSourceListResponse = PaginationResult<DataSource>;

/** 数据源下拉选项 */
export interface DataSourceOption {
  id: string;
  name: string;
}

/** 数据源下拉选项响应 */
export interface DataSourceSelectListResponse {
  items: DataSourceOption[];
}

/** 数据源连接测试响应 */
export interface DataSourceTestResponse {
  success: boolean;
  message: string;
}

/** 数据表 */
export interface DataTable {
  name: string;
  columns: DataTableColumn[];
}

/** 数据表列 */
export interface DataTableColumn {
  name: string;
  type: string;
  comment?: string;
}

/** 数据表列表响应 */
export interface DataTableListResponse {
  items: DataTable[];
}

// ==================== 图表模块 ====================

/** 图表类型 */
export type ChartType = "crossTable" | "bar" | "line" | "pie" | "indicator";

/** 图表配置 */
export interface ChartConfig {
  dimensions?: string[];
  measures?: string[];
  filters?: Record<string, any>;
  aggregation?: Record<string, string>;
}

/** 图表 */
export interface Chart {
  id: string;
  name: string;
  datasetId: string;
  datasetName?: string;
  type: ChartType;
  config: ChartConfig;
  dashboardCount: number;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

/** 创建图表请求 */
export interface CreateChartRequest {
  name: string;
  datasetId: string;
  type: ChartType;
  config: ChartConfig;
}

/** 更新图表请求 */
export interface UpdateChartRequest {
  name: string;
  datasetId: string;
  type: ChartType;
  config: ChartConfig;
}

/** 图表列表响应 */
export type ChartListResponse = PaginationResult<Chart>;

/** 图表下拉选项 */
export interface ChartOption {
  id: string;
  name: string;
  type: ChartType;
  datasetId?: string;
}

/** 图表下拉选项响应 */
export interface ChartSelectListResponse {
  items: ChartOption[];
}

/** 图表详情响应 */
export interface ChartDetailResponse {
  id: string;
  name: string;
  datasetId: string;
  type: ChartType;
  config: ChartConfig;
}

/** 预览图表请求 */
export interface PreviewChartRequest {
  datasetId: string;
  config: ChartConfig;
}

/** 预览图表响应 */
export interface PreviewChartResponse {
  columns: Array<{ name: string; type: string }>;
  data: Array<Record<string, any>>;
}

/** 图表数据响应 */
export interface ChartDataResponse {
  chart: ChartDetailResponse;
  data: Array<Record<string, any>>;
}

// ==================== 看板模块 ====================

/** 看板布局项 */
export interface DashboardLayoutItem {
  chartId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 看板 */
export interface Dashboard {
  id: string;
  name: string;
  layout: DashboardLayoutItem[];
  filters: FilterField[];
  createdAt: string;
  updatedAt: string;
}

/** 创建看板请求 */
export interface CreateDashboardRequest {
  name: string;
}

/** 更新看板请求 */
export interface UpdateDashboardRequest {
  name: string;
  layout: DashboardLayoutItem[];
  filters: FilterField[];
}

/** 看板列表响应 */
export type DashboardListResponse = PaginationResult<Dashboard>;

/** 看板详情响应 */
export interface DashboardDetailResponse {
  id: string;
  name: string;
  layout: DashboardLayoutItem[];
}

// ==================== 首页模块 ====================

/** 最近更新的数据集 */
export interface RecentDataset {
  id: string;
  name: string;
  updatedAt: string;
}

/** 最近更新的图表 */
export interface RecentChart {
  id: string;
  name: string;
  updatedAt: string;
}

/** 最近更新的看板 */
export interface RecentDashboard {
  id: string;
  name: string;
  updatedAt: string;
}

/** 最近更新响应 */
export interface RecentUpdatesResponse {
  recentDatasets: RecentDataset[];
  recentCharts: RecentChart[];
  recentDashboards: RecentDashboard[];
}

// ==================== 筛选器模块 ====================

/** 筛选字段配置 */
export interface FilterField {
  id: string;
  name: string;
  dataset: string;
  field: string;
  type: 'multiple' | 'single' | 'dateRange';
  defaultValue: any;
  charts: string[];
}

// ==================== 通用响应 ====================

/** 通用成功响应 */
export interface SuccessResponse {
  success: boolean;
  message?: string;
}

/** 删除数据集响应 */
export interface DeleteDatasetResponse {
  success: boolean;
  message?: string;
}