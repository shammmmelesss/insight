# Tasks

- [x] 1. Fix `generateSQL` 去重计数 SQL 拼接和 `useCallback` 包裹 (ChartConfigPage.tsx)
  - [x] 1.1 修改 `generateSQL` 中去重计数的拼接逻辑：去掉所有图表类型中去重计数的特殊 `if` 分支，统一使用 `${aggregationFunction}(${field.originalName})` 模板，使去重计数生成 `COUNT(DISTINCT(fieldName))` 格式
  - [x] 1.2 在文件顶部 import 中添加 `useCallback`，将 `generateSQL` 用 `useCallback` 包裹，依赖数组包含 `datasetSQL`, `selectedDataset`, `chartType`, `rowFields`, `colFields`, `measureFields`, `xAxisFields`, `yAxisFields`, `groupFields`, `indicatorFields`, `filterFields`, `indicatorFields`
  - [x] 1.3 在获取数据的 `useEffect` 依赖数组中加入 `generateSQL`，移除已被 `generateSQL` 内部引用的冗余依赖项
  - [x] 1.4 修改传递给 `ChartRenderer` 的字段名：将 `yAxisFields`、`measureFields`、`indicatorFields` 传递时使用完整聚合别名格式 `fieldName_聚合方式`（如 `amount_求和`），而非原始字段名
- [x] 2. Fix `getActualField` 精确匹配和多 Y 轴渲染 (ChartRenderer.tsx)
  - [x] 2.1 修改 `getActualField` 匹配逻辑：优先精确匹配 `f === field`，如果传入的已经是完整别名则直接返回；否则回退到 `startsWith` 匹配（兼容单聚合场景）
  - [x] 2.2 修改 `renderBarChart` 支持多 Y 轴字段：获取所有 Y 轴字段的实际字段名，当 `yAxisFields.length > 1` 时将宽格式数据转换为长格式（增加 `_metric` 和 `_value` 列），使用 `_metric` 作为颜色编码；单 Y 轴时保持原有逻辑
  - [x] 2.3 修改 `renderLineChart` 支持多 Y 轴字段：与 `renderBarChart` 相同的数据转换逻辑，将宽格式转为长格式后用颜色编码区分系列
- [x] 3. Verify fixes and run diagnostics
  - [x] 3.1 对 `ChartConfigPage.tsx` 运行 getDiagnostics 验证无类型错误
  - [x] 3.2 对 `ChartRenderer.tsx` 运行 getDiagnostics 验证无类型错误
