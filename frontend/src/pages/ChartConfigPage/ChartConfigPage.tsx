import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { App, Button, Input, Select, Modal, Tag, Tooltip, Space, Popover } from 'antd';
import { CalendarOutlined as CalendarIcon } from '@ant-design/icons';
import DateRangeFilterPicker, { DateRangeFilterValue, DEFAULT_DATE_RANGE_VALUE, resolvedRangeLabel } from '../../components/DateRangeFilterPicker/DateRangeFilterPicker';
import {
  ArrowLeftOutlined,
  TableOutlined,
  BarChartOutlined,
  LineChartOutlined,
  PieChartOutlined,
  DashboardOutlined,
  FundOutlined,
  SearchOutlined,
  SaveOutlined,
  CodeOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import ChartRenderer from '../../components/ChartRenderer';
import type { ChartType } from '@shared/api.interface';
import type { FieldConfig } from './types';
import { generateSQL as buildSQL } from './sql';
import DropZone from './DropZone';
import { useFieldAreas } from './useFieldAreas';
import { useDatasetSource } from './useDatasetSource';
import FieldSettingsModal from './FieldSettingsModal';
import AreaSettingsModal from './AreaSettingsModal';

const { Option } = Select;

// --- 主组件 ---
const ChartConfigPage: React.FC = () => {
  const { message } = App.useApp();
  const [chartName, setChartName] = useState('');
  const [searchParams] = useSearchParams();
  const chartId = searchParams.get('chartId');
  const [selectedDataset, setSelectedDataset] = useState(searchParams.get('datasetId') || '');
  const [chartType, setChartType] = useState<ChartType>('crossTable');
  const [fieldSearch, setFieldSearch] = useState('');
  const [chartData, setChartData] = useState<any[]>([]);

  const [droppableArea, setDroppableArea] = useState<string | null>(null);
  const [draggedField, setDraggedField] = useState<FieldConfig | null>(null);
  const [draggedFields, setDraggedFields] = useState<FieldConfig[]>([]);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());

  const [isFieldSettingsModalVisible, setIsFieldSettingsModalVisible] = useState(false);
  const [currentField, setCurrentField] = useState<FieldConfig & { area?: string } | null>(null);
  const [tempFieldConfig, setTempFieldConfig] = useState<{
    aggregation?: string;
    dataFormat?: string;
    sort?: string;
    filterType?: 'multiple' | 'single' | 'dateRange';
    filterDefault?: any;
  }>({ aggregation: '计数', dataFormat: '原始值', sort: '升序' });

  const [isAreaSettingsModalVisible, setIsAreaSettingsModalVisible] = useState(false);
  const [currentAreaKey, setCurrentAreaKey] = useState<string>('');
  const [tempAreaFieldEdits, setTempAreaFieldEdits] = useState<Record<string, { displayName?: string; description?: string; config?: FieldConfig['config'] }>>({});
  const [selectedAreaRows, setSelectedAreaRows] = useState<Set<string>>(new Set());

  const [datePickerOpen, setDatePickerOpen] = useState<Record<string, boolean>>({});
  const [isSQLModalVisible, setIsSQLModalVisible] = useState(false);
  const [sqlContent, setSqlContent] = useState('');

  const {
    rowFields, setRowFields,
    colFields, setColFields,
    measureFields, setMeasureFields,
    xAxisFields, setXAxisFields,
    yAxisFields, setYAxisFields,
    y2AxisFields, setY2AxisFields,
    groupFields, setGroupFields,
    indicatorFields, setIndicatorFields,
    filterFields, setFilterFields,
    fieldSetters,
    getAreaFields,
    handleReorder,
    handleRemoveField,
  } = useFieldAreas();
  const [filterValues, setFilterValues] = useState<Record<string, any>>({});

  const {
    datasets,
    datasetFields,
    datasetSQL,
    dataSourceId,
    dataSourceType,
    datasetType,
    loadedDatasetId,
    filterFieldOptions,
    fetchFilterFieldOptions,
    pendingFilterValues,
  } = useDatasetSource({ selectedDataset, setFilterValues, onError: message.error });

  const navigate = useNavigate();

  const generateSQL = useCallback(() => buildSQL({
    datasetSQL, selectedDataset, chartType,
    rowFields, colFields, measureFields, xAxisFields, yAxisFields, y2AxisFields,
    groupFields, indicatorFields, filterFields, filterValues, dataSourceType,
  }), [datasetSQL, selectedDataset, chartType, rowFields, colFields, measureFields, xAxisFields, yAxisFields, y2AxisFields, groupFields, indicatorFields, filterFields, filterValues, dataSourceType]);

  // 稳定 ChartRenderer 的 props 引用：避免输入图表名称/搜索字段时因整页重渲染
  // 生成新数组/对象引用，触发图表销毁重建导致的输入抖动
  const chartRendererProps = useMemo(() => {
    const fieldFormats: Record<string, string> = {};
    const fieldLabelMap: Record<string, string> = {};
    [...rowFields, ...colFields, ...xAxisFields, ...groupFields].forEach(f => {
      fieldLabelMap[f.originalName] = f.displayName || f.originalName;
    });
    [...measureFields, ...yAxisFields, ...y2AxisFields, ...indicatorFields].forEach(f => {
      const chineseAgg = f.config?.aggregation || '计数';
      const key = `${f.originalName}_${chineseAgg}`;
      fieldLabelMap[key] = f.displayName || f.originalName;
      if (f.config?.dataFormat && f.config.dataFormat !== '原始值') {
        fieldFormats[f.originalName] = f.config.dataFormat;
      }
    });
    return {
      chartType,
      chartData,
      rowFields: rowFields.map(f => f.originalName),
      colFields: colFields.map(f => f.originalName),
      measureFields: measureFields.map(f => f.originalName),
      xAxisFields: xAxisFields.map(f => f.originalName),
      yAxisFields: yAxisFields.map(f => f.originalName),
      y2AxisFields: y2AxisFields.map(f => f.originalName),
      groupFields: groupFields.map(f => f.originalName),
      indicatorFields: indicatorFields.map(f => f.originalName),
      fieldFormats,
      fieldLabelMap,
    };
  }, [chartType, chartData, rowFields, colFields, measureFields, xAxisFields, yAxisFields, y2AxisFields, groupFields, indicatorFields]);

  useEffect(() => {
    if (!chartId) return;
    axios.get(`/api/charts/${chartId}`).then(res => {
      const chart = res.data;
      setChartName(chart.name);
      setSelectedDataset(chart.datasetId);
      setChartType(chart.type);
      const config = JSON.parse(chart.config);
      setRowFields(config.rowFields || []);
      setColFields(config.colFields || []);
      setMeasureFields(config.measureFields || []);
      setXAxisFields(config.xAxisFields || []);
      setYAxisFields(config.yAxisFields || []);
      setY2AxisFields(config.y2AxisFields || []);
      setGroupFields(config.groupFields || []);
      setIndicatorFields(config.indicatorFields || []);
      setFilterFields(config.filterFields || []);
      if (config.filterValues) pendingFilterValues.current = config.filterValues;
      message.success('图表信息加载成功');
    }).catch(() => message.error('获取图表详情失败'));
  }, [chartId]);

  const handleSaveChart = async () => {
    if (!chartName) { message.error('请输入图表名称'); return; }
    if (!selectedDataset) { message.error('请选择数据集'); return; }
    const config = JSON.stringify({ rowFields, colFields, measureFields, xAxisFields, yAxisFields, y2AxisFields, groupFields, indicatorFields, filterFields, filterValues });
    try {
      if (chartId) {
        await axios.put(`/api/charts/${chartId}`, { name: chartName, datasetId: selectedDataset, type: chartType, config });
        message.success('图表更新成功');
      } else {
        await axios.post('/api/charts', { name: chartName, datasetId: selectedDataset, type: chartType, config });
        message.success('图表保存成功');
      }
      navigate('/charts');
    } catch {
      message.error('保存图表失败，请重试');
    }
  };

  useEffect(() => {
    filterFields.forEach(f => fetchFilterFieldOptions(f.originalName));
    setFilterValues(prev => {
      const names = new Set(filterFields.map(f => f.originalName));
      // remove values for deleted fields
      const next = Object.fromEntries(Object.entries(prev).filter(([k]) => names.has(k)));
      // init default values for new fields that have no value yet
      filterFields.forEach(f => {
        if (!(f.originalName in next) && f.config?.filterDefault != null) {
          const dv = f.config.filterDefault;
          if (f.config.filterType === 'dateRange') {
            next[f.originalName] = (dv && typeof dv === 'object' && 'startType' in dv)
              ? dv
              : DEFAULT_DATE_RANGE_VALUE;
          } else if (Array.isArray(dv) ? dv.length > 0 : dv !== '') {
            next[f.originalName] = dv;
          }
        }
      });
      return next;
    });
  }, [filterFields, fetchFilterFieldOptions]);

  useEffect(() => {
    if (!selectedDataset || !datasetSQL || loadedDatasetId !== selectedDataset) { setChartData([]); return; }
    if (datasetType === 'extract') {
      axios.post('/api/datasets/preview', { sql: generateSQL(), datasetId: selectedDataset })
        .then(res => setChartData(res.data.data || []))
        .catch(() => { message.error('获取图表数据失败'); setChartData([]); });
    } else {
      if (!dataSourceId) { setChartData([]); return; }
      axios.post('/api/datasets/preview', { sql: generateSQL(), dataSourceId })
        .then(res => setChartData(res.data.data || []))
        .catch(() => { message.error('获取图表数据失败'); setChartData([]); });
    }
  }, [selectedDataset, loadedDatasetId, datasetSQL, dataSourceId, datasetType, generateSQL]);

  const handleFieldClick = (field: FieldConfig) => {
    setSelectedFields(prev => {
      const next = new Set(prev);
      if (next.has(field.originalName)) {
        next.delete(field.originalName);
      } else {
        next.add(field.originalName);
      }
      return next;
    });
  };

  const handleDragStart = (e: React.DragEvent, field: FieldConfig) => {
    const toSend = selectedFields.has(field.originalName) && selectedFields.size > 1
      ? datasetFields.filter(f => selectedFields.has(f.originalName))
      : [field];
    setDraggedField(field);
    setDraggedFields(toSend);
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', JSON.stringify(toSend));
  };

  const handleDragEnd = () => { setDraggedField(null); setDraggedFields([]); setDroppableArea(null); };
  const handleDragEnter = (e: React.DragEvent, area: string) => { e.preventDefault(); setDroppableArea(area); };
  const handleDragLeave = () => setDroppableArea(null);
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; };

  const handleDrop = (e: React.DragEvent, area: string) => {
    e.preventDefault();
    setDroppableArea(null);
    const fields = draggedFields.length > 0 ? draggedFields : (draggedField ? [draggedField] : []);
    if (fields.length === 0) return;
    fieldSetters[area]?.(prev => {
      const existing = new Set(prev.map(f => f.originalName));
      const toAdd = fields.filter(f => !existing.has(f.originalName)).map(f => ({
        ...f,
        config: area === 'filter'
          ? { filterType: 'multiple' as const, filterDefault: [] }
          : { aggregation: '计数', dataFormat: '原始值', sort: '升序' },
      }));
      return [...prev, ...toAdd];
    });
  };

  const openAreaSettingsModal = (area: string) => {
    const areaFields = getAreaFields(area);
    const edits: Record<string, { displayName?: string; description?: string; config?: FieldConfig['config'] }> = {};
    areaFields.forEach(f => {
      edits[f.originalName] = { displayName: f.displayName, description: f.description, config: { ...f.config } };
    });
    setCurrentAreaKey(area);
    setTempAreaFieldEdits(edits);
    setSelectedAreaRows(new Set(areaFields.map(f => f.originalName)));
    setIsAreaSettingsModalVisible(true);
  };

  const saveAreaSettings = () => {
    const setter = fieldSetters[currentAreaKey];
    if (setter) {
      setter(prev => prev.map(f => {
        const edit = tempAreaFieldEdits[f.originalName];
        if (!edit) return f;
        return { ...f, displayName: edit.displayName ?? f.displayName, description: edit.description, config: edit.config ?? f.config };
      }));
    }
    // 日期筛选：将 filterDefault 同步到 filterValues
    if (currentAreaKey === 'filter') {
      setFilterValues(prev => {
        const next = { ...prev };
        Object.entries(tempAreaFieldEdits).forEach(([name, edit]) => {
          if (edit.config?.filterType === 'dateRange') {
            const dv = edit.config.filterDefault;
            next[name] = (dv && typeof dv === 'object' && 'startType' in dv) ? dv : DEFAULT_DATE_RANGE_VALUE;
          }
        });
        return next;
      });
    }
    setIsAreaSettingsModalVisible(false);
  };

  const updateAreaFieldConfig = (name: string, configPatch: Partial<NonNullable<FieldConfig['config']>>) => {
    setTempAreaFieldEdits(prev => ({
      ...prev,
      [name]: { ...prev[name], config: { ...prev[name]?.config, ...configPatch } },
    }));
  };

  const openFieldSettingsModal = (field: FieldConfig, area?: string) => {
    const defaultConfig = area === 'filter'
      ? { filterType: 'multiple' as const, filterDefault: [] }
      : { aggregation: '计数', dataFormat: '原始值', sort: '升序' };
    setCurrentField({ ...field, area });
    setTempFieldConfig(field.config || defaultConfig);
    setIsFieldSettingsModalVisible(true);
  };

  const saveFieldSettings = () => {
    if (!currentField) return;
    const area = currentField.area;
    if (area && fieldSetters[area]) {
      fieldSetters[area](prev =>
        prev.map(f => f.originalName === currentField.originalName ? { ...f, config: tempFieldConfig } : f)
      );
    }
    // 将 filterDefault 同步到 filterValues，确保预览立即生效
    // （useEffect 只在 filterValues 中无该 key 时初始化，无法覆盖已有值）
    if (area === 'filter') {
      const dv = tempFieldConfig.filterDefault;
      let newVal: any;
      if (tempFieldConfig.filterType === 'dateRange') {
        newVal = (dv && typeof dv === 'object' && 'startType' in dv) ? dv : DEFAULT_DATE_RANGE_VALUE;
      } else if (tempFieldConfig.filterType === 'single') {
        newVal = Array.isArray(dv) ? dv[0] : dv;
      } else {
        newVal = dv == null ? [] : (Array.isArray(dv) ? dv : [dv]);
      }
      setFilterValues(prev => ({ ...prev, [currentField.originalName]: newVal }));
    }
    setIsFieldSettingsModalVisible(false);
    setCurrentField(null);
  };

  const openSQLModal = () => {
    setSqlContent(generateSQL());
    setIsSQLModalVisible(true);
  };

  const chartTypeOptions = [
    { label: '交叉表', value: 'crossTable', icon: <TableOutlined /> },
    { label: '柱状图', value: 'bar', icon: <BarChartOutlined /> },
    { label: '折线图', value: 'line', icon: <LineChartOutlined /> },
    { label: '饼图', value: 'pie', icon: <PieChartOutlined /> },
    { label: '指标卡', value: 'indicator', icon: <DashboardOutlined /> },
    { label: '双Y轴图', value: 'dualAxis', icon: <FundOutlined /> },
  ];

  const filteredFields = datasetFields.filter(f =>
    !fieldSearch ||
    f.displayName.toLowerCase().includes(fieldSearch.toLowerCase()) ||
    f.originalName.toLowerCase().includes(fieldSearch.toLowerCase())
  );

  const dimensionFields = filteredFields.filter(f => f.type === 'dimension');
  const metricFields = filteredFields.filter(f => f.type !== 'dimension');

  const dropZoneProps = {
    isOver: false,
    onDragEnter: handleDragEnter,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
    onSettings: openFieldSettingsModal,
    onAreaSettings: openAreaSettingsModal,
    onRemove: handleRemoveField,
    onReorder: handleReorder,
  };

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#f5f6f7' }}>
      {/* 顶部导航 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          height: 52,
          backgroundColor: '#fff',
          borderBottom: '1px solid #e8e8e8',
          gap: 12,
          flexShrink: 0,
        }}
      >
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/charts')}
          style={{ color: '#595959' }}
        >
          返回
        </Button>
        <div style={{ width: 1, height: 20, backgroundColor: '#e8e8e8' }} />
        <span style={{ fontSize: 14, color: '#8c8c8c', whiteSpace: 'nowrap' }}>图表配置</span>
        <Input
          placeholder="请输入图表名称"
          value={chartName}
          onChange={(e) => setChartName(e.target.value)}
          style={{ width: 260, marginLeft: 4 }}
          variant="outlined"
        />
        <div style={{ flex: 1 }} />
        <Button icon={<CodeOutlined />} onClick={openSQLModal}>SQL</Button>
        <Button type="primary" icon={<SaveOutlined />} onClick={handleSaveChart}>保存</Button>
      </div>

      {/* 三栏布局 */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* 左栏：数据集字段 */}
        <div
          style={{
            width: 220,
            backgroundColor: '#fff',
            borderRight: '1px solid #e8e8e8',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
          }}
        >
          <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 8 }}>数据集</div>
            <Select
              placeholder="选择数据集"
              style={{ width: '100%' }}
              value={selectedDataset || undefined}
              onChange={setSelectedDataset}
              size="small"
            >
              {datasets.map(d => <Option key={d.id} value={d.id}>{d.name}</Option>)}
            </Select>
          </div>

          {datasetFields.length > 0 && (
            <div style={{ padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
              <Input
                size="small"
                placeholder="搜索字段"
                prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
                value={fieldSearch}
                onChange={(e) => setFieldSearch(e.target.value)}
                allowClear
              />
            </div>
          )}

          <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
            {datasetFields.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#bfbfbf', fontSize: 12, paddingTop: 24 }}>
                请先选择数据集
              </div>
            ) : (
              <>
                {dimensionFields.length > 0 && (
                  <>
                    <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 6, fontWeight: 500 }}>
                      维度 ({dimensionFields.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
                      {dimensionFields.map((field, i) => {
                        const isSelected = selectedFields.has(field.originalName);
                        return (
                        <div
                          key={i}
                          draggable
                          onClick={() => handleFieldClick(field)}
                          onDragStart={(e) => handleDragStart(e, field)}
                          onDragEnd={handleDragEnd}
                          style={{
                            padding: '5px 8px',
                            backgroundColor: isSelected ? '#d6e4ff' : '#f0f5ff',
                            border: isSelected ? '1px solid #1677ff' : '1px solid #d6e4ff',
                            borderRadius: 4,
                            cursor: 'grab',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            userSelect: 'none',
                          }}
                        >
                          <Tag
                            color="blue"
                            style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px', height: 16, flexShrink: 0 }}
                          >
                            维
                          </Tag>
                          <div style={{ flex: 1, overflow: 'hidden' }}>
                            <div style={{ fontSize: 12, color: '#1d39c4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {field.displayName || field.originalName}
                            </div>
                            <div style={{ fontSize: 10, color: '#8c8c8c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {field.originalName}
                            </div>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </>
                )}
                {metricFields.length > 0 && (
                  <>
                    <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 6, fontWeight: 500 }}>
                      指标 ({metricFields.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {metricFields.map((field, i) => {
                        const isSelected = selectedFields.has(field.originalName);
                        return (
                        <div
                          key={i}
                          draggable
                          onClick={() => handleFieldClick(field)}
                          onDragStart={(e) => handleDragStart(e, field)}
                          onDragEnd={handleDragEnd}
                          style={{
                            padding: '5px 8px',
                            backgroundColor: isSelected ? '#ffe7ba' : '#fff7e6',
                            border: isSelected ? '1px solid #fa8c16' : '1px solid #ffd591',
                            borderRadius: 4,
                            cursor: 'grab',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            userSelect: 'none',
                          }}
                        >
                          <Tag
                            color="orange"
                            style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px', height: 16, flexShrink: 0 }}
                          >
                            指
                          </Tag>
                          <div style={{ flex: 1, overflow: 'hidden' }}>
                            <div style={{ fontSize: 12, color: '#d46b08', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {field.displayName || field.originalName}
                            </div>
                            <div style={{ fontSize: 10, color: '#8c8c8c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {field.originalName}
                            </div>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </>
                )}
                {filteredFields.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#bfbfbf', fontSize: 12, paddingTop: 16 }}>
                    无匹配字段
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* 中栏：图表配置 */}
        <div
          style={{
            width: 260,
            backgroundColor: '#fff',
            borderRight: '1px solid #e8e8e8',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0,
          }}
        >
          <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#262626', marginBottom: 10 }}>图表类型</div>
            <Space wrap size={4}>
              {chartTypeOptions.map(opt => (
                <Tooltip key={opt.value} title={opt.label} placement="top">
                  <Button
                    size="small"
                    type={chartType === opt.value ? 'primary' : 'default'}
                    icon={opt.icon}
                    onClick={() => setChartType(opt.value as ChartType)}
                    style={{ fontSize: 12, paddingLeft: 8, paddingRight: 8 }}
                  >
                    {opt.label}
                  </Button>
                </Tooltip>
              ))}
            </Space>
          </div>

          <div style={{ flex: 1, overflow: 'auto', padding: '10px 12px' }}>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#8c8c8c', marginBottom: 8 }}>字段配置</div>

            {/* 交叉表 */}
            {chartType === 'crossTable' && (
              <>
                <DropZone {...dropZoneProps} areaKey="row" label="行" fields={rowFields} isOver={droppableArea === 'row'} />
                <DropZone {...dropZoneProps} areaKey="col" label="列" fields={colFields} isOver={droppableArea === 'col'} />
                <DropZone {...dropZoneProps} areaKey="measure" label="指标" fields={measureFields} isOver={droppableArea === 'measure'} showAggregation />
                <DropZone {...dropZoneProps} areaKey="filter" label="筛选" fields={filterFields} isOver={droppableArea === 'filter'} />
              </>
            )}

            {/* 柱状图 / 折线图 */}
            {(chartType === 'bar' || chartType === 'line') && (
              <>
                <DropZone {...dropZoneProps} areaKey="xAxis" label="X 轴（维度）" fields={xAxisFields} isOver={droppableArea === 'xAxis'} />
                <DropZone {...dropZoneProps} areaKey="yAxis" label="Y 轴（指标）" fields={yAxisFields} isOver={droppableArea === 'yAxis'} showAggregation />
                <DropZone {...dropZoneProps} areaKey="group" label="分组" fields={groupFields} isOver={droppableArea === 'group'} />
                <DropZone {...dropZoneProps} areaKey="filter" label="筛选" fields={filterFields} isOver={droppableArea === 'filter'} />
              </>
            )}

            {/* 饼图 */}
            {chartType === 'pie' && (
              <>
                <DropZone {...dropZoneProps} areaKey="group" label="分组" fields={groupFields} isOver={droppableArea === 'group'} />
                <DropZone {...dropZoneProps} areaKey="measure" label="指标" fields={measureFields} isOver={droppableArea === 'measure'} showAggregation />
                <DropZone {...dropZoneProps} areaKey="filter" label="筛选" fields={filterFields} isOver={droppableArea === 'filter'} />
              </>
            )}

            {/* 指标卡 */}
            {chartType === 'indicator' && (
              <>
                <DropZone {...dropZoneProps} areaKey="indicator" label="指标" fields={indicatorFields} isOver={droppableArea === 'indicator'} showAggregation />
                <DropZone {...dropZoneProps} areaKey="filter" label="筛选" fields={filterFields} isOver={droppableArea === 'filter'} />
              </>
            )}

            {/* 双Y轴图 */}
            {chartType === 'dualAxis' && (
              <>
                <DropZone {...dropZoneProps} areaKey="xAxis" label="X 轴（维度）" fields={xAxisFields} isOver={droppableArea === 'xAxis'} />
                <DropZone {...dropZoneProps} areaKey="yAxis" label="左Y轴（柱，指标）" fields={yAxisFields} isOver={droppableArea === 'yAxis'} showAggregation />
                <DropZone {...dropZoneProps} areaKey="y2Axis" label="右Y轴（线，指标）" fields={y2AxisFields} isOver={droppableArea === 'y2Axis'} showAggregation />
                <DropZone {...dropZoneProps} areaKey="filter" label="筛选" fields={filterFields} isOver={droppableArea === 'filter'} />
              </>
            )}
          </div>
        </div>

        {/* 右栏：报表预览 */}
        <div style={{ flex: 1, backgroundColor: '#fff', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              padding: '12px 16px',
              borderBottom: '1px solid #f0f0f0',
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>报表预览</span>
          </div>

          {/* 筛选条件 */}
          {filterFields.length > 0 && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 12,
                padding: '10px 16px',
                borderBottom: '1px solid #f0f0f0',
                backgroundColor: '#fafafa',
                flexShrink: 0,
              }}
            >
              {filterFields.map(f => {
                const filterType = f.config?.filterType || 'multiple';
                const options = filterFieldOptions[`${selectedDataset}:${f.originalName}`] || [];
                const value = filterValues[f.originalName] ?? f.config?.filterDefault;
                return (
                  <div key={f.originalName} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160, maxWidth: 240 }}>
                    <span style={{ fontSize: 12, color: '#595959' }}>{f.displayName || f.originalName}</span>
                    {filterType === 'dateRange' ? (
                      <Popover
                        trigger="click"
                        placement="bottomLeft"
                        open={!!datePickerOpen[f.originalName]}
                        onOpenChange={(v) => setDatePickerOpen(prev => ({ ...prev, [f.originalName]: v }))}
                        overlayInnerStyle={{ padding: 0 }}
                        content={
                          <DateRangeFilterPicker
                            value={(value && typeof value === 'object' && 'startType' in value) ? value as DateRangeFilterValue : DEFAULT_DATE_RANGE_VALUE}
                            onChange={(val) => { setFilterValues(prev => ({ ...prev, [f.originalName]: val })); setDatePickerOpen(prev => ({ ...prev, [f.originalName]: false })); }}
                            onCancel={() => setDatePickerOpen(prev => ({ ...prev, [f.originalName]: false }))}
                          />
                        }
                      >
                        <Button size="small" icon={<CalendarIcon />} style={{ width: '100%', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {(value && typeof value === 'object' && 'startType' in value)
                            ? resolvedRangeLabel(value as DateRangeFilterValue)
                            : '选择日期范围'}
                        </Button>
                      </Popover>
                    ) : (
                      <Select
                        size="small"
                        mode={filterType === 'single' ? undefined : 'multiple'}
                        maxTagCount="responsive"
                        style={{ width: '100%' }}
                        value={value ?? (filterType === 'single' ? undefined : [])}
                        onChange={(vals) => setFilterValues(prev => ({ ...prev, [f.originalName]: vals }))}
                        allowClear
                        placeholder="请选择"
                      >
                        {options.map((val: string) => (
                          <Select.Option key={String(val)} value={String(val)}>{String(val)}</Select.Option>
                        ))}
                      </Select>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ flex: 1, padding: 12, overflow: 'hidden', minHeight: 0 }}>
            <ChartRenderer {...chartRendererProps} />
          </div>
        </div>
      </div>

      {/* 字段设置弹窗 */}
      <FieldSettingsModal
        open={isFieldSettingsModalVisible}
        currentField={currentField}
        tempFieldConfig={tempFieldConfig}
        setTempFieldConfig={setTempFieldConfig}
        chartType={chartType}
        filterFieldOptions={filterFieldOptions}
        selectedDataset={selectedDataset}
        onCancel={() => { setIsFieldSettingsModalVisible(false); setCurrentField(null); }}
        onSave={saveFieldSettings}
      />

      {/* 区域字段批量设置弹窗 */}
      <AreaSettingsModal
        open={isAreaSettingsModalVisible}
        areaKey={currentAreaKey}
        areaFields={getAreaFields(currentAreaKey)}
        tempAreaFieldEdits={tempAreaFieldEdits}
        setTempAreaFieldEdits={setTempAreaFieldEdits}
        selectedAreaRows={selectedAreaRows}
        setSelectedAreaRows={setSelectedAreaRows}
        updateAreaFieldConfig={updateAreaFieldConfig}
        onCancel={() => setIsAreaSettingsModalVisible(false)}
        onOk={saveAreaSettings}
      />

      {/* SQL 弹窗 */}
      <Modal
        title="SQL 查询"
        open={isSQLModalVisible}
        onCancel={() => setIsSQLModalVisible(false)}
        footer={<Button onClick={() => setIsSQLModalVisible(false)}>关闭</Button>}
        width={800}
      >
        <div style={{ backgroundColor: '#f5f5f5', padding: 16, borderRadius: 4, overflow: 'auto', maxHeight: 400 }}>
          <pre style={{ margin: 0, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {sqlContent}
          </pre>
        </div>
      </Modal>
    </div>
  );
};

export default ChartConfigPage;
