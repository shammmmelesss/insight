import React, { useState, useEffect } from 'react';
import { Button, Select, Tag, Tooltip, Space, message } from 'antd';
import {
  DeleteOutlined,
  TableOutlined,
  BarChartOutlined,
  LineChartOutlined,
  PieChartOutlined,
  DashboardOutlined,
  FundOutlined,
  DragOutlined,
  SaveOutlined,
  ArrowLeftOutlined,
} from '@ant-design/icons';
import axios from 'axios';

type ChartType = 'crossTable' | 'bar' | 'line' | 'pie' | 'indicator' | 'dualAxis';

interface FieldConfig {
  originalName: string;
  displayName: string;
  description?: string;
  type: string;
  isCalculated?: boolean;
  expression?: string;
  config?: {
    aggregation?: string;
    dataFormat?: string;
    sort?: string;
    filterType?: 'multiple' | 'single' | 'dateRange';
    filterDefault?: any;
  };
}

interface FieldTagProps {
  field: FieldConfig;
  area: string;
  index: number;
  onRemove: (area: string, originalName: string) => void;
  showAggregation?: boolean;
  onReorderDragStart: (e: React.DragEvent, area: string, index: number) => void;
  insertBefore?: boolean;
  insertAfter?: boolean;
}

const FieldTag: React.FC<FieldTagProps> = ({
  field, area, index, onRemove, showAggregation,
  onReorderDragStart, insertBefore, insertAfter,
}) => {
  const aggLabel = field.config?.aggregation;
  return (
    <div style={{ position: 'relative' }}>
      {insertBefore && <div style={{ height: 2, backgroundColor: '#1677ff', borderRadius: 1, marginBottom: 2 }} />}
      <div
        draggable
        onDragStart={(e) => { e.stopPropagation(); onReorderDragStart(e, area, index); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '3px 8px', backgroundColor: '#f0f5ff',
          border: '1px solid #adc6ff', borderRadius: 4,
          fontSize: 12, color: '#2f54eb', width: '100%',
          boxSizing: 'border-box', cursor: 'grab',
        }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {field.displayName || field.originalName}
          {showAggregation && aggLabel && (
            <span style={{ color: '#8c8c8c', marginLeft: 4, fontWeight: 400 }}>· {aggLabel}</span>
          )}
        </span>
        <Tooltip title="移除">
          <Button
            size="small" type="text" icon={<DeleteOutlined />}
            style={{ color: '#ff4d4f', padding: 0, minWidth: 'auto', height: 'auto', flexShrink: 0 }}
            onClick={(e) => { e.stopPropagation(); onRemove(area, field.originalName); }}
          />
        </Tooltip>
      </div>
      {insertAfter && <div style={{ height: 2, backgroundColor: '#1677ff', borderRadius: 1, marginTop: 2 }} />}
    </div>
  );
};

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
  onRemove: (area: string, originalName: string) => void;
  onReorder: (area: string, fromIndex: number, toIndex: number) => void;
}

const DropZone: React.FC<DropZoneProps> = ({
  areaKey, label, fields, isOver, showAggregation,
  onDragEnter, onDragOver, onDragLeave, onDrop, onRemove, onReorder,
}) => {
  const [reorderFromIndex, setReorderFromIndex] = useState<number | null>(null);
  const [insertIndex, setInsertIndex] = useState<number | null>(null);

  const handleReorderDragStart = (e: React.DragEvent, area: string, index: number) => {
    e.dataTransfer.setData('application/insight-reorder', JSON.stringify({ area, index }));
    e.dataTransfer.effectAllowed = 'move';
    setReorderFromIndex(index);
  };

  const handleItemDragOver = (e: React.DragEvent, index: number) => {
    if (reorderFromIndex === null) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    setInsertIndex(e.clientY < mid ? index : index + 1);
  };

  const handleZoneDrop = (e: React.DragEvent) => {
    const reorderData = e.dataTransfer.getData('application/insight-reorder');
    if (reorderData) {
      e.preventDefault();
      e.stopPropagation();
      const { area, index: fromIndex } = JSON.parse(reorderData);
      if (area === areaKey && insertIndex !== null && insertIndex !== fromIndex && insertIndex !== fromIndex + 1) {
        onReorder(areaKey, fromIndex, insertIndex);
      }
      setReorderFromIndex(null);
      setInsertIndex(null);
      return;
    }
    setReorderFromIndex(null);
    setInsertIndex(null);
    onDrop(e, areaKey);
  };

  const handleZoneDragLeave = (e: React.DragEvent) => {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      setReorderFromIndex(null);
      setInsertIndex(null);
      onDragLeave();
    }
  };

  const isReordering = reorderFromIndex !== null;

  return (
    <div style={{ marginBottom: 8, border: '1px solid #f0f0f0', borderRadius: 6, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '5px 10px', backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: '#595959', flex: 1 }}>{label}</span>
      </div>
      <div
        style={{
          minHeight: 40, padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 5,
          border: isOver && !isReordering ? '2px dashed #4096ff' : '2px solid transparent',
          backgroundColor: isOver && !isReordering ? '#e6f4ff' : 'transparent',
          borderRadius: 4, transition: 'all 0.15s',
        }}
        onDragEnter={(e) => { if (!isReordering) onDragEnter(e, areaKey); }}
        onDragOver={(e) => { if (!isReordering) onDragOver(e); else e.preventDefault(); }}
        onDragLeave={handleZoneDragLeave}
        onDrop={handleZoneDrop}
      >
        {fields.length > 0 ? (
          fields.map((field, idx) => (
            <div key={field.originalName} onDragOver={(e) => handleItemDragOver(e, idx)}>
              <FieldTag
                field={field} area={areaKey} index={idx}
                onRemove={onRemove} showAggregation={showAggregation}
                onReorderDragStart={handleReorderDragStart}
                insertBefore={insertIndex === idx && reorderFromIndex !== null && reorderFromIndex !== idx}
                insertAfter={insertIndex === idx + 1 && reorderFromIndex !== null && reorderFromIndex !== idx}
              />
            </div>
          ))
        ) : (
          <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, color: '#bfbfbf', fontSize: 12, userSelect: 'none' }}>
            <DragOutlined style={{ fontSize: 12 }} />
            <span>拖入字段</span>
          </div>
        )}
      </div>
    </div>
  );
};

export interface ChartConfigPanelProps {
  chartId: string;
  onClose: () => void;
  onSaved: (chartId: string) => void;
}

const ChartConfigPanel: React.FC<ChartConfigPanelProps> = ({ chartId, onClose, onSaved }) => {
  const [chartName, setChartName] = useState('');
  const [chartType, setChartType] = useState<ChartType>('crossTable');
  const [selectedDataset, setSelectedDataset] = useState('');
  const [datasets, setDatasets] = useState<{ id: string; name: string }[]>([]);
  const [datasetFields, setDatasetFields] = useState<FieldConfig[]>([]);
  const [fieldSearch, setFieldSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const [droppableArea, setDroppableArea] = useState<string | null>(null);
  const [draggedField, setDraggedField] = useState<FieldConfig | null>(null);
  const [draggedFields, setDraggedFields] = useState<FieldConfig[]>([]);
  const [selectedFields, setSelectedFields] = useState<Set<string>>(new Set());

  const [rowFields, setRowFields] = useState<FieldConfig[]>([]);
  const [colFields, setColFields] = useState<FieldConfig[]>([]);
  const [measureFields, setMeasureFields] = useState<FieldConfig[]>([]);
  const [xAxisFields, setXAxisFields] = useState<FieldConfig[]>([]);
  const [yAxisFields, setYAxisFields] = useState<FieldConfig[]>([]);
  const [y2AxisFields, setY2AxisFields] = useState<FieldConfig[]>([]);
  const [groupFields, setGroupFields] = useState<FieldConfig[]>([]);
  const [indicatorFields, setIndicatorFields] = useState<FieldConfig[]>([]);
  const [filterFields, setFilterFields] = useState<FieldConfig[]>([]);

  const fieldSetters: Record<string, React.Dispatch<React.SetStateAction<FieldConfig[]>>> = {
    row: setRowFields, col: setColFields, measure: setMeasureFields,
    xAxis: setXAxisFields, yAxis: setYAxisFields, y2Axis: setY2AxisFields,
    group: setGroupFields, indicator: setIndicatorFields, filter: setFilterFields,
  };

  useEffect(() => {
    axios.get('/api/datasets/select-list')
      .then(res => setDatasets(res.data.items))
      .catch(() => {});
  }, []);

  useEffect(() => {
    axios.get(`/api/charts/${chartId}`).then(res => {
      const chart = res.data;
      setChartName(chart.name);
      setSelectedDataset(chart.datasetId);
      setChartType(chart.type);
      const config = typeof chart.config === 'string' ? JSON.parse(chart.config) : (chart.config || {});
      setRowFields(config.rowFields || []);
      setColFields(config.colFields || []);
      setMeasureFields(config.measureFields || []);
      setXAxisFields(config.xAxisFields || []);
      setYAxisFields(config.yAxisFields || []);
      setY2AxisFields(config.y2AxisFields || []);
      setGroupFields(config.groupFields || []);
      setIndicatorFields(config.indicatorFields || []);
      setFilterFields(config.filterFields || []);
    }).catch(() => message.error('获取图表详情失败'));
  }, [chartId]);

  useEffect(() => {
    if (!selectedDataset) { setDatasetFields([]); return; }
    axios.get(`/api/datasets/${selectedDataset}`)
      .then(res => setDatasetFields(res.data.fieldsConfig || []))
      .catch(() => setDatasetFields([]));
  }, [selectedDataset]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const config = JSON.stringify({ rowFields, colFields, measureFields, xAxisFields, yAxisFields, y2AxisFields, groupFields, indicatorFields, filterFields });
      await axios.put(`/api/charts/${chartId}`, { name: chartName, datasetId: selectedDataset, type: chartType, config });
      message.success('图表配置已保存');
      onSaved(chartId);
    } catch {
      message.error('保存失败，请重试');
    } finally {
      setSaving(false);
    }
  };

  const filteredFields = datasetFields.filter(f =>
    !fieldSearch ||
    f.displayName.toLowerCase().includes(fieldSearch.toLowerCase()) ||
    f.originalName.toLowerCase().includes(fieldSearch.toLowerCase())
  );
  const dimensionFields = filteredFields.filter(f => f.type === 'dimension');
  const metricFields = filteredFields.filter(f => f.type !== 'dimension');

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

  const handleReorder = (area: string, fromIndex: number, toIndex: number) => {
    fieldSetters[area]?.(prev => {
      const arr = [...prev];
      const [item] = arr.splice(fromIndex, 1);
      arr.splice(toIndex > fromIndex ? toIndex - 1 : toIndex, 0, item);
      return arr;
    });
  };

  const handleRemoveField = (area: string, originalName: string) => {
    fieldSetters[area]?.(prev => prev.filter(f => f.originalName !== originalName));
  };

  const dropZoneProps = {
    isOver: false,
    onDragEnter: handleDragEnter,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
    onRemove: handleRemoveField,
    onReorder: handleReorder,
  };

  const chartTypeOptions = [
    { label: '交叉表', value: 'crossTable', icon: <TableOutlined /> },
    { label: '柱状图', value: 'bar', icon: <BarChartOutlined /> },
    { label: '折线图', value: 'line', icon: <LineChartOutlined /> },
    { label: '饼图', value: 'pie', icon: <PieChartOutlined /> },
    { label: '指标卡', value: 'indicator', icon: <DashboardOutlined /> },
    { label: '双Y轴图', value: 'dualAxis', icon: <FundOutlined /> },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>
      {/* 顶部 */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <Button type="text" size="small" icon={<ArrowLeftOutlined />} onClick={onClose} style={{ color: '#595959' }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#262626', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {chartName}
        </span>
        <Button type="primary" size="small" icon={<SaveOutlined />} loading={saving} onClick={handleSave}>
          保存
        </Button>
      </div>

      {/* 两列布局 */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* 字段设置 */}
        <div style={{ flex: 1, borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#595959', textAlign: 'center' }}>字段设置</div>
          </div>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 6 }}>图表类型</div>
            <Space wrap size={3}>
              {chartTypeOptions.map(opt => (
                <Tooltip key={opt.value} title={opt.label} placement="top">
                  <Button
                    size="small"
                    type={chartType === opt.value ? 'primary' : 'default'}
                    icon={opt.icon}
                    onClick={() => setChartType(opt.value as ChartType)}
                    style={{ fontSize: 11, paddingLeft: 6, paddingRight: 6 }}
                  />
                </Tooltip>
              ))}
            </Space>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '8px 10px' }}>
            {chartType === 'crossTable' && (
              <>
                <DropZone {...dropZoneProps} areaKey="row" label="行" fields={rowFields} isOver={droppableArea === 'row'} />
                <DropZone {...dropZoneProps} areaKey="col" label="列" fields={colFields} isOver={droppableArea === 'col'} />
                <DropZone {...dropZoneProps} areaKey="measure" label="指标" fields={measureFields} isOver={droppableArea === 'measure'} showAggregation />
                <DropZone {...dropZoneProps} areaKey="filter" label="筛选" fields={filterFields} isOver={droppableArea === 'filter'} />
              </>
            )}
            {(chartType === 'bar' || chartType === 'line') && (
              <>
                <DropZone {...dropZoneProps} areaKey="xAxis" label="X 轴（维度）" fields={xAxisFields} isOver={droppableArea === 'xAxis'} />
                <DropZone {...dropZoneProps} areaKey="yAxis" label="Y 轴（指标）" fields={yAxisFields} isOver={droppableArea === 'yAxis'} showAggregation />
                <DropZone {...dropZoneProps} areaKey="group" label="分组" fields={groupFields} isOver={droppableArea === 'group'} />
                <DropZone {...dropZoneProps} areaKey="filter" label="筛选" fields={filterFields} isOver={droppableArea === 'filter'} />
              </>
            )}
            {chartType === 'pie' && (
              <>
                <DropZone {...dropZoneProps} areaKey="group" label="分组" fields={groupFields} isOver={droppableArea === 'group'} />
                <DropZone {...dropZoneProps} areaKey="measure" label="指标" fields={measureFields} isOver={droppableArea === 'measure'} showAggregation />
                <DropZone {...dropZoneProps} areaKey="filter" label="筛选" fields={filterFields} isOver={droppableArea === 'filter'} />
              </>
            )}
            {chartType === 'indicator' && (
              <DropZone {...dropZoneProps} areaKey="indicator" label="指标" fields={indicatorFields} isOver={droppableArea === 'indicator'} showAggregation />
            )}
            {chartType === 'dualAxis' && (
              <>
                <DropZone {...dropZoneProps} areaKey="xAxis" label="X 轴（维度）" fields={xAxisFields} isOver={droppableArea === 'xAxis'} />
                <DropZone {...dropZoneProps} areaKey="yAxis" label="左Y轴（柱）" fields={yAxisFields} isOver={droppableArea === 'yAxis'} showAggregation />
                <DropZone {...dropZoneProps} areaKey="y2Axis" label="右Y轴（线）" fields={y2AxisFields} isOver={droppableArea === 'y2Axis'} showAggregation />
                <DropZone {...dropZoneProps} areaKey="filter" label="筛选" fields={filterFields} isOver={droppableArea === 'filter'} />
              </>
            )}
          </div>
        </div>

        {/* 数据集字段 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#595959', textAlign: 'center' }}>数据集</div>
          </div>
          <div style={{ padding: '6px 10px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
            <Select
              placeholder="选择数据集"
              style={{ width: '100%' }}
              value={selectedDataset || undefined}
              onChange={setSelectedDataset}
              size="small"
            >
              {datasets.map(d => <Select.Option key={d.id} value={d.id}>{d.name}</Select.Option>)}
            </Select>
          </div>
          {datasetFields.length > 0 && (
            <div style={{ padding: '6px 10px', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
              <input
                style={{ width: '100%', padding: '3px 8px', fontSize: 12, border: '1px solid #d9d9d9', borderRadius: 4, outline: 'none', boxSizing: 'border-box' }}
                placeholder="搜索字段..."
                value={fieldSearch}
                onChange={e => setFieldSearch(e.target.value)}
              />
            </div>
          )}
          <div style={{ flex: 1, overflow: 'auto', padding: '8px 10px' }}>
            {datasetFields.length === 0 ? (
              <div style={{ textAlign: 'center', color: '#bfbfbf', fontSize: 12, paddingTop: 20 }}>请先选择数据集</div>
            ) : (
              <>
                {dimensionFields.length > 0 && (
                  <>
                    <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 5, fontWeight: 500 }}>维度 ({dimensionFields.length})</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 }}>
                      {dimensionFields.map((field, i) => {
                        const isSelected = selectedFields.has(field.originalName);
                        return (
                          <div
                            key={i}
                            draggable
                            onClick={() => setSelectedFields(prev => {
                              const next = new Set(prev);
                              if (next.has(field.originalName)) next.delete(field.originalName);
                              else next.add(field.originalName);
                              return next;
                            })}
                            onDragStart={(e) => handleDragStart(e, field)}
                            onDragEnd={handleDragEnd}
                            style={{
                              padding: '4px 7px', backgroundColor: isSelected ? '#d6e4ff' : '#f0f5ff',
                              border: isSelected ? '1px solid #1677ff' : '1px solid #d6e4ff',
                              borderRadius: 4, cursor: 'grab', display: 'flex', alignItems: 'center', gap: 5, userSelect: 'none',
                            }}
                          >
                            <Tag color="blue" style={{ fontSize: 10, padding: '0 3px', lineHeight: '15px', height: 15, flexShrink: 0, margin: 0 }}>维</Tag>
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                              <div style={{ fontSize: 11, color: '#1d39c4', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {field.displayName || field.originalName}
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
                    <div style={{ fontSize: 11, color: '#8c8c8c', marginBottom: 5, fontWeight: 500 }}>指标 ({metricFields.length})</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {metricFields.map((field, i) => {
                        const isSelected = selectedFields.has(field.originalName);
                        return (
                          <div
                            key={i}
                            draggable
                            onClick={() => setSelectedFields(prev => {
                              const next = new Set(prev);
                              if (next.has(field.originalName)) next.delete(field.originalName);
                              else next.add(field.originalName);
                              return next;
                            })}
                            onDragStart={(e) => handleDragStart(e, field)}
                            onDragEnd={handleDragEnd}
                            style={{
                              padding: '4px 7px', backgroundColor: isSelected ? '#ffe7ba' : '#fff7e6',
                              border: isSelected ? '1px solid #fa8c16' : '1px solid #ffd591',
                              borderRadius: 4, cursor: 'grab', display: 'flex', alignItems: 'center', gap: 5, userSelect: 'none',
                            }}
                          >
                            <Tag color="orange" style={{ fontSize: 10, padding: '0 3px', lineHeight: '15px', height: 15, flexShrink: 0, margin: 0 }}>指</Tag>
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                              <div style={{ fontSize: 11, color: '#d46b08', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {field.displayName || field.originalName}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
                {filteredFields.length === 0 && (
                  <div style={{ textAlign: 'center', color: '#bfbfbf', fontSize: 12, paddingTop: 16 }}>无匹配字段</div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChartConfigPanel;
