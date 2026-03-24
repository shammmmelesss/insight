# 柱状图/折线图渲染修复 Bugfix Design

## Overview

柱状图和折线图在数据渲染时存在 4 个相互关联的 bug：`getActualField` 使用 `startsWith` 导致同字段多聚合时匹配错误、柱状图/折线图只渲染第一个 Y 轴字段、去重计数 SQL 拼接模板不一致、`generateSQL` 未用 `useCallback` 包裹导致闭包过期风险。修复策略是逐一针对性修改，确保最小化变更范围，不影响交叉表、饼图、指标卡等其他图表类型。

## Glossary

- **Bug_Condition (C)**: 触发 bug 的条件集合——同字段多聚合匹配、多 Y 轴字段渲染、去重计数 SQL 生成、useEffect 闭包捕获
- **Property (P)**: 修复后的期望行为——精确字段匹配、多系列渲染、正确 SQL 语法、稳定闭包引用
- **Preservation**: 修复不应影响的行为——单 Y 轴渲染、无冲突字段匹配、非去重计数 SQL、其他图表类型
- **getActualField**: `ChartRenderer.tsx` 中根据原始字段名在数据列中查找实际聚合字段名的函数
- **renderBarChart / renderLineChart**: `ChartRenderer.tsx` 中渲染柱状图/折线图的函数，使用 @antv/g2
- **generateSQL**: `ChartConfigPage.tsx` 中根据字段配置生成聚合 SQL 的函数
- **mapAggregationToSQL**: `ChartConfigPage.tsx` 中将中文聚合方式映射为 SQL 函数名的函数

## Bug Details

### Bug Condition

4 个 bug 分别在以下条件下触发：

**Bug 1 - getActualField 模糊匹配**：当数据中存在同一字段的多种聚合结果（如 `amount_计数` 和 `amount_求和`），`startsWith` 返回第一个匹配项而非精确匹配。

**Bug 2 - 单 Y 轴渲染**：当用户配置了多个 Y 轴字段（`yAxisFields.length > 1`），`renderBarChart` 和 `renderLineChart` 只取 `yAxisFields[0]`。

**Bug 3 - 去重计数 SQL 拼接**：当聚合方式为"去重计数"时，`mapAggregationToSQL` 返回 `COUNT(DISTINCT`（含左括号），拼接时写成 `${aggregationFunction} ${field.originalName})`，模板与其他聚合方式不一致。

**Bug 4 - generateSQL 闭包过期**：`generateSQL` 是普通函数，每次渲染重新创建但未被 `useCallback` 包裹，`useEffect` 依赖列表中未包含它，可能捕获过期状态。

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { dataFields: string[], yAxisFields: string[], aggregation: string, generateSQLRef: boolean }
  OUTPUT: boolean

  // Bug 1: 同字段多聚合时 startsWith 匹配错误
  bug1 := EXISTS field IN input.dataFields WHERE
           COUNT(f IN input.dataFields WHERE f.startsWith(field + '_')) > 1

  // Bug 2: 多 Y 轴字段只渲染第一个
  bug2 := input.yAxisFields.length > 1

  // Bug 3: 去重计数 SQL 拼接不一致
  bug3 := input.aggregation == '去重计数'

  // Bug 4: generateSQL 未用 useCallback
  bug4 := input.generateSQLRef == false  // 函数引用不稳定

  RETURN bug1 OR bug2 OR bug3 OR bug4
END FUNCTION
```

### Examples

- **Bug 1**: 数据列为 `['region', 'amount_计数', 'amount_求和']`，调用 `getActualField('amount', dataFields)` 期望根据上下文返回 `amount_求和`，实际返回 `amount_计数`（第一个匹配项）
- **Bug 2**: 配置 `yAxisFields = ['sales', 'profit']`，柱状图只显示 `sales` 的数据，`profit` 完全不可见
- **Bug 3**: 选择"去重计数"，生成 `COUNT(DISTINCT amount) AS amount_去重计数`，虽然语法碰巧正确，但拼接方式为 `${aggregationFunction} ${field})` 而非统一的 `${aggregationFunction}(${field})`，与其他聚合方式模板不一致
- **Bug 4**: 快速切换字段配置时，`useEffect` 中调用的 `generateSQL()` 可能使用旧的 `yAxisFields` 值生成 SQL

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- 单个 Y 轴字段的柱状图/折线图渲染行为保持不变
- 无重名前缀冲突时 `getActualField` 的匹配行为保持不变
- 非去重计数聚合方式（求和、平均值、最大值、最小值、计数）的 SQL 生成保持不变
- 交叉表、饼图、指标卡的渲染逻辑完全不受影响
- 后端 `buildChartSQL` 的行为不受影响（后端去重计数已正确处理）
- 鼠标交互（tooltip、highlight）行为保持不变

**Scope:**
所有不涉及上述 4 个 bug 条件的输入应完全不受修复影响。包括：
- 单 Y 轴字段的图表配置
- 每个字段只有一种聚合方式的数据
- 非去重计数的聚合方式
- 交叉表、饼图、指标卡等其他图表类型

## Hypothesized Root Cause

Based on code analysis, the root causes are confirmed:

1. **getActualField 使用 `startsWith` 而非精确匹配**：`dataFields.find(f => f === field || f.startsWith(field + '_'))` 在同字段多聚合时返回第一个匹配项。需要改为精确匹配完整别名 `fieldName_聚合方式`。但由于 `ChartRenderer` 不知道聚合方式，需要改变匹配策略——调用方应传入完整的聚合字段别名（如 `amount_求和`）而非原始字段名（如 `amount`）。

2. **renderBarChart / renderLineChart 硬编码 `yAxisFields[0]`**：代码中 `actualYField = getActualField(yAxisFields[0], dataFields)` 只取第一个元素。需要遍历所有 `yAxisFields`，将数据从宽格式转换为长格式（fold/melt），然后用颜色编码区分不同指标系列。

3. **去重计数 SQL 拼接模板不一致**：`mapAggregationToSQL('去重计数')` 返回 `COUNT(DISTINCT`，拼接时用 `${aggregationFunction} ${field.originalName})` 而非 `${aggregationFunction}(${field.originalName})`。应统一为 `COUNT(DISTINCT(${field.originalName}))` 格式，即 `mapAggregationToSQL` 返回 `COUNT_DISTINCT` 或类似标识，在拼接处统一处理。

4. **generateSQL 未用 useCallback**：`generateSQL` 是组件内的普通函数，每次渲染都重新创建。`useEffect` 的依赖列表中没有 `generateSQL`，导致 effect 中调用的可能是旧版本。需要用 `useCallback` 包裹并将其加入 `useEffect` 依赖。

## Correctness Properties

Property 1: Bug Condition - getActualField 精确匹配聚合字段

_For any_ 数据列集合中同一原始字段存在多种聚合方式（如 `amount_计数` 和 `amount_求和`），修复后的字段匹配逻辑 SHALL 精确匹配到指定的完整聚合别名，而非返回第一个 `startsWith` 匹配项。

**Validates: Requirements 2.1**

Property 2: Bug Condition - 多 Y 轴字段完整渲染

_For any_ 柱状图或折线图配置中包含多个 Y 轴字段（`yAxisFields.length > 1`），修复后的渲染函数 SHALL 将所有 Y 轴字段的数据都渲染到图表中，通过数据转换为长格式并使用颜色编码区分不同指标系列。

**Validates: Requirements 2.2**

Property 3: Bug Condition - 去重计数 SQL 格式统一

_For any_ 字段配置中聚合方式为"去重计数"，修复后的 `generateSQL` SHALL 生成格式为 `COUNT(DISTINCT(fieldName)) AS fieldName_去重计数` 的 SQL 片段，与其他聚合方式保持一致的 `AGG(field)` 拼接模板。

**Validates: Requirements 2.3**

Property 4: Bug Condition - generateSQL 闭包稳定性

_For any_ 字段配置变化触发的 `useEffect` 执行，修复后的 `generateSQL` SHALL 通过 `useCallback` 包裹确保始终使用最新的字段配置状态，生成与当前 UI 配置一致的 SQL。

**Validates: Requirements 2.4**

Property 5: Preservation - 单 Y 轴和无冲突场景行为不变

_For any_ 单个 Y 轴字段的图表配置，或数据中每个字段只有一种聚合方式的场景，修复后的代码 SHALL 产生与修复前完全相同的渲染结果和 SQL 输出，保持向后兼容。

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

**File**: `frontend/src/components/ChartRenderer.tsx`

**Function**: `getActualField`

**Specific Changes**:
1. **修改匹配策略**：由于 `ChartRenderer` 接收的 `yAxisFields` 是原始字段名数组，而数据中的列名是 `fieldName_聚合方式` 格式，需要改为精确匹配。当传入的字段名本身就是完整别名时直接匹配；否则收集所有 `startsWith` 匹配项，如果只有一个则返回，多个则需要调用方传入完整别名。
   - 更好的方案：修改 `ChartConfigPage` 传给 `ChartRenderer` 的 `yAxisFields` 为完整的聚合别名（如 `['amount_求和', 'profit_计数']`），而非原始字段名。这样 `getActualField` 可以直接精确匹配。

**File**: `frontend/src/components/ChartRenderer.tsx`

**Function**: `renderBarChart` / `renderLineChart`

**Specific Changes**:
2. **支持多 Y 轴字段渲染**：
   - 获取所有 Y 轴字段的实际字段名数组
   - 将宽格式数据转换为长格式：每行数据展开为多行，增加 `_metric`（指标名）和 `_value`（指标值）列
   - 使用 `_metric` 作为颜色编码（color encode），`_value` 作为 Y 轴编码
   - 单个 Y 轴字段时保持原有行为（无需转换）

**File**: `frontend/src/pages/ChartConfigPage/ChartConfigPage.tsx`

**Function**: `generateSQL` / `mapAggregationToSQL`

**Specific Changes**:
3. **统一去重计数 SQL 拼接**：
   - 方案 A：修改 `mapAggregationToSQL('去重计数')` 返回 `COUNT_DISTINCT` 标识，在拼接处特殊处理为 `COUNT(DISTINCT(${field.originalName}))`
   - 方案 B（更简洁）：让所有聚合方式统一返回函数名，去重计数返回 `COUNT(DISTINCT`，但拼接时统一用 `${aggregationFunction}(${field.originalName})` 格式。对于去重计数，结果为 `COUNT(DISTINCT(amount))`，语法正确且格式统一。
   - 采用方案 B：只需修改拼接模板，去掉去重计数的特殊分支

4. **useCallback 包裹 generateSQL**：
   - 用 `useCallback` 包裹 `generateSQL`，依赖数组包含所有使用到的状态：`datasetSQL`, `selectedDataset`, `chartType`, `rowFields`, `colFields`, `measureFields`, `xAxisFields`, `yAxisFields`, `groupFields`, `indicatorFields`, `filterFields`
   - 在 `useEffect` 的依赖数组中加入 `generateSQL`
   - 需要在文件顶部 import `useCallback`

5. **修改 ChartConfigPage 传递给 ChartRenderer 的字段名**：
   - 将 `yAxisFields`（以及 `measureFields`、`indicatorFields`）传递给 `ChartRenderer` 时，使用完整的聚合别名格式 `fieldName_聚合方式`，而非原始字段名
   - 这样 `getActualField` 可以直接精确匹配，从根本上解决 Bug 1

## Testing Strategy

### Validation Approach

测试策略分两阶段：先在未修复代码上验证 bug 存在（探索性测试），再验证修复后行为正确且不引入回归。

### Exploratory Bug Condition Checking

**Goal**: 在未修复代码上复现 bug，确认根因分析正确。

**Test Plan**: 编写单元测试模拟各 bug 条件，在未修复代码上运行观察失败。

**Test Cases**:
1. **getActualField 多聚合匹配测试**: 构造 `dataFields = ['amount_计数', 'amount_求和']`，调用 `getActualField('amount', dataFields)`，验证是否返回错误结果（will fail on unfixed code）
2. **多 Y 轴渲染测试**: 配置 `yAxisFields = ['sales', 'profit']`，验证渲染函数是否只处理第一个字段（will fail on unfixed code）
3. **去重计数 SQL 测试**: 调用 `generateSQL` 生成去重计数 SQL，验证拼接格式是否与其他聚合方式一致（will fail on unfixed code）
4. **generateSQL 闭包测试**: 验证 `generateSQL` 是否被 `useCallback` 包裹（will fail on unfixed code）

**Expected Counterexamples**:
- `getActualField('amount', ['amount_计数', 'amount_求和'])` 返回 `amount_计数` 而非期望的精确匹配
- `renderBarChart` 只处理 `yAxisFields[0]`，忽略其余字段
- 去重计数生成 `COUNT(DISTINCT amount)` 而非 `COUNT(DISTINCT(amount))`

### Fix Checking

**Goal**: 验证修复后所有 bug 条件下的行为正确。

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedFunction(input)
  ASSERT expectedBehavior(result)
END FOR
```

### Preservation Checking

**Goal**: 验证修复后非 bug 条件下的行为与修复前一致。

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalFunction(input) = fixedFunction(input)
END FOR
```

**Testing Approach**: 属性测试适合验证保持性，因为可以自动生成大量非 bug 条件的输入组合，确保修复不引入回归。

**Test Plan**: 先在未修复代码上观察非 bug 输入的行为，再编写属性测试验证修复后行为一致。

**Test Cases**:
1. **单 Y 轴渲染保持**: 验证单个 Y 轴字段的柱状图/折线图渲染结果与修复前一致
2. **无冲突字段匹配保持**: 验证每个字段只有一种聚合方式时 `getActualField` 行为不变
3. **非去重计数 SQL 保持**: 验证求和、平均值、最大值、最小值、计数的 SQL 生成不变
4. **其他图表类型保持**: 验证交叉表、饼图、指标卡渲染不受影响

### Unit Tests

- 测试 `getActualField` 在各种字段名和数据列组合下的匹配结果
- 测试 `mapAggregationToSQL` 各聚合方式的返回值
- 测试 `generateSQL` 在不同图表类型和字段配置下的 SQL 输出
- 测试数据宽格式转长格式的转换逻辑

### Property-Based Tests

- 生成随机字段名和聚合方式组合，验证 `getActualField` 精确匹配
- 生成随机 Y 轴字段数量（1-N），验证渲染函数处理所有字段
- 生成随机聚合方式，验证 SQL 拼接格式统一

### Integration Tests

- 完整流程测试：配置多 Y 轴字段 → 生成 SQL → 获取数据 → 渲染图表
- 切换图表类型测试：从柱状图切换到折线图，验证多 Y 轴渲染正确
- 快速切换字段配置测试：验证 `generateSQL` 始终使用最新状态
