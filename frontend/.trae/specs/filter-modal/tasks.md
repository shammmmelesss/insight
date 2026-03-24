# 看板筛选器配置弹窗 - 实现计划

## [x] Task 1: 创建筛选器配置弹窗组件
- **Priority**: P0
- **Depends On**: None
- **Description**:
  - 创建 FilterConfigModal 组件，包含弹窗基本结构
  - 实现弹窗的打开/关闭逻辑
  - 设计弹窗布局，分为顶部操作栏、左侧字段列表和右侧配置区域
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `human-judgment` TR-1.1: 点击筛选器按钮能正确打开配置弹窗
  - `human-judgment` TR-1.2: 弹窗布局符合设计要求，包含所有必要的区域
- **Notes**: 使用 Ant Design 的 Modal 组件实现

## [x] Task 2: 实现筛选字段管理功能
- **Priority**: P0
- **Depends On**: Task 1
- **Description**:
  - 实现左侧字段列表的展示
  - 实现「+添加筛选字段」功能，支持最多添加10个字段
  - 实现字段选择和高亮功能
  - 支持字段名称编辑
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `human-judgment` TR-2.1: 点击添加按钮能新增筛选字段
  - `human-judgment` TR-2.2: 字段列表能正确显示所有已添加的字段
  - `human-judgment` TR-2.3: 点击字段能切换选中状态
- **Notes**: 字段默认命名为「字段N」，N为序号

## [x] Task 3: 实现数据集和字段选择功能
- **Priority**: P0
- **Depends On**: Task 2
- **Description**:
  - 实现「数据集」下拉选择框
  - 实现「数据集字段」下拉选择框，根据所选数据集动态加载
  - 处理数据集切换时的字段更新逻辑
- **Acceptance Criteria Addressed**: AC-3, AC-4
- **Test Requirements**:
  - `human-judgment` TR-3.1: 数据集下拉框能正确显示可选数据集
  - `human-judgment` TR-3.2: 选择数据集后，字段下拉框能自动更新
  - `human-judgment` TR-3.3: 未选择数据集时，字段下拉框置灰不可用
- **Notes**: 暂时使用模拟数据，后续对接真实API

## [x] Task 4: 实现筛选器类型选择功能
- **Priority**: P0
- **Depends On**: Task 3
- **Description**:
  - 实现单选按钮组，支持多选、单选、日期区间三种类型
  - 实现筛选器类型切换逻辑
  - 根据选择的类型动态更新默认值配置组件
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `human-judgment` TR-4.1: 单选按钮组能正确显示三种筛选器类型
  - `human-judgment` TR-4.2: 切换类型时，默认值配置组件能同步变更
- **Notes**: 默认选中「多选」类型

## [x] Task 5: 实现筛选默认值配置功能
- **Priority**: P0
- **Depends On**: Task 4
- **Description**:
  - 实现多选/单选类型的下拉选择框
  - 实现日期区间类型的日期范围选择器
  - 处理不同类型的默认值存储逻辑
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `human-judgment` TR-5.1: 多选/单选类型能正确显示下拉选择框
  - `human-judgment` TR-5.2: 日期区间类型能正确显示日期范围选择器
  - `human-judgment` TR-5.3: 默认值配置能正确保存
- **Notes**: 下拉选择框加载所选字段的枚举值

## [x] Task 6: 实现生效图表选择功能
- **Priority**: P0
- **Depends On**: Task 5
- **Description**:
  - 实现「生效图表」下拉选择框
  - 支持选择多个图表
  - 处理图表选择的保存逻辑
- **Acceptance Criteria Addressed**: AC-6
- **Test Requirements**:
  - `human-judgment` TR-6.1: 生效图表下拉框能正确显示可选图表
  - `human-judgment` TR-6.2: 能选择多个图表作为生效范围
- **Notes**: 默认选中全部图表

## [x] Task 7: 实现保存和取消操作
- **Priority**: P0
- **Depends On**: Task 6
- **Description**:
  - 实现「确定」按钮，包含配置合法性校验
  - 实现「取消」按钮，包含确认弹窗
  - 处理保存和取消的逻辑
- **Acceptance Criteria Addressed**: AC-7, AC-8
- **Test Requirements**:
  - `human-judgment` TR-7.1: 点击确定按钮能校验配置并保存
  - `human-judgment` TR-7.2: 点击取消按钮能弹出确认弹窗
  - `human-judgment` TR-7.3: 确认取消后能放弃修改并关闭弹窗
- **Notes**: 校验规则：所有已添加字段必须完成数据集、字段和生效图表配置

## [x] Task 8: 集成筛选器按钮点击事件
- **Priority**: P0
- **Depends On**: Task 7
- **Description**:
  - 修改 DashboardEditPage 中的筛选器按钮点击事件
  - 集成 FilterConfigModal 组件
  - 实现弹窗的打开/关闭控制
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `human-judgment` TR-8.1: 点击筛选器按钮能正确打开配置弹窗
  - `human-judgment` TR-8.2: 弹窗关闭后能正确返回编辑页面
- **Notes**: 移除原有的提示信息，替换为实际的弹窗功能

## [x] Task 9: 测试和优化
- **Priority**: P1
- **Depends On**: Task 8
- **Description**:
  - 测试所有功能的正常运行
  - 优化用户体验和交互细节
  - 确保响应式设计在不同屏幕尺寸下正常显示
- **Acceptance Criteria Addressed**: 所有AC
- **Test Requirements**:
  - `human-judgment` TR-9.1: 所有功能能正常运行
  - `human-judgment` TR-9.2: 交互流畅，操作反馈及时
  - `human-judgment` TR-9.3: 在不同屏幕尺寸下显示正常
- **Notes**: 重点测试各种边界情况和用户交互场景