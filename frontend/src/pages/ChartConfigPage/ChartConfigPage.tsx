import React, { useState, useEffect, useCallback, useRef } from 'react';
import { App, Button, Input, Select, Modal, Tag, Tooltip, Space, Radio, Popover } from 'antd';
import { CalendarOutlined as CalendarIcon } from '@ant-design/icons';
import DateRangeFilterPicker, { DateRangeFilterValue, DEFAULT_DATE_RANGE_VALUE, resolveDateRangeValue, resolvedRangeLabel } from '../../components/DateRangeFilterPicker/DateRangeFilterPicker';
import {
  ArrowLeftOutlined,
  SettingOutlined,
  DeleteOutlined,
  TableOutlined,
  BarChartOutlined,
  LineChartOutlined,
  PieChartOutlined,
  DashboardOutlined,
  FundOutlined,
  SearchOutlined,
  DragOutlined,
  SaveOutlined,
  CodeOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import ChartRenderer from '../../components/ChartRenderer';

type ChartType = 'crossTable' | 'bar' | 'line' | 'pie' | 'indicator' | 'dualAxis';

const { Option } = Select;


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

// --- 子组件：字段 Tag ---
interface FieldTagProps {
  field: FieldConfig;
  area: string;
  index: number;
  onSettings: (field: FieldConfig, area: string) => void;
  onRemove: (area: string, originalName: string) => void;
  showAggregation?: boolean;
  onReorderDragStart: (e: React.DragEvent, area: string, index: number) => void;
  insertBefore?: boolean;
  insertAfter?: boolean;
}

const FieldTag: React.FC<FieldTagProps> = ({
  field, area, index, onSettings, onRemove, showAggregation,
  onReorderDragStart, insertBefore, insertAfter,
}) => {
  const aggLabel = field.config?.aggregation;
  return (
    <div style={{ position: 'relative' }}>
      {insertBefore && (
        <div style={{ height: 2, backgroundColor: '#1677ff', borderRadius: 1, marginBottom: 2 }} />
      )}
      <div
        draggable
        onDragStart={(e) => { e.stopPropagation(); onReorderDragStart(e, area, index); }}
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
          cursor: 'grab',
        }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {field.displayName || field.originalName}
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
            onClick={(e) => { e.stopPropagation(); onSettings(field, area); }}
          />
        </Tooltip>
        <Tooltip title="移除">
          <Button
            size="small"
            type="text"
            icon={<DeleteOutlined />}
            style={{ color: '#ff4d4f', padding: 0, minWidth: 'auto', height: 'auto', flexShrink: 0 }}
            onClick={(e) => { e.stopPropagation(); onRemove(area, field.originalName); }}
          />
        </Tooltip>
      </div>
      {insertAfter && (
        <div style={{ height: 2, backgroundColor: '#1677ff', borderRadius: 1, marginTop: 2 }} />
      )}
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
  onAreaSettings?: (area: string) => void;
  onRemove: (area: string, originalName: string) => void;
  onReorder: (area: string, fromIndex: number, toIndex: number) => void;
}

const DropZone: React.FC<DropZoneProps> = ({
  areaKey, label, fields, isOver, showAggregation,
  onDragEnter, onDragOver, onDragLeave, onDrop, onSettings, onAreaSettings, onRemove, onReorder,
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
        {fields.length > 0 && onAreaSettings && (
          <Button
            size="small"
            type="link"
            style={{ fontSize: 12, padding: '0 4px', height: 'auto', color: '#1677ff' }}
            onClick={() => onAreaSettings(areaKey)}
          >
            设置
          </Button>
        )}
      </div>
      <div
        style={{
          minHeight: 44,
          padding: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          border: isOver && !isReordering ? '2px dashed #4096ff' : '2px solid transparent',
          backgroundColor: isOver && !isReordering ? '#e6f4ff' : 'transparent',
          borderRadius: 4,
          transition: 'all 0.15s',
        }}
        onDragEnter={(e) => { if (!isReordering) onDragEnter(e, areaKey); }}
        onDragOver={(e) => { if (!isReordering) onDragOver(e); else e.preventDefault(); }}
        onDragLeave={handleZoneDragLeave}
        onDrop={handleZoneDrop}
      >
        {fields.length > 0 ? (
          fields.map((field, idx) => (
            <div
              key={field.originalName}
              onDragOver={(e) => handleItemDragOver(e, idx)}
            >
              <FieldTag
                field={field}
                area={areaKey}
                index={idx}
                onSettings={onSettings}
                onRemove={onRemove}
                showAggregation={showAggregation}
                onReorderDragStart={handleReorderDragStart}
                insertBefore={insertIndex === idx && reorderFromIndex !== null && reorderFromIndex !== idx}
                insertAfter={insertIndex === idx + 1 && reorderFromIndex !== null && reorderFromIndex !== idx}
              />
            </div>
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
};

// --- 主组件 ---
const ChartConfigPage: React.FC = () => {
  const { message } = App.useApp();
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
  const [dataSourceType, setDataSourceType] = useState('');
  const [datasetType, setDatasetType] = useState<string>('');
  const [loadedDatasetId, setLoadedDatasetId] = useState('');

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

  const [rowFields, setRowFields] = useState<FieldConfig[]>([]);
  const [colFields, setColFields] = useState<FieldConfig[]>([]);
  const [measureFields, setMeasureFields] = useState<FieldConfig[]>([]);
  const [xAxisFields, setXAxisFields] = useState<FieldConfig[]>([]);
  const [yAxisFields, setYAxisFields] = useState<FieldConfig[]>([]);
  const [y2AxisFields, setY2AxisFields] = useState<FieldConfig[]>([]);
  const [groupFields, setGroupFields] = useState<FieldConfig[]>([]);
  const [indicatorFields, setIndicatorFields] = useState<FieldConfig[]>([]);
  const [filterFields, setFilterFields] = useState<FieldConfig[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, any>>({});
  const [filterFieldOptions, setFilterFieldOptions] = useState<Record<string, string[]>>({});
  const loadedFilterKeys = useRef<Set<string>>(new Set());
  const pendingFilterValues = useRef<Record<string, any> | null>(null);

  const navigate = useNavigate();

  const fieldSetters: Record<string, React.Dispatch<React.SetStateAction<FieldConfig[]>>> = {
    row: setRowFields,
    col: setColFields,
    measure: setMeasureFields,
    xAxis: setXAxisFields,
    yAxis: setYAxisFields,
    y2Axis: setY2AxisFields,
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

  // 根据数据源类型获取标识符引号
  const getIdentifierQuote = (): string => {
    const dsType = dataSourceType.toLowerCase();
    // MySQL、BigQuery 使用反引号
    if (dsType === 'mysql' || dsType === 'bigquery') {
      return '`';
    }
    // 其余（PostgreSQL、SQLite、BigQuery、Oracle、SQLServer、未知）均使用双引号（ANSI SQL 标准）
    return '"';
  };

  const buildAggField = (field: FieldConfig) => {
    const aggregation = field.config?.aggregation || '计数';
    const quote = getIdentifierQuote();
    const alias = `${quote}${field.originalName}_${aggregation}${quote}`;
    if (field.isCalculated && field.expression) {
      return `${field.expression} AS ${alias}`;
    }
    if (aggregation === '去重计数') {
      return `COUNT(DISTINCT ${field.originalName}) AS ${alias}`;
    }
    const fn = mapAggregationToSQL(aggregation);
    return `${fn}(${field.originalName}) AS ${alias}`;
  };

  const generateSQL = useCallback(() => {
    if (!datasetSQL) return `SELECT * FROM ${selectedDataset || 'your_table'}`;

    // 计算字段用表达式，普通字段用字段名
    const fieldExpr = (f: FieldConfig) => (f.isCalculated && f.expression) ? f.expression : f.originalName;
    const fieldSelect = (f: FieldConfig) =>
      (f.isCalculated && f.expression) ? `${f.expression} AS ${f.originalName}` : f.originalName;

    const filterClauses = filterFields
      .map(f => {
        const filterType = f.config?.filterType || 'multiple';
        const vals = filterValues[f.originalName];
        if (!vals) return null;
        const expr = fieldExpr(f);
        if (filterType === 'dateRange') {
          if (vals && typeof vals === 'object' && 'startType' in vals) {
            const [s, e] = resolveDateRangeValue(vals as DateRangeFilterValue);
            return `${expr} BETWEEN '${s.format('YYYY-MM-DD')}' AND '${e.format('YYYY-MM-DD')}'`;
          }
          if (Array.isArray(vals) && vals.length === 2 && vals[0] && vals[1]) {
            return `${expr} BETWEEN '${vals[0]}' AND '${vals[1]}'`;
          }
          return null;
        }
        const arr: string[] = Array.isArray(vals) ? vals : (vals !== '' ? [String(vals)] : []);
        if (arr.length === 0) return null;
        const quoted = arr.map((v: string) => `'${v.replace(/'/g, "''")}'`).join(', ');
        return `${expr} IN (${quoted})`;
      })
      .filter((c): c is string => c !== null);

    const innerSQL = filterClauses.length > 0
      ? `SELECT * FROM (${datasetSQL}) AS _inner WHERE ${filterClauses.join(' AND ')}`
      : datasetSQL;

    const wrap = (fields: string[], aggFields: string[], groupBy: string[], orderBy: string[]) => {
      const all = [...fields, ...aggFields];
      if (all.length === 0) return innerSQL;
      let sql = `SELECT ${all.join(', ')} FROM (${innerSQL}) AS dataset WHERE 1=1`;
      if (groupBy.length > 0) sql += ` GROUP BY ${groupBy.join(', ')}`;
      if (orderBy.length > 0) sql += ` ORDER BY ${orderBy.join(', ')}`;
      return sql;
    };

    const sortDir = (f: FieldConfig) => f.config?.sort === '降序' ? 'DESC' : 'ASC';

    if (chartType === 'crossTable') {
      const rows = rowFields.map(fieldSelect);
      const cols = colFields.map(fieldSelect);
      return wrap(
        [...rows, ...cols],
        measureFields.map(buildAggField),
        [...rowFields.map(fieldExpr), ...colFields.map(fieldExpr)],
        rowFields.map(f => `${fieldExpr(f)} ${sortDir(f)}`),
      );
    }
    if (chartType === 'bar' || chartType === 'line') {
      const xs = xAxisFields.map(fieldSelect);
      const gs = groupFields.map(fieldSelect);
      return wrap(
        [...xs, ...gs],
        yAxisFields.map(buildAggField),
        [...xAxisFields.map(fieldExpr), ...groupFields.map(fieldExpr)],
        xAxisFields.map(f => `${fieldExpr(f)} ${sortDir(f)}`),
      );
    }
    if (chartType === 'dualAxis') {
      const xs = xAxisFields.map(fieldSelect);
      return wrap(
        xs,
        [...yAxisFields.map(buildAggField), ...y2AxisFields.map(buildAggField)],
        xAxisFields.map(fieldExpr),
        xAxisFields.map(f => `${fieldExpr(f)} ${sortDir(f)}`),
      );
    }
    if (chartType === 'pie') {
      const gs = groupFields.map(fieldSelect);
      return wrap(gs, measureFields.map(buildAggField), groupFields.map(fieldExpr), []);
    }
    if (chartType === 'indicator') {
      const agg = indicatorFields.map(buildAggField);
      if (agg.length === 0) return innerSQL;
      return `SELECT ${agg.join(', ')} FROM (${innerSQL}) AS dataset WHERE 1=1`;
    }
    return innerSQL;
  }, [datasetSQL, selectedDataset, chartType, rowFields, colFields, measureFields, xAxisFields, yAxisFields, y2AxisFields, groupFields, indicatorFields, filterFields, filterValues, dataSourceType]);

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
    axios.get('/api/datasets/select-list')
      .then(res => setDatasets(res.data.items))
      .catch(() => message.error('获取数据集列表失败'));
  }, []);

  useEffect(() => {
    if (!selectedDataset) {
      setDatasetFields([]); setDatasetSQL(''); setDataSourceId('');
      return;
    }
    loadedFilterKeys.current.clear();
    setFilterFieldOptions({});
    setFilterValues({});
    setLoadedDatasetId('');
    axios.get(`/api/datasets/${selectedDataset}`).then(res => {
      setDatasetFields(res.data.fieldsConfig || []);
      const dsType = res.data.type || 'direct';
      setDatasetType(dsType);
      if (dsType === 'extract') {
        const ckTable = `ds_${res.data.id.replaceAll('-', '_')}`;
        setDatasetSQL(`SELECT * FROM insight.${ckTable}`);
      } else {
        setDatasetSQL(res.data.sql || '');
      }
      setDataSourceId(res.data.dataSourceId || '');
      setLoadedDatasetId(selectedDataset);
      if (pendingFilterValues.current) {
        setFilterValues(pendingFilterValues.current);
        pendingFilterValues.current = null;
      }
      // 获取数据源类型
      const dsId = res.data.dataSourceId;
      if (dsId) {
        axios.get(`/api/data-sources/${dsId}`).then(dsRes => {
          setDataSourceType(dsRes.data.type || '');
        }).catch(() => setDataSourceType(''));
      } else {
        setDataSourceType('');
      }
    }).catch(() => {
      message.error('获取数据集字段失败');
      setDatasetFields([]); setDatasetSQL(''); setDataSourceId(''); setDataSourceType(''); setDatasetType('');
    });
  }, [selectedDataset]);

  const fetchFilterFieldOptions = useCallback(async (fieldName: string) => {
    if (!selectedDataset) return;
    const cacheKey = `${selectedDataset}:${fieldName}`;
    if (loadedFilterKeys.current.has(cacheKey)) return;
    loadedFilterKeys.current.add(cacheKey);
    try {
      const res = await axios.get(`/api/datasets/${selectedDataset}/field-values`, {
        params: { field: fieldName },
      });
      setFilterFieldOptions(prev => ({ ...prev, [cacheKey]: res.data.values || [] }));
    } catch {
      loadedFilterKeys.current.delete(cacheKey);
    }
  }, [selectedDataset]);

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

  const handleReorder = (area: string, fromIndex: number, toIndex: number) => {
    fieldSetters[area]?.(prev => {
      const arr = [...prev];
      const [item] = arr.splice(fromIndex, 1);
      const insertAt = toIndex > fromIndex ? toIndex - 1 : toIndex;
      arr.splice(insertAt, 0, item);
      return arr;
    });
  };

  const handleRemoveField = (area: string, originalName: string) => {
    fieldSetters[area]?.(prev => prev.filter(f => f.originalName !== originalName));
  };

  const getAreaFields = (area: string): FieldConfig[] => {
    const map: Record<string, FieldConfig[]> = {
      row: rowFields, col: colFields, measure: measureFields,
      xAxis: xAxisFields, yAxis: yAxisFields, y2Axis: y2AxisFields,
      group: groupFields, indicator: indicatorFields, filter: filterFields,
    };
    return map[area] || [];
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
    // 日期筛选：将 filterDefault 同步到 filterValues，确保预览立即生效
    // （useEffect 只在 filterValues 中无该 key 时初始化，无法覆盖已有值）
    if (area === 'filter' && tempFieldConfig.filterType === 'dateRange') {
      const dv = tempFieldConfig.filterDefault;
      const newVal = (dv && typeof dv === 'object' && 'startType' in dv) ? dv : DEFAULT_DATE_RANGE_VALUE;
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
            {(() => {
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
              return (
                <ChartRenderer
                  chartType={chartType}
                  chartData={chartData}

                  rowFields={rowFields.map(f => f.originalName)}
                  colFields={colFields.map(f => f.originalName)}
                  measureFields={measureFields.map(f => f.originalName)}
                  xAxisFields={xAxisFields.map(f => f.originalName)}
                  yAxisFields={yAxisFields.map(f => f.originalName)}
                  y2AxisFields={y2AxisFields.map(f => f.originalName)}
                  groupFields={groupFields.map(f => f.originalName)}
                  indicatorFields={indicatorFields.map(f => f.originalName)}
                  fieldFormats={fieldFormats}
                  fieldLabelMap={fieldLabelMap}
                />
              );
            })()}
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
              <Input value={currentField.displayName || currentField.originalName} disabled />
            </div>

            {currentField.area === 'filter' ? (
              <>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>筛选器类型</div>
                  <Radio.Group
                    value={tempFieldConfig.filterType || 'multiple'}
                    onChange={(e) => setTempFieldConfig(p => ({ ...p, filterType: e.target.value, filterDefault: e.target.value === 'dateRange' ? DEFAULT_DATE_RANGE_VALUE : [] }))}
                  >
                    <Radio value="multiple">多选</Radio>
                    <Radio value="single">单选</Radio>
                    <Radio value="dateRange">日期区间</Radio>
                  </Radio.Group>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>筛选默认值</div>
                  {tempFieldConfig.filterType === 'dateRange' ? (
                    <ChartDateRangePickerTrigger
                      value={(tempFieldConfig.filterDefault && typeof tempFieldConfig.filterDefault === 'object' && 'startType' in tempFieldConfig.filterDefault)
                        ? tempFieldConfig.filterDefault as DateRangeFilterValue
                        : DEFAULT_DATE_RANGE_VALUE}
                      onChange={(val) => setTempFieldConfig(p => ({ ...p, filterDefault: val }))}
                    />
                  ) : (
                    <Select
                      style={{ width: '100%' }}
                      mode={tempFieldConfig.filterType === 'single' ? undefined : 'multiple'}
                      value={tempFieldConfig.filterDefault}
                      onChange={(v) => setTempFieldConfig(p => ({ ...p, filterDefault: v }))}
                      allowClear
                      placeholder="请选择默认值"
                    >
                      {(filterFieldOptions[`${selectedDataset}:${currentField.originalName}`] || []).map((val: string) => (
                        <Option key={String(val)} value={String(val)}>{String(val)}</Option>
                      ))}
                    </Select>
                  )}
                </div>
              </>
            ) : (
              <>
                {(currentField.type !== 'dimension' ||
                  currentField.area === 'measure' ||
                  currentField.area === 'yAxis' ||
                  currentField.area === 'y2Axis' ||
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
                  (chartType === 'dualAxis' && (currentField.area === 'yAxis' || currentField.area === 'y2Axis')) ||
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
                      <Option value="整数">整数</Option>
                      <Option value="1位小数">1位小数</Option>
                      <Option value="2位小数">2位小数</Option>
                      <Option value="百分比">百分比</Option>
                      <Option value="千分比">千分比</Option>
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
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
              <Button onClick={() => { setIsFieldSettingsModalVisible(false); setCurrentField(null); }}>取消</Button>
              <Button type="primary" onClick={saveFieldSettings}>确定</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 区域字段批量设置弹窗 */}
      <Modal
        title="批量字段设置"
        open={isAreaSettingsModalVisible}
        onCancel={() => setIsAreaSettingsModalVisible(false)}
        onOk={saveAreaSettings}
        okText="确定"
        cancelText="取消"
        width={620}
        styles={{ body: { padding: '12px 0 0' } }}
      >
        {(() => {
          const areaFields = getAreaFields(currentAreaKey);
          const isFilter = currentAreaKey === 'filter';
          const isMeasureArea = ['measure', 'yAxis', 'y2Axis', 'indicator'].includes(currentAreaKey);
          const allChecked = areaFields.every(f => selectedAreaRows.has(f.originalName));
          const someChecked = areaFields.some(f => selectedAreaRows.has(f.originalName));
          const thStyle: React.CSSProperties = { padding: '8px 10px', fontSize: 12, fontWeight: 500, color: '#595959', textAlign: 'left', borderBottom: '1px solid #f0f0f0', backgroundColor: '#fafafa', whiteSpace: 'nowrap' };
          const tdStyle: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'middle', borderBottom: '1px solid #f5f5f5' };
          const applyToSelected = (configPatch: Partial<NonNullable<FieldConfig['config']>>) => {
            setTempAreaFieldEdits(prev => {
              const next = { ...prev };
              selectedAreaRows.forEach(name => {
                next[name] = { ...next[name], config: { ...next[name]?.config, ...configPatch } };
              });
              return next;
            });
          };
          return (
            <>
            {someChecked && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', backgroundColor: '#e6f4ff', borderBottom: '1px solid #bae0ff', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#1677ff', fontWeight: 500, marginRight: 4 }}>
                  已选 {selectedAreaRows.size} 项，设置：
                </span>
                {isMeasureArea && (
                  <>
                    <Select
                      size="small"
                      placeholder="聚合方式"
                      style={{ width: 110 }}
                      onChange={v => applyToSelected({ aggregation: v })}
                      options={[
                        { label: '求和', value: '求和' },
                        { label: '平均值', value: '平均值' },
                        { label: '最大值', value: '最大值' },
                        { label: '最小值', value: '最小值' },
                        { label: '计数', value: '计数' },
                        { label: '去重计数', value: '去重计数' },
                      ]}
                    />
                    <Select
                      size="small"
                      placeholder="数据格式"
                      style={{ width: 110 }}
                      onChange={v => applyToSelected({ dataFormat: v })}
                      options={[
                        { label: '原始值', value: '原始值' },
                        { label: '整数', value: '整数' },
                        { label: '1位小数', value: '1位小数' },
                        { label: '2位小数', value: '2位小数' },
                        { label: '百分比', value: '百分比' },
                        { label: '自定义', value: '自定义' },
                      ]}
                    />
                  </>
                )}
                {!isFilter && (
                  <Select
                    size="small"
                    placeholder="排序"
                    style={{ width: 90 }}
                    onChange={v => applyToSelected({ sort: v })}
                    options={[
                      { label: '升序', value: '升序' },
                      { label: '降序', value: '降序' },
                    ]}
                  />
                )}
                {isFilter && (
                  <Select
                    size="small"
                    placeholder="筛选器类型"
                    style={{ width: 120 }}
                    onChange={v => applyToSelected({ filterType: v, filterDefault: [] })}
                    options={[
                      { label: '多选', value: 'multiple' },
                      { label: '单选', value: 'single' },
                      { label: '日期区间', value: 'dateRange' },
                    ]}
                  />
                )}
              </div>
            )}
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 36 }} />
                <col style={{ width: 120 }} />
                {isMeasureArea && <col style={{ width: 120 }} />}
                {isMeasureArea && <col style={{ width: 140 }} />}
                {!isFilter && <col style={{ width: 110 }} />}
                {isFilter && <col style={{ width: 140 }} />}
              </colgroup>
              <thead>
                <tr>
                  <th style={thStyle}>
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={el => { if (el) el.indeterminate = !allChecked && someChecked; }}
                      onChange={() => {
                        if (allChecked) setSelectedAreaRows(new Set());
                        else setSelectedAreaRows(new Set(areaFields.map(f => f.originalName)));
                      }}
                    />
                  </th>
                  <th style={thStyle}>字段名称</th>
                  {isMeasureArea && <th style={thStyle}>聚合方式</th>}
                  {isMeasureArea && <th style={thStyle}>数据格式</th>}
                  {!isFilter && <th style={thStyle}>排序</th>}
                  {isFilter && <th style={thStyle}>筛选器类型</th>}
                </tr>
              </thead>
              <tbody>
                {areaFields.map(field => {
                  const edit = tempAreaFieldEdits[field.originalName] || {};
                  const cfg = edit.config || {};
                  const checked = selectedAreaRows.has(field.originalName);
                  return (
                    <tr key={field.originalName} style={{ backgroundColor: checked ? '#fff' : '#fafafa' }}>
                      <td style={tdStyle}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => setSelectedAreaRows(prev => {
                            const next = new Set(prev);
                            if (next.has(field.originalName)) next.delete(field.originalName);
                            else next.add(field.originalName);
                            return next;
                          })}
                        />
                      </td>
                      <td style={{ ...tdStyle, fontSize: 12, color: '#595959' }}>{field.displayName || field.originalName}</td>
                      {isMeasureArea && (
                        <td style={tdStyle}>
                          <Select
                            size="small"
                            style={{ width: '100%' }}
                            value={cfg.aggregation || '计数'}
                            onChange={v => updateAreaFieldConfig(field.originalName, { aggregation: v })}
                            options={[
                              { label: '求和', value: '求和' },
                              { label: '平均值', value: '平均值' },
                              { label: '最大值', value: '最大值' },
                              { label: '最小值', value: '最小值' },
                              { label: '计数', value: '计数' },
                              { label: '去重计数', value: '去重计数' },
                            ]}
                          />
                        </td>
                      )}
                      {isMeasureArea && (
                        <td style={tdStyle}>
                          <Select
                            size="small"
                            style={{ width: '100%' }}
                            value={cfg.dataFormat || '原始值'}
                            onChange={v => updateAreaFieldConfig(field.originalName, { dataFormat: v })}
                            options={[
                              { label: '原始值', value: '原始值' },
                              { label: '整数', value: '整数' },
                              { label: '1位小数', value: '1位小数' },
                              { label: '2位小数', value: '2位小数' },
                              { label: '百分比', value: '百分比' },
                              // { label: '自定义', value: '自定义' },
                            ]}
                          />
                        </td>
                      )}
                      {!isFilter && (
                        <td style={tdStyle}>
                          <Select
                            size="small"
                            style={{ width: '100%' }}
                            value={cfg.sort || '升序'}
                            onChange={v => updateAreaFieldConfig(field.originalName, { sort: v })}
                            options={[
                              { label: '升序', value: '升序' },
                              { label: '降序', value: '降序' },
                            ]}
                          />
                        </td>
                      )}
                      {isFilter && (
                        <td style={tdStyle}>
                          <Select
                            size="small"
                            style={{ width: '100%' }}
                            value={cfg.filterType || 'multiple'}
                            onChange={v => updateAreaFieldConfig(field.originalName, { filterType: v, filterDefault: [] })}
                            options={[
                              { label: '多选', value: 'multiple' },
                              { label: '单选', value: 'single' },
                              { label: '日期区间', value: 'dateRange' },
                            ]}
                          />
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </>
          );
        })()}
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

const ChartDateRangePickerTrigger: React.FC<{ value: DateRangeFilterValue; onChange: (val: DateRangeFilterValue) => void }> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomLeft"
      overlayInnerStyle={{ padding: 0 }}
      content={
        <DateRangeFilterPicker
          value={value}
          onChange={(val) => { onChange(val); setOpen(false); }}
          onCancel={() => setOpen(false)}
        />
      }
    >
      <Button icon={<CalendarIcon />} style={{ width: '100%', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {resolvedRangeLabel(value)}
      </Button>
    </Popover>
  );
};

export default ChartConfigPage;
