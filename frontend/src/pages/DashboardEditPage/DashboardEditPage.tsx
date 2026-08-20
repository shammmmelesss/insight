import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Button, Input, Layout, Space, Card, Modal, message, Spin, Dropdown, Tooltip, Select, Popover } from 'antd';
import { ArrowLeftOutlined, SearchOutlined, EllipsisOutlined, CodeOutlined, SettingOutlined, CalendarOutlined, PlusOutlined } from '@ant-design/icons';
import DateRangeFilterPicker, { DateRangeFilterValue, DEFAULT_DATE_RANGE_VALUE, resolveDateRangeValue, resolvedRangeLabel} from '../../components/DateRangeFilterPicker/DateRangeFilterPicker';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { fetchDatasetOptions } from '@/api/datasets';
import { fetchChartOptions } from '@/api/charts';
import { dashboardCache } from '../../utils/dashboardCache';
import { downloadSensitiveCsv } from '../../utils/csvDownload';
import RGL, { WidthProvider } from 'react-grid-layout/legacy';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

interface RGLLayout {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  static?: boolean;
}

import { DashboardLayoutItem, ChartOption, FilterField } from '@shared/api.interface';
import ChartRenderer from '../../components/ChartRenderer';
import FilterConfigModal from '../../components/FilterConfigModal/FilterConfigModal';
import ChartConfigPanel from '../../components/ChartConfigPanel/ChartConfigPanel';

const ReactGridLayout = WidthProvider(RGL);

const chineseAggToAlias = (agg: string): string => {
  switch (agg) {
    case '求和': return 'sum';
    case '平均值': return 'avg';
    case '最大值': return 'max';
    case '最小值': return 'min';
    case '去重计数': return 'count_distinct';
    default: return 'count';
  }
};
const { Sider, Content } = Layout;

// 稳定的空引用，避免每次渲染生成新对象/数组导致 ChartRenderer 的 memo 失效
const EMPTY_CFG: any = {};
const EMPTY_DATA: any[] = [];

const extractNames = (fields: any[]): string[] => (fields || []).map((f: any) => f.originalName);

const buildFieldFormats = (cfg: any): Record<string, string> => {
  const result: Record<string, string> = {};
  [...(cfg.measureFields || []), ...(cfg.yAxisFields || []), ...(cfg.y2AxisFields || []), ...(cfg.indicatorFields || [])].forEach((f: any) => {
    if (f.originalName && f.config?.dataFormat && f.config.dataFormat !== '原始值') {
      result[f.originalName] = f.config.dataFormat;
    }
  });
  return result;
};

const buildFieldLabelMap = (cfg: any): Record<string, string> => {
  const map: Record<string, string> = {};
  [...(cfg.rowFields || []), ...(cfg.colFields || []), ...(cfg.xAxisFields || []), ...(cfg.groupFields || [])].forEach((f: any) => {
    if (f.originalName) map[f.originalName] = f.displayName || f.originalName;
  });
  [...(cfg.measureFields || []), ...(cfg.yAxisFields || []), ...(cfg.y2AxisFields || []), ...(cfg.indicatorFields || [])].forEach((f: any) => {
    if (f.originalName) {
      const chineseAgg = f.config?.aggregation || '计数';
      const englishAlias = chineseAggToAlias(chineseAgg);
      map[`${f.originalName}_${englishAlias}`] = f.displayName || f.originalName;
    }
  });
  return map;
};

// 记忆化的图表主体：仅当自身 data / cfg / 高度 / 类型变化时才重渲染，
// 避免看板拖拽、筛选、配置面板输入等无关状态变更触发所有图表销毁重建
interface DashboardChartBodyProps {
  chartType: any;
  data: any[];
  cfg: any;
  chartH: number;
}
const DashboardChartBody: React.FC<DashboardChartBodyProps> = React.memo(({ chartType, data, cfg, chartH }) => {
  const rowFields = useMemo(() => extractNames(cfg.rowFields), [cfg.rowFields]);
  const colFields = useMemo(() => extractNames(cfg.colFields), [cfg.colFields]);
  const measureFields = useMemo(() => extractNames(cfg.measureFields), [cfg.measureFields]);
  const xAxisFields = useMemo(() => extractNames(cfg.xAxisFields), [cfg.xAxisFields]);
  const yAxisFields = useMemo(() => extractNames(cfg.yAxisFields), [cfg.yAxisFields]);
  const y2AxisFields = useMemo(() => extractNames(cfg.y2AxisFields), [cfg.y2AxisFields]);
  const groupFields = useMemo(() => extractNames(cfg.groupFields), [cfg.groupFields]);
  const indicatorFields = useMemo(() => extractNames(cfg.indicatorFields), [cfg.indicatorFields]);
  const fieldFormats = useMemo(() => buildFieldFormats(cfg), [cfg]);
  const fieldLabelMap = useMemo(() => buildFieldLabelMap(cfg), [cfg]);
  return (
    <ChartRenderer
      chartType={chartType || 'bar'}
      chartData={data}
      rowFields={rowFields}
      colFields={colFields}
      measureFields={measureFields}
      xAxisFields={xAxisFields}
      yAxisFields={yAxisFields}
      y2AxisFields={y2AxisFields}
      groupFields={groupFields}
      indicatorFields={indicatorFields}
      containerHeight={chartH}
      fieldLabelMap={fieldLabelMap}
      fieldFormats={fieldFormats}
    />
  );
});

const COLS = 12;
const ROW_HEIGHT = 30;
const GRID_MARGIN: [number, number] = [10, 10];
const DEFAULT_W = 6;
const DEFAULT_H = 10;

// Total pixel height of a grid item: ROW_HEIGHT * h + MARGIN * (h - 1)
const gridItemPixelHeight = (h: number) => ROW_HEIGHT * h + GRID_MARGIN[1] * (h - 1);
// Chart area height = card total - header (40px) - body padding (20px)
const chartAreaHeight = (h: number) => Math.max(120, gridItemPixelHeight(h) - 60);

// Detect old layout format (width <= 8 and height <= 8 means pre-RGL format)
const toRGLLayout = (items: DashboardLayoutItem[]): RGLLayout[] =>
  items.map((item, index) => {
    const isOld = item.width <= 8 && item.height <= 8;
    return {
      i: item.chartId,
      x: isOld ? 0 : item.x,
      y: isOld ? index * DEFAULT_H : item.y,
      w: isOld ? (item.width >= 8 ? COLS : DEFAULT_W) : item.width,
      h: isOld ? DEFAULT_H : item.height,
      minW: 3,
      minH: 4,
    };
  });

const fromRGLLayout = (rglLayout: RGLLayout[], existing: DashboardLayoutItem[]): DashboardLayoutItem[] =>
  existing.map(item => {
    const l = rglLayout.find(r => r.i === item.chartId);
    if (!l) return item;
    return { ...item, x: l.x, y: l.y, width: l.w, height: l.h };
  });

const DashboardEditPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();

  const [charts, setCharts] = useState<ChartOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [selectedCharts, setSelectedCharts] = useState<DashboardLayoutItem[]>([]);
  const [rglLayout, setRglLayout] = useState<RGLLayout[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [isCancelModalVisible, setIsCancelModalVisible] = useState(false);
  const [chartData, setChartData] = useState<Record<string, any[]>>({});
  const [chartConfigs, setChartConfigs] = useState<Record<string, any>>({});
  const [isFilterModalVisible, setIsFilterModalVisible] = useState(false);
  const [datasets, setDatasets] = useState<Array<{ id: string; name: string }>>([]);
  const [filters, setFilters] = useState<FilterField[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, any>>({});
  const [filterFieldOptions, setFilterFieldOptions] = useState<Record<string, any[]>>({});
  const [datasetFieldTypes, setDatasetFieldTypes] = useState<Record<string, string>>({});
  const [chartSQLs, setChartSQLs] = useState<Record<string, string>>({});
  const [sqlModalVisible, setSqlModalVisible] = useState(false);
  const [currentSQL, setCurrentSQL] = useState('');
  const [configChartId, setConfigChartId] = useState<string | null>(null);
  const [datePickerOpen, setDatePickerOpen] = useState<Record<string, boolean>>({});
  const [siderWidth, setSiderWidth] = useState(300);

  const handleSiderResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    // 直接操作 DOM 宽度避免拖动时整页重渲染导致卡顿，松手时再提交一次 state
    const aside = (e.currentTarget as HTMLElement).parentElement as HTMLElement | null;
    const startX = e.clientX;
    const startWidth = siderWidth;
    let latestWidth = startWidth;
    let rafId = 0;

    // antd Sider 自带 width 过渡动画，拖动时会导致跟手延迟，临时关闭
    if (aside) aside.style.transition = 'none';

    const apply = (w: number) => {
      if (!aside) return;
      aside.style.width = `${w}px`;
      aside.style.minWidth = `${w}px`;
      aside.style.maxWidth = `${w}px`;
      aside.style.flex = `0 0 ${w}px`;
    };

    const onMove = (ev: MouseEvent) => {
      // 面板在右侧，向左拖动变宽
      // 面板在右侧，向左（看板容器方向）拖动变宽
      latestWidth = Math.min(960, Math.max(260, startWidth + (startX - ev.clientX)));
      if (!rafId) {
        rafId = requestAnimationFrame(() => { rafId = 0; apply(latestWidth); });
      }
    };
    const onUp = () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      if (aside) aside.style.transition = '';
      setSiderWidth(latestWidth);
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const loadedChartIds = useRef<Set<string>>(new Set());
  const draftCounter = useRef(0);

  // 在看板上直接新建一张空图表（草稿），并打开右侧配置面板
  const handleCreateChart = () => {
    const draftId = `draft-${++draftCounter.current}`;
    setCharts(prev => [...prev, { id: draftId, name: '未命名图表', type: 'crossTable' } as ChartOption]);
    setSelectedCharts(prev => [...prev, { chartId: draftId, x: 0, y: 0, width: DEFAULT_W, height: DEFAULT_H }]);
    setRglLayout(prev => [...prev, { i: draftId, x: 0, y: Infinity, w: DEFAULT_W, h: DEFAULT_H, minW: 3, minH: 4 }]);
    // 草稿无后端数据，标记为已加载避免触发 /data 请求
    loadedChartIds.current.add(draftId);
    setConfigChartId(draftId);
  };

  // 关闭配置面板：未保存的草稿图表直接丢弃，已有图表仅关闭面板
  const handleRemoveDraftOnClose = (cid: string) => {
    if (cid.startsWith('draft-')) {
      handleRemoveChart(cid);
    } else {
      setConfigChartId(null);
    }
  };

  // 草稿保存成功后用真实 id 替换草稿 id
  const handleChartSaved = (cid: string, newId?: string) => {
    if (newId && newId !== cid) {
      setSelectedCharts(prev => prev.map(item => item.chartId === cid ? { ...item, chartId: newId } : item));
      setRglLayout(prev => prev.map(l => l.i === cid ? { ...l, i: newId } : l));
      setCharts(prev => prev.filter(c => c.id !== cid));
      loadedChartIds.current.delete(cid);
      // newId 不加入 loadedChartIds，交由 selectedCharts 副作用拉取数据
      setConfigChartId(null);
      fetchCharts();
    } else {
      setConfigChartId(null);
      loadedChartIds.current.delete(cid);
      fetchChartData(cid);
    }
  };

  const fetchDashboardDetail = async () => {
    if (id) {
      try {
        const response = await axios.get(`/api/dashboards/${id}`);
        const dashboardData = response.data;
        setName(dashboardData.name);
        let layout: DashboardLayoutItem[] = [];
        if (typeof dashboardData.layout === 'string') {
          try { layout = JSON.parse(dashboardData.layout); } catch (e) { layout = []; }
        } else if (Array.isArray(dashboardData.layout)) {
          layout = dashboardData.layout;
        }
        const dedupedLayout = layout.filter((item, idx, arr) => arr.findIndex(a => a.chartId === item.chartId) === idx);
        setSelectedCharts(dedupedLayout);
        setRglLayout(toRGLLayout(dedupedLayout));

        let savedFilters: FilterField[] = [];
        if (typeof dashboardData.filters === 'string') {
          try { savedFilters = JSON.parse(dashboardData.filters); } catch (e) { savedFilters = []; }
        } else if (Array.isArray(dashboardData.filters)) {
          savedFilters = dashboardData.filters;
        }
        if (savedFilters.length > 0) {
          setFilters(savedFilters);
          const initialValues: Record<string, any> = {};
          savedFilters.forEach(f => {
            initialValues[f.id] = f.type === 'dateRange' ? (f.defaultValue ?? DEFAULT_DATE_RANGE_VALUE) : f.defaultValue;
          });
          setFilterValues(initialValues);
          savedFilters.forEach(f => {
            if (f.dataset && f.field) {
              if (f.type !== 'dateRange') fetchFilterFieldOptions(f.dataset, f.field);
              fetchDatasetFieldType(f.dataset, f.field);
            }
          });
        }
      } catch (error: any) {
        if (error?.response?.status === 403) {
          message.error('无权限访问此看板');
        } else {
          message.error('获取看板详情失败');
        }
        console.error('获取看板详情失败:', error);
      }
    }
  };

  const fetchCharts = async () => {
    try {
      setCharts(await fetchChartOptions());
    } catch (error) {
      message.error('获取图表列表失败');
      console.error('获取图表列表失败:', error);
    }
  };

  const fetchDatasets = async () => {
    try {
      setDatasets(await fetchDatasetOptions());
    } catch (error) {
      message.error('获取数据集列表失败');
      console.error('获取数据集列表失败:', error);
    }
  };

  const fetchChartData = useCallback(async (chartId: string, filterParams?: Array<{ field: string; type: string; dataType: string; values: string[] }>) => {
    try {
      const params: Record<string, string> = {};
      if (filterParams && filterParams.length > 0) {
        params.filters = JSON.stringify(filterParams);
      }
      const response = await axios.get(`/api/charts/${chartId}/data`, { params });
      setChartData(prev => ({ ...prev, [chartId]: response.data.data }));
      if (response.data.sql) {
        setChartSQLs(prev => ({ ...prev, [chartId]: response.data.sql }));
      }
      if (response.data.chart?.config) {
        let config = response.data.chart.config;
        if (typeof config === 'string') {
          try { config = JSON.parse(config); } catch (e) { config = {}; }
        }
        setChartConfigs(prev => ({ ...prev, [chartId]: config }));
      }
    } catch (error) {
      console.error('获取图表数据失败:', error);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchDashboardDetail(), fetchCharts(), fetchDatasets()]);
      setLoading(false);
    };
    loadData();
  }, [id]);

  const selectedChartIds = useMemo(() => selectedCharts.map(item => item.chartId), [selectedCharts]);
  const selectedChartIdsKey = selectedChartIds.join(',');

  useEffect(() => {
    selectedCharts.forEach(item => {
      if (!loadedChartIds.current.has(item.chartId)) {
        loadedChartIds.current.add(item.chartId);
        fetchChartData(item.chartId);
      }
    });
    const currentIds = new Set(selectedChartIds);
    loadedChartIds.current.forEach(cid => {
      if (!currentIds.has(cid)) loadedChartIds.current.delete(cid);
    });
  }, [selectedChartIdsKey, fetchChartData]);

  const filteredCharts = useMemo(() => charts.filter(chart =>
    chart.name.toLowerCase().includes(searchKeyword.toLowerCase())
  ), [charts, searchKeyword]);

  const isChartAdded = (chartId: string) => selectedCharts.some(item => item.chartId === chartId);

  const handleAddChart = (chartId: string) => {
    if (isChartAdded(chartId)) {
      message.info('该图表已添加至看板');
      return;
    }
    const newItem: DashboardLayoutItem = { chartId, x: 0, y: 0, width: DEFAULT_W, height: DEFAULT_H };
    const newRgl: RGLLayout = { i: chartId, x: 0, y: Infinity, w: DEFAULT_W, h: DEFAULT_H, minW: 3, minH: 4 };
    setSelectedCharts(prev => [...prev, newItem]);
    setRglLayout(prev => [...prev, newRgl]);
  };

  const handleRemoveChart = (chartId: string) => {
    setSelectedCharts(prev => prev.filter(item => item.chartId !== chartId));
    setRglLayout(prev => prev.filter(l => l.i !== chartId));
    if (chartId.startsWith('draft-')) {
      setCharts(prev => prev.filter(c => c.id !== chartId));
      loadedChartIds.current.delete(chartId);
      if (configChartId === chartId) setConfigChartId(null);
    }
  };

  const handleCopyChart = async (item: DashboardLayoutItem) => {
    try {
      const res = await axios.post(`/api/charts/${item.chartId}/copy`);
      const newChartId: string = res.data.id;
      const newItem: DashboardLayoutItem = { chartId: newChartId, x: 0, y: 0, width: item.width, height: item.height };
      const newRgl: RGLLayout = { i: newChartId, x: 0, y: Infinity, w: item.width, h: item.height, minW: 3, minH: 4 };
      setSelectedCharts(prev => [...prev, newItem]);
      setRglLayout(prev => [...prev, newRgl]);
      // 刷新图表列表，使复制的图表出现在右侧面板
      await fetchCharts();
      message.success('图表复制成功');
    } catch (error) {
      message.error('图表复制失败');
      console.error('图表复制失败:', error);
    }
  };

  const handleLayoutChange = (layout: RGLLayout[]) => {
    setRglLayout(layout);
  };

  const handleLayoutCommit = (layout: RGLLayout[]) => {
    setSelectedCharts(prev => fromRGLLayout(layout, prev));
  };

  const backToDashboards = (selectedId?: string) =>
    navigate(selectedId ? `/dashboards/${selectedId}` : '/dashboards');

  const handleBack = () => backToDashboards(id);
  const handleCancel = () => setIsCancelModalVisible(true);
  const handleConfirmCancel = () => { setIsCancelModalVisible(false); backToDashboards(id); };

  const handleSave = async () => {
    if (!name.trim()) { message.error('请输入看板名称'); return; }
    try {
      // 过滤掉尚未保存的草稿图表，避免把无效 id 写入布局
      const sortedCharts = [...selectedCharts].filter(item => !item.chartId.startsWith('draft-')).sort((a, b) =>
        a.y !== b.y ? a.y - b.y : a.x - b.x
      );
      const payload = { name, layout: JSON.stringify(sortedCharts), filters: JSON.stringify(filters) };
      if (id) {
        await axios.put(`/api/dashboards/${id}`, payload);
        message.success('看板更新成功');
        dashboardCache.invalidateAll();
        backToDashboards(id);
      } else {
        const res = await axios.post('/api/dashboards', payload);
        message.success('看板创建成功');
        dashboardCache.invalidateAll();
        backToDashboards(res.data?.id);
      }
    } catch (error) {
      message.error('保存失败，请重试');
      console.error('保存失败:', error);
    }
  };

  const handleOpenFilterModal = () => setIsFilterModalVisible(true);
  const handleCloseFilterModal = () => setIsFilterModalVisible(false);

  const handleSaveFilterConfig = (newFilters: FilterField[]) => {
    setFilters(newFilters);
    const initialValues: Record<string, any> = {};
    newFilters.forEach(f => {
      if (f.type === 'dateRange') {
        const dv = f.defaultValue as DateRangeFilterValue | undefined;
        initialValues[f.id] = dv?.startType ? dv : DEFAULT_DATE_RANGE_VALUE;
      } else {
        initialValues[f.id] = f.defaultValue;
      }
    });
    setFilterValues(initialValues);
    newFilters.forEach(f => {
      if (f.dataset && f.field) {
        if (f.type !== 'dateRange') fetchFilterFieldOptions(f.dataset, f.field);
        fetchDatasetFieldType(f.dataset, f.field);
      }
    });
    message.success('筛选器配置保存成功');
    setIsFilterModalVisible(false);
  };

  const fetchDatasetFieldType = async (datasetId: string, fieldName: string) => {
    const cacheKey = `${datasetId}:${fieldName}`;
    if (datasetFieldTypes[cacheKey]) return;
    try {
      const response = await axios.get(`/api/datasets/${datasetId}/fields`);
      const items = response.data.items || [];
      items.forEach((item: any) => {
        const key = `${datasetId}:${item.id || item.name}`;
        const dbType = (item.type || '').toUpperCase();
        const isNumber = ['INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT', 'FLOAT', 'DOUBLE', 'DECIMAL', 'NUMERIC', 'REAL'].some(t => dbType.includes(t));
        const isDate = ['DATE', 'DATETIME', 'TIMESTAMP'].some(t => dbType.includes(t));
        setDatasetFieldTypes(prev => ({ ...prev, [key]: isNumber ? 'number' : isDate ? 'date' : 'text' }));
      });
    } catch (error) {
      console.error('获取字段类型失败:', error);
    }
  };

  const buildFilterParamsForChart = (chartId: string): Array<{ field: string; type: string; dataType: string; values: string[]; exclude?: boolean }> => {
    const params: Array<{ field: string; type: string; dataType: string; values: string[]; exclude?: boolean }> = [];
    filters.forEach(f => {
      if (f.charts.length > 0 && !f.charts.includes(chartId)) return;
      const val = filterValues[f.id];
      if (val === undefined || val === null) return;
      const dataType = datasetFieldTypes[`${f.dataset}:${f.field}`] || 'text';
      if (f.type === 'dateRange') {
        if (val && typeof val === 'object' && 'startType' in (val as object)) {
          const drv = val as DateRangeFilterValue;
          const [s, e] = resolveDateRangeValue(drv);
          params.push({ field: f.field, type: 'dateRange', dataType, values: [s.format('YYYY-MM-DD'), e.format('YYYY-MM-DD')] });
        } else if (Array.isArray(val) && val.length === 2 && val[0] && val[1]) {
          params.push({ field: f.field, type: 'dateRange', dataType, values: [val[0].format('YYYY-MM-DD'), val[1].format('YYYY-MM-DD')] });
        }
      } else {
        const values = Array.isArray(val) ? val : (val !== undefined && val !== null && val !== '' ? [val] : []);
        if (values.length > 0) {
          params.push({ field: f.field, type: f.type, dataType, values: values.map(String), exclude: f.exclude });
        }
      }
    });
    return params;
  };

  useEffect(() => {
    if (filters.length === 0) return;
    const affectedChartIds = new Set<string>();
    filters.forEach(f => f.charts.forEach((cid: string) => affectedChartIds.add(cid)));
    affectedChartIds.forEach(chartId => {
      const params = buildFilterParamsForChart(chartId);
      fetchChartData(chartId, params);
    });
  }, [filterValues]);

  const fetchFilterFieldOptions = async (datasetId: string, fieldName: string) => {
    const cacheKey = `${datasetId}:${fieldName}`;
    if (filterFieldOptions[cacheKey]) return;
    try {
      const response = await axios.get(`/api/datasets/${datasetId}/field-values`, { params: { field: fieldName } });
      setFilterFieldOptions(prev => ({ ...prev, [cacheKey]: response.data.values || [] }));
    } catch (error) {
      console.error('获取筛选字段值失败:', error);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* 顶部操作栏 */}
      <div style={{ padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={handleBack} style={{ marginRight: 16 }}>
            返回
          </Button>
          <Input
            placeholder="看板名称编辑"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: '300px' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button type="default" onClick={handleOpenFilterModal}>筛选器</Button>
          <Button type="default" icon={<PlusOutlined />} onClick={handleCreateChart}>新增图表</Button>
        </div>
        <Space>
          <Button onClick={handleCancel}>取消</Button>
          <Button type="primary" onClick={handleSave}>保存</Button>
        </Space>
      </div>

      {/* 主内容区域 */}
      <Layout style={{ flex: 1, minHeight: 0, height: 'auto', overflow: 'hidden' }}>
        <Content style={{ padding: '10px', background: '#f0f2f5', overflow: 'auto' }}>
          {/* 筛选器展示区域 */}
          {filters.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, padding: '10px 12px', marginBottom: 10, background: '#fff', borderRadius: 6, border: '1px solid #ebebeb' }}>
              {filters.map(filter => (
                <div key={filter.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <span style={{ fontSize: 12, color: '#666' }}>{filter.name}</span>
                  {filter.type === 'dateRange' ? (
                    <Popover
                      trigger="click"
                      placement="bottomRight"
                      open={!!datePickerOpen[filter.id]}
                      onOpenChange={(v) => setDatePickerOpen(prev => ({ ...prev, [filter.id]: v }))}
                      content={
                        <DateRangeFilterPicker
                          value={filterValues[filter.id] as DateRangeFilterValue | undefined}
                          onChange={(val) => { setFilterValues(prev => ({ ...prev, [filter.id]: val })); setDatePickerOpen(prev => ({ ...prev, [filter.id]: false })); }}
                          onCancel={() => setDatePickerOpen(prev => ({ ...prev, [filter.id]: false }))}
                        />
                      }
                    >
                      <Button size="middle" icon={<CalendarOutlined />} style={{ width: '100%', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {filterValues[filter.id]
                          ? resolvedRangeLabel(filterValues[filter.id] as DateRangeFilterValue)
                          : '选择日期范围'}
                      </Button>
                    </Popover>
                  ) : (
                    <Select
                      size="middle"
                      style={{ width: '100%' }}
                      mode={filter.type === 'multiple' ? 'multiple' : undefined}
                      maxTagCount="responsive"
                      value={filterValues[filter.id]}
                      onChange={(value) => setFilterValues(prev => ({ ...prev, [filter.id]: value }))}
                      allowClear
                      placeholder="请选择"
                    >
                      {(filterFieldOptions[`${filter.dataset}:${filter.field}`] || []).map((val: any) => (
                        <Select.Option key={String(val)} value={String(val)}>{String(val)}</Select.Option>
                      ))}
                    </Select>
                  )}
                </div>
              ))}
            </div>
          )}

          {selectedCharts.length > 0 ? (
            <ReactGridLayout
              layout={rglLayout}
              cols={COLS}
              rowHeight={ROW_HEIGHT}
              margin={GRID_MARGIN}
              onLayoutChange={handleLayoutChange as any}
              onDragStop={handleLayoutCommit as any}
              onResizeStop={handleLayoutCommit as any}
              isDraggable
              isResizable
              draggableHandle=".chart-drag-handle"
              resizeHandles={['se', 'sw', 'ne', 'nw', 's', 'e']}
            >
              {selectedCharts.map((item, index) => {
                const chart = charts.find(c => c.id === item.chartId);
                const cfg = chartConfigs[item.chartId] || EMPTY_CFG;
                const key = item.chartId;
                const layoutItem = rglLayout.find(l => l.i === key);
                const h = layoutItem?.h ?? DEFAULT_H;
                const chartH = chartAreaHeight(h);

                const isConfigSelected = configChartId === item.chartId;

                return (
                  <div key={key} onClick={() => setConfigChartId(item.chartId)}>
                    <Card
                      title={
                        <span className="chart-drag-handle" style={{ cursor: 'move', display: 'block' }}>
                          {chart?.name || `图表${index + 1}`}
                        </span>
                      }
                      style={{ height: '100%', boxShadow: isConfigSelected ? '0 0 0 2px #1677ff' : 'none', overflow: 'visible' }}
                      styles={{
                        header: { height: '40px', padding: '0 12px', display: 'flex', alignItems: 'center', borderBottom: 'none', cursor: 'move' },
                        body: { padding: '10px', overflow: 'visible', height: 'calc(100% - 40px)' },
                      }}
                      extra={
                        <Dropdown
                          menu={{
                            items: [
                              {
                                key: 'config',
                                label: '配置图表',
                                icon: <SettingOutlined />,
                                onClick: () => setConfigChartId(item.chartId),
                              },
                              {
                                key: 'viewSQL',
                                label: '查看SQL',
                                icon: <CodeOutlined />,
                                onClick: () => { setCurrentSQL(chartSQLs[item.chartId] || '暂无SQL'); setSqlModalVisible(true); },
                              },
                              {
                                key: 'copy',
                                label: '复制图表',
                                onClick: () => handleCopyChart(item),
                              },
                              ...(chart?.type === 'crossTable' ? [{
                                key: 'download',
                                label: '下载数据',
                                onClick: () => {
                                  const rows = (chartData[item.chartId] || []) as Record<string, unknown>[];
                                  if (!rows.length) return;
                                  const headers = Object.keys(rows[0]);
                                  const csv = [headers.join(','), ...rows.map(r => headers.map(h => {
                                    const v = String(r[h] ?? '');
                                    return v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;
                                  }).join(','))].join('\n');
                                  downloadSensitiveCsv(csv, chart?.name || 'cross_table');
                                },
                              }] : []),
                              { type: 'divider' as const },
                              {
                                key: 'remove',
                                label: <span style={{ color: '#ff4d4f' }}>移除</span>,
                                onClick: () => handleRemoveChart(key),
                              },
                            ],
                          }}
                          trigger={['hover']}
                        >
                          <Tooltip title="更多">
                            <Button type="text" icon={<EllipsisOutlined />} size="small" style={{ cursor: 'pointer' }} onMouseDown={e => e.stopPropagation()} />
                          </Tooltip>
                        </Dropdown>
                      }
                    >
                      <DashboardChartBody
                        chartType={chart?.type as any}
                        data={chartData[item.chartId] || EMPTY_DATA}
                        cfg={cfg}
                        chartH={chartH}
                      />
                    </Card>
                  </div>
                );
              })}
            </ReactGridLayout>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 0', backgroundColor: '#fafafa', borderRadius: '8px' }}>
              <div style={{ fontSize: '16px', color: '#666', marginBottom: 16 }}>暂无图表</div>
              <div style={{ fontSize: '14px', color: '#999' }}>请从右侧选择图表添加到看板</div>
            </div>
          )}
        </Content>

        {/* 图表选择 / 配置区域 */}
        <Sider width={siderWidth} style={{ background: '#fff', borderLeft: '1px solid #f0f0f0', overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
          {/* 拖动调整宽度 */}
          <div
            onMouseDown={handleSiderResizeStart}
            style={{ position: 'absolute', left: -3, top: 0, bottom: 0, width: 6, cursor: 'col-resize', zIndex: 20 }}
          />
          {configChartId ? (
            <ChartConfigPanel
              chartId={configChartId}
              onClose={() => handleRemoveDraftOnClose(configChartId)}
              onSaved={handleChartSaved}
              onChartTypeChange={(cid, type) => {
                setCharts(prev => prev.map(c => c.id === cid ? { ...c, type } : c));
              }}
              onConfigChange={(cid, config, type) => {
                setCharts(prev => prev.map(c => c.id === cid ? { ...c, type } : c));
                // 草稿图表尚未持久化，无法调用 /preview，仅在本地更新类型
                if (cid.startsWith('draft-')) {
                  try { setChartConfigs(prev => ({ ...prev, [cid]: JSON.parse(config) })); } catch { /* ignore */ }
                  return;
                }
                axios.post(`/api/charts/${cid}/preview`, { config, type })
                  .then(res => {
                    setChartData(prev => ({ ...prev, [cid]: res.data.data }));
                    setChartConfigs(prev => ({ ...prev, [cid]: JSON.parse(config) }));
                  })
                  .catch(() => {});
              }}
            />
          ) : (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ padding: '20px 20px 0' }}>
                <Input
                  placeholder="搜索图表名称"
                  prefix={<SearchOutlined />}
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  style={{ width: '100%', marginBottom: 16 }}
                />
              </div>
              <div style={{ padding: '0 16px 16px', overflow: 'auto', flex: 1, minHeight: 0 }}>
                {filteredCharts.length > 0 ? (
                  <div>
                    {filteredCharts.filter(chart => !chart.id.startsWith('draft-')).map((chart) => (
                      <div key={chart.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '8px 12px', borderRadius: '4px', backgroundColor: '#fafafa' }}>
                        <div>{chart.name}</div>
                        {isChartAdded(chart.id) ? (
                          <Button type="text" danger size="small" onClick={() => handleRemoveChart(chart.id)}>移除</Button>
                        ) : (
                          <Button type="text" size="small" onClick={() => handleAddChart(chart.id)}>添加</Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>没有找到匹配的图表</div>
                )}
              </div>
            </div>
          )}
        </Sider>
      </Layout>

      {/* 取消确认弹窗 */}
      <Modal
        title="确认取消"
        open={isCancelModalVisible}
        onCancel={() => setIsCancelModalVisible(false)}
        onOk={handleConfirmCancel}
        okText="确定"
        cancelText="取消"
      >
        <p>确定要放弃当前编辑吗？未保存的内容将丢失</p>
      </Modal>

      {/* 筛选器配置弹窗 */}
      <FilterConfigModal
        visible={isFilterModalVisible}
        onCancel={handleCloseFilterModal}
        onOk={handleSaveFilterConfig}
        datasets={datasets}
        charts={charts}
        dashboardChartIds={selectedCharts.map(item => item.chartId)}
        initialFilters={filters}
      />

      {/* SQL查看弹窗 */}
      <Modal
        title="查看SQL"
        open={sqlModalVisible}
        onCancel={() => setSqlModalVisible(false)}
        footer={null}
        width={700}
      >
        <pre style={{ background: '#f5f5f5', padding: 16, borderRadius: 4, overflow: 'auto', maxHeight: 400, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 13 }}>
          {currentSQL}
        </pre>
      </Modal>
    </div>
  );
};

export default DashboardEditPage;
