# Bugfix Requirements Document

## Introduction

柱状图和折线图在数据渲染时存在多个 bug，导致图表无法正确显示数据。主要问题包括：(1) `ChartRenderer` 中 `getActualField` 使用 `startsWith` 匹配聚合字段名，当同一字段存在多种聚合方式时会错误匹配到第一个找到的字段；(2) 柱状图和折线图只渲染第一个 Y 轴字段，忽略用户配置的多个 Y 轴指标；(3) 前端 `generateSQL` 中去重计数的 SQL 拼接缺少左括号，生成的 SQL 语法错误；(4) `ChartConfigPage` 中获取图表数据的 `useEffect` 调用了 `generateSQL()` 但该函数未被 `useCallback` 包裹，存在闭包引用过期状态的风险。

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN 同一字段配置了多种聚合方式（如 `amount_计数` 和 `amount_求和` 同时存在于数据中）THEN `ChartRenderer` 的 `getActualField` 函数使用 `f.startsWith(field + '_')` 匹配，只返回第一个匹配到的聚合字段，导致后续的聚合字段被错误映射

1.2 WHEN 用户在柱状图或折线图中配置了多个 Y 轴指标字段 THEN `renderBarChart` 和 `renderLineChart` 只取 `yAxisFields[0]` 进行渲染，其余 Y 轴字段被完全忽略，图表数据展示不完整

1.3 WHEN 用户在前端 `ChartConfigPage` 中为某个字段选择"去重计数"聚合方式 THEN `generateSQL` 生成的 SQL 片段为 `COUNT(DISTINCT fieldName) AS fieldName_去重计数`，其中 `mapAggregationToSQL('去重计数')` 返回 `COUNT(DISTINCT`，拼接时写成 `${aggregationFunction} ${field.originalName})`，缺少左括号 `(`，实际生成 `COUNT(DISTINCT fieldName)` 看似正确但拼接方式不规范且与其他聚合方式的模板不一致，容易在字段名包含特殊字符时出错

1.4 WHEN `ChartConfigPage` 中字段配置（如 `xAxisFields`、`yAxisFields` 等）发生变化触发 `useEffect` 重新获取数据 THEN `generateSQL` 函数在组件内每次渲染都重新创建，`useEffect` 中调用的 `generateSQL()` 可能捕获到过期的闭包状态值，导致生成的 SQL 与当前实际配置不一致

### Expected Behavior (Correct)

2.1 WHEN 同一字段配置了多种聚合方式 THEN `ChartRenderer` 的字段匹配逻辑 SHALL 精确匹配每个聚合字段的完整别名（如 `fieldName_聚合方式`），确保每个聚合字段都能正确映射到对应的数据列

2.2 WHEN 用户在柱状图或折线图中配置了多个 Y 轴指标字段 THEN 渲染函数 SHALL 将所有 Y 轴字段都渲染到图表中（例如通过数据转换为长格式后使用颜色编码区分不同指标，或使用多系列渲染），确保所有配置的指标数据都能在图表中展示

2.3 WHEN 用户选择"去重计数"聚合方式 THEN `generateSQL` SHALL 生成语法正确且格式统一的 SQL 片段 `COUNT(DISTINCT(fieldName)) AS fieldName_去重计数`，与其他聚合方式保持一致的拼接模板

2.4 WHEN 字段配置发生变化触发数据重新获取 THEN `generateSQL` 函数 SHALL 始终使用最新的字段配置状态生成 SQL，确保生成的 SQL 与当前 UI 配置完全一致

### Unchanged Behavior (Regression Prevention)

3.1 WHEN 柱状图或折线图只配置了单个 Y 轴字段 THEN 系统 SHALL CONTINUE TO 正常渲染该单个指标的图表，行为与修复前一致

3.2 WHEN 数据中每个字段只有一种聚合方式（无重名前缀冲突）THEN `getActualField` SHALL CONTINUE TO 正确匹配到对应的聚合字段

3.3 WHEN 使用非去重计数的聚合方式（求和、平均值、最大值、最小值、计数）THEN `generateSQL` SHALL CONTINUE TO 生成正确的 SQL 聚合语句

3.4 WHEN 交叉表、饼图、指标卡等其他图表类型渲染数据 THEN 系统 SHALL CONTINUE TO 正常渲染，不受柱状图/折线图修复的影响

3.5 WHEN 通过后端 `/api/charts/{id}/data` 接口获取已保存图表的数据 THEN 后端 `buildChartSQL` SHALL CONTINUE TO 正确生成聚合 SQL 并返回数据
