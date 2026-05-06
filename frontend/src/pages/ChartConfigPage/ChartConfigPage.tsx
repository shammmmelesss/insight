import React, { useState, useEffect, useCallback } from 'react';
import { Button, Input, Select, message, Modal, Tag, Tooltip, Space } from 'antd';
import {
  ArrowLeftOutlined,
  SettingOutlined,
  DeleteOutlined,
  TableOutlined,
  BarChartOutlined,
  LineChartOutlined,
  PieChartOutlined,
  DashboardOutlined,
  SearchOutlined,
  DragOutlined,
  SaveOutlined,
  CodeOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import ChartRenderer from '../../components/ChartRenderer';

type ChartType = 'crossTable' | 'bar' | 'line' | 'pie' | 'indicator';

const { Option } = Select;

interface FieldConfig {
  originalName: string;
  displayName: string;
  type: string;
  isCalculated?: boolean;
  expression?: string;
  config?: {
    aggregation?: string;
    dataFormat?: string;
    sort?: string;
  };
}

// --- 子组件：字段 Tag ---
interface FieldTagProps {
  field: FieldConfig;
  area: string;
  onSettings: (field: FieldConfig, area: string) => void;
  onRemove: (area: string, originalName: string) => void;
  showAggregation?: boolean;
}

const FieldTag: React.FC<FieldTagProps> = ({ field, area, onSettings, onRemove, showAggregation }) => {
  const aggLabel = field.config?.aggregation;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 8px',
        backgroundColor: '#f0f5ff',
        border: '1px solid #adc6ff',
        borderRadius: 4,
        fontSize: 12,
        color: '#2f54eb',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {field.displayName}
        {showAggregation && aggLabel && (
          <span style={{ color: '#8c8c8c', marginLeft: 4, fontWeight: 400 }}>· {aggLabel}</span>
        )}
      </span>
      <Tooltip title="字段设置">
        <Button
          size="small"
          type="text"
          icon={<SettingOutlined />}
          style={{ color: '#595959', padding: 0, minWidth: 'auto', height: 'auto', flexShrink: 0 }}
          onClick={() => onSettings(field, area)}
        />
      </Tooltip>
      <Tooltip title="移除">
        <Button
          size="small"
          type="text"
          icon={<DeleteOutlined />}
          style={{ color: '#ff4d4f', padding: 0, minWidth: 'auto', height: 'auto', flexShrink: 0 }}
          onClick={() => onRemove(area, field.originalName)}
        />
      </Tooltip>
    </div>
  );
};

// --- 子组件：拖放区域 ---
interface DropZoneProps {
  areaKey: string;
  label: string;
  fields: FieldConfig[];
  isOver: boolean;
  showAggregation?: boolean;
  onDragEnter: (e: React.DragEvent, area: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, area: string) => void;
  onSettings: (field: FieldConfig, area: string) => void;
  onRemove: (area: string, originalName: string) => void;
}

const DropZone: React.FC<DropZoneProps> = ({
  areaKey, label, fields, isOver, showAggregation,
  onDragEnter, onDragOver, onDragLeave, onDrop, onSettings, onRemove,
}) => (
  <div
    style={{
      marginBottom: 10,
      border: '1px solid #f0f0f0',
      borderRadius: 6,
      overflow: 'hidden',
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '6px 10px',
        backgroundColor: '#fafafa',
        borderBottom: '1px solid #f0f0f0',
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 500, color: '#595959', flex: 1 }}>{label}</span>
    </div>
    <div
      style={{
        minHeight: 44,
        padding: '8px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        border: isOver ? '2px dashed #4096ff' : '2px solid transparent',
        backgroundColor: isOver ? '#e6f4ff' : 'transparent',
        borderRadius: 4,
        transition: 'all 0.15s',
      }}
      onDragEnter={(e) => onDragEnter(e, areaKey)}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, areaKey)}
    >
      {fields.length > 0 ? (
        fields.map((field) => (
          <FieldTag
            key={field.originalName}
            field={field}
            area={areaKey}
            onSettings={onSettings}
            onRemove={onRemove}
            showAggregation={showAggregation}
          />
        ))
      ) : (
        <div
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            color: '#bfbfbf',
            fontSize: 12,
            userSelect: 'none',
          }}
        >
          <DragOutlined style={{ fontSize: 12 }} />
          <span>拖入字段</span>
        </div>
      )}
    </div>
  </div>
);

// --- 主组件 ---
const ChartConfigPage: React.FC = () => {
  const [chartName, setChartName] = useState('');
  const [searchParams] = useSearchParams();
  const chartId = searchParams.get('chartId');
  const [selectedDataset, setSelectedDataset] = useState(searchParams.get('datasetId') || '');
  const [chartType, setChartType] = useState<ChartType>('crossTable');
  const [datasets, setDatasets] = useState<{ id: string; name: string }[]>([]);
  const [datasetFields, setDatasetFields] = useState<FieldConfig[]>([]);
  const [fieldSearch, setFieldSearch] = useState('');
  const [chartData, setChartData] = useState<any[]>([]);
  const [datasetSQL, setDatasetSQL] = useState('');
  const [dataSourceId, setDataSourceId] = useState('');

  const [droppableArea, setDroppableArea] = useState<string | null>(null);
  const [draggedField, setDraggedField] = useState<FieldConfig | null>(null);

  const [isFieldSettingsModalVisible, setIsFieldSettingsModalVisible] = useState(false);
  const [currentField, setCurrentField] = useState<FieldConfig & { area?: string } | null>(null);
  const [tempFieldConfig, setTempFieldConfig] = useState<{
    aggregation?: string;
    dataFormat?: string;
    sort?: string;
  }>({ aggregation: '计数', dataFormat: '原始值', sort: '升序' });

  const [isSQLModalVisible, setIsSQLModalVisible] = useState(false);
  const [sqlContent, setSqlContent] = useState('');

  const [rowFields, setRowFields] = useState<FieldConfig[]>([]);
  const [colFields, setColFields] = useState<FieldConfig[]>([]);
  const [measureFields, setMeasureFields] = useState<FieldConfig[]>([]);
  const [xAxisFields, setXAxisFields] = useState<FieldConfig[]>([]);
  const [yAxisFields, setYAxisFields] = useState<FieldConfig[]>([]);
  const [groupFields, setGroupFields] = useState<FieldConfig[]>([]);
  const [indicatorFields, setIndicatorFields] = useState<FieldConfig[]>([]);
  const [filterFields, setFilterFields] = useState<FieldConfig[]>([]);

  const navigate = useNavigate();

  const fieldSetters: Record<string, React.Dispatch<React.SetStateAction<FieldConfig[]>>> = {
    row: setRowFields,
    col: setColFields,
    measure: setMeasureFields,
    xAxis: setXAxisFields,
    yAxis: setYAxisFields,
    group: setGroupFields,
    indicator: setIndicatorFields,
    filter: setFilterFields,
  };

  const mapAggregationToSQL = (aggregation: string): string => {
    const map: Record<string, string> = {
      '求和': 'SUM',
      '平均值': 'AVG',
      '最大值': 'MAX',
      '最小值': 'MIN',
      '计数': 'COUNT',
      '去重计数': 'COUNT(DISTINCT',
    };
    return map[aggregation] ?? 'COUNT';
  };

  const buildAggField = (field: FieldConfig) => {
    const aggregation = field.config?.aggregation || '计数';
    if (field.isCalculated && field.expression) {
      return `${field.expression} AS ${field.originalName}_${aggregation}`;
    }
    const fn = mapAggregationToSQL(aggregation);
    return `${fn}(${field.originalName}) AS ${field.originalName}_${aggregation}`;
  };

  const generateSQL = useCallback(() => {
    if (!datasetSQL) return `SELECT * FROM ${selectedDataset || 'your_table'}`;

    const wrap = (fields: string[], aggFields: string[], groupBy: string[], orderBy: string[]) => {
      const all = [...fields, ...aggFields];
      if (all.length === 0) return datasetSQL;
      let sql = `SELECT ${all.join(', ')} FROM (${datasetSQL}) AS dataset WHERE 1=1`;
      if (groupBy.length > 0) sql += ` GROUP BY ${groupBy.join(', ')}`;
      if (orderBy.length > 0) sql += ` ORDER BY ${orderBy.join(', ')}`;
      return sql;
    };

    if (chartType === 'crossTable') {
      const rows = rowFields.map(f => f.originalName);
      const cols = colFields.map(f => f.originalName);
      return wrap(
        [...rows, ...cols],
        measureFields.map(buildAggField),
        [...rows, ...cols],
        rows,
      );
    }
    if (chartType === 'bar' || chartType === 'line') {
      const xs = xAxisFields.map(f => f.originalName);
      const gs = groupFields.map(f => f.originalName);
      return wrap([...xs, ...gs], yAxisFields.map(buildAggField), [...xs, ...gs], xs);
    }
    if (chartType === 'pie') {
      const gs = groupFields.map(f => f.originalName);
      return wrap(gs, measureFields.map(buildAggField), gs, []);
    }
    if (chartType === 'indicator') {
      const agg = indicatorFields.map(buildAggField);
      if (agg.length === 0) return datasetSQL;
      return `SELECT ${agg.join(', ')} FROM (${datasetSQL}) AS dataset WHERE 1=1`;
    }
    return datasetSQL;
  }, [datasetSQL, selectedDataset, chartType, rowFields, colFields, measureFields, xAxisFields, yAxisFields, groupFields, indicatorFields]);

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
      setGroupFields(config.groupFields || []);
      setIndicatorFields(config.indicatorFields || []);
      setFilterFields(config.filterFields || []);
      message.success('图表信息加载成功');
    }).catch(() => message.error('获取图表详情失败'));
  }, [chartId]);

  const handleSaveChart = async () => {
    if (!chartName) { message.error('请输入图表名称'); return; }
    if (!selectedDataset) { message.error('请选择数据集'); return; }
    const config = JSON.stringify({ rowFields, colFields, measureFields, xAxisFields, yAxisFields, groupFields, indicatorFields, filterFields });
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
    axios.get('/api/datasets/select-list')
      .then(res => setDatasets(res.data.items))
      .catch(() => message.error('获取数据集列表失败'));
  }, []);

  useEffect(() => {
    if (!selectedDataset) {
      setDatasetFields([]); setDatasetSQL(''); setDataSourceId('');
      return;
    }
    axios.get(`/api/datasets/${selectedDataset}`).then(res => {
      setDatasetFields(res.data.fieldsConfig || []);
      setDatasetSQL(res.data.sql || '');
      setDataSourceId(res.data.dataSourceId || '');
    }).catch(() => {
      message.error('获取数据集字段失败');
      setDatasetFields([]); setDatasetSQL(''); setDataSourceId('');
    });
  }, [selectedDataset]);

  useEffect(() => {
    if (!selectedDataset || !datasetSQL || !dataSourceId) { setChartData([]); return; }
    axios.post('/api/datasets/preview', { sql: generateSQL(), dataSourceId })
      .then(res => setChartData(res.data.data || []))
      .catch(() => { message.error('获取图表数据失败'); setChartData([]); });
  }, [selectedDataset, datasetSQL, dataSourceId, generateSQL]);

  const handleDragStart = (e: React.DragEvent, field: FieldConfig) => {
    setDraggedField(field);
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', JSON.stringify(field));
  };

  const handleDragEnd = () => { setDraggedField(null); setDroppableArea(null); };
  const handleDragEnter = (e: React.DragEvent, area: string) => { e.preventDefault(); setDroppableArea(area); };
  const handleDragLeave = () => setDroppableArea(null);
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; };

  const handleDrop = (e: React.DragEvent, area: string) => {
    e.preventDefault();
    setDroppableArea(null);
    if (!draggedField) return;
    const fieldConfig: FieldConfig = {
      ...draggedField,
      config: { aggregation: '计数', dataFormat: '原始值', sort: '升序' },
    };
    fieldSetters[area]?.(prev => [...prev, fieldConfig]);
  };

  const handleRemoveField = (area: string, originalName: string) => {
    fieldSetters[area]?.(prev => prev.filter(f => f.originalName !== originalName));
  };

  const openFieldSettingsModal = (field: FieldConfig, area?: string) => {
    const config = field.config || { aggregation: '计数', dataFormat: '原始值', sort: '升序' };
    setCurrentField({ ...field, area });
    setTempFieldConfig(config);
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
    onRemove: handleRemoveField,
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
          bordered
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
                      {dimensionFields.map((field, i) => (
                        <div
                          key={i}
                          draggable
                          onDragStart={(e) => handleDragStart(e, field)}
                          onDragEnd={handleDragEnd}
                          style={{
                            padding: '5px 8px',
                            backgroundColor: '#f0f5ff',
                            border: '1px solid #d6e4ff',
                            borderRadius: 4,
                            cursor: 'grab',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
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
                              {field.displayName}
                            </div>
                            <div style={{ fontSize: 10, color: '#8c8c8c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {field.originalName}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {metricFields.length > 0 && (
                  <>
                    <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 6, fontWeight: 500 }}>
                      指标 ({metricFields.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {metricFields.map((field, i) => (
                        <div
                          key={i}
                          draggable
                          onDragStart={(e) => handleDragStart(e, field)}
                          onDragEnd={handleDragEnd}
                          style={{
                            padding: '5px 8px',
                            backgroundColor: '#fff7e6',
                            border: '1px solid #ffd591',
                            borderRadius: 4,
                            cursor: 'grab',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
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
                              {field.displayName}
                            </div>
                            <div style={{ fontSize: 10, color: '#8c8c8c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {field.originalName}
                            </div>
                          </div>
                        </div>
                      ))}
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
              <DropZone {...dropZoneProps} areaKey="indicator" label="指标" fields={indicatorFields} isOver={droppableArea === 'indicator'} showAggregation />
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
          <div style={{ flex: 1, padding: 12, overflow: 'hidden', minHeight: 0 }}>
            <ChartRenderer
              chartType={chartType}
              chartData={chartData}
              rowFields={rowFields.map(f => f.originalName)}
              colFields={colFields.map(f => f.originalName)}
              measureFields={measureFields.map(f => `${f.originalName}_${f.config?.aggregation || '计数'}`)}
              xAxisFields={xAxisFields.map(f => f.originalName)}
              yAxisFields={yAxisFields.map(f => `${f.originalName}_${f.config?.aggregation || '计数'}`)}
              groupFields={groupFields.map(f => f.originalName)}
              indicatorFields={indicatorFields.map(f => `${f.originalName}_${f.config?.aggregation || '计数'}`)}
            />
          </div>
        </div>
      </div>

      {/* 字段设置弹窗 */}
      <Modal
        title="字段设置"
        open={isFieldSettingsModalVisible}
        onCancel={() => { setIsFieldSettingsModalVisible(false); setCurrentField(null); }}
        footer={null}
        width={480}
      >
        {currentField && (
          <div style={{ paddingTop: 8 }}>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>字段名称</div>
              <Input value={currentField.displayName} disabled />
            </div>

            {(currentField.type !== 'dimension' ||
              currentField.area === 'measure' ||
              currentField.area === 'yAxis' ||
              currentField.area === 'indicator') && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>聚合方式</div>
                <Select
                  value={tempFieldConfig.aggregation}
                  style={{ width: '100%' }}
                  onChange={(v) => setTempFieldConfig(p => ({ ...p, aggregation: v }))}
                >
                  <Option value="求和">求和</Option>
                  <Option value="平均值">平均值</Option>
                  <Option value="最大值">最大值</Option>
                  <Option value="最小值">最小值</Option>
                  <Option value="计数">计数</Option>
                  <Option value="去重计数">去重计数</Option>
                </Select>
              </div>
            )}

            {((chartType === 'crossTable' && currentField.area === 'measure') ||
              ((chartType === 'bar' || chartType === 'line') && currentField.area === 'yAxis') ||
              (chartType === 'pie' && currentField.area === 'measure') ||
              (chartType === 'indicator' && currentField.area === 'indicator')) && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>数据格式</div>
                <Select
                  value={tempFieldConfig.dataFormat}
                  style={{ width: '100%' }}
                  onChange={(v) => setTempFieldConfig(p => ({ ...p, dataFormat: v }))}
                >
                  <Option value="原始值">原始值</Option>
                  <Option value="百分比">百分比</Option>
                  <Option value="千分比">千分比</Option>
                  <Option value="小数">小数</Option>
                  <Option value="整数">整数</Option>
                </Select>
              </div>
            )}

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>排序</div>
              <Select
                value={tempFieldConfig.sort}
                style={{ width: '100%' }}
                onChange={(v) => setTempFieldConfig(p => ({ ...p, sort: v }))}
              >
                <Option value="升序">升序</Option>
                <Option value="降序">降序</Option>
              </Select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
              <Button onClick={() => { setIsFieldSettingsModalVisible(false); setCurrentField(null); }}>取消</Button>
              <Button type="primary" onClick={saveFieldSettings}>确定</Button>
            </div>
          </div>
        )}
      </Modal>

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
