import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { Button, Input, Layout, Space, Card, Modal, message, Spin, Dropdown, Tooltip, Select, Popover } from 'antd';
import { ArrowLeftOutlined, SearchOutlined, EllipsisOutlined, CodeOutlined, SettingOutlined, CalendarOutlined, PlusOutlined, FontSizeOutlined, FilterOutlined, VerticalAlignTopOutlined, VerticalAlignBottomOutlined } from '@ant-design/icons';
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
import RichTextEditor from '../../components/RichTextEditor';
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
  statusMessage?: string;
}
const DashboardChartBody: React.FC<DashboardChartBodyProps> = React.memo(({ chartType, data, cfg, chartH, statusMessage }) => {
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
      statusMessage={statusMessage}
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
  // 置顶文本组件不参与网格布局
  items.filter(item => !(item.type === 'text' && item.position === 'top')).map((item, index) => {
    // 文本组件始终是新格式，跳过旧布局兼容推断
    const isOld = item.type !== 'text' && item.width <= 8 && item.height <= 8;
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
  const [chartStatus, setChartStatus] = useState<Record<string, string>>({});
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
  // 每个图表左上角「筛选」按钮 Popover 的展开状态
  const [chartFilterOpen, setChartFilterOpen] = useState<Record<string, boolean>>({});
  // 图表自身配置筛选（config.filterFields）的运行时取值：[chartId][字段名] = value
  const [chartFilterValues, setChartFilterValues] = useState<Record<string, Record<string, any>>>({});
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
  const textCounter = useRef(0);

  // 在看板上新增一个文本组件（内容存于布局项，不依赖后端数据）
  const handleAddText = () => {
    const textId = `text-${Date.now()}-${++textCounter.current}`;
    setSelectedCharts(prev => [...prev, { chartId: textId, x: 0, y: 0, width: COLS, height: 3, type: 'text', text: '' }]);
    setRglLayout(prev => [...prev, { i: textId, x: 0, y: Infinity, w: COLS, h: 3, minW: 2, minH: 2 }]);
    // 文本组件无后端数据，标记为已加载避免触发 /data 请求
    loadedChartIds.current.add(textId);
  };

  const handleTextChange = (chartId: string, value: string) => {
    setSelectedCharts(prev => prev.map(item => item.chartId === chartId ? { ...item, text: value } : item));
  };

  // 将文本组件置于筛选器上方：从网格布局中移除，改为顶部堆叠展示
  const handleMoveTextToTop = (chartId: string) => {
    setSelectedCharts(prev => prev.map(item => item.chartId === chartId ? { ...item, position: 'top' } : item));
    setRglLayout(prev => prev.filter(l => l.i !== chartId));
  };

  // 将文本组件移回网格内（取消置顶）
  const handleMoveTextToGrid = (chartId: string) => {
    setSelectedCharts(prev => prev.map(item => item.chartId === chartId ? { ...item, position: undefined } : item));
    setRglLayout(prev => prev.some(l => l.i === chartId) ? prev : [...prev, { i: chartId, x: 0, y: Infinity, w: COLS, h: 3, minW: 2, minH: 2 }]);
  };

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
          const dashName = error.response.data?.name;
          message.error(dashName ? `没有「${dashName}」看板权限` : '无权限访问此看板');
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
      setChartStatus(prev => {
        if (response.data.extracting) return { ...prev, [chartId]: response.data.message || '数据正在写入，请稍候' };
        if (!prev[chartId]) return prev;
        const next = { ...prev }; delete next[chartId]; return next;
      });
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
      if (item.type === 'text') return;
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

  // 从图表自身配置的筛选字段（config.filterFields）构建筛选参数
  const buildChartConfigFilterParams = (
    cfg: Record<string, any>,
    datasetId: string | undefined,
    activeValues: Record<string, any>,
  ): Array<{ field: string; type: string; dataType: string; values: string[] }> => {
    const params: Array<{ field: string; type: string; dataType: string; values: string[] }> = [];
    const fields = (Array.isArray(cfg.filterFields) ? cfg.filterFields : []) as Array<{ originalName: string; config?: { filterType?: string } }>;
    fields.forEach(f => {
      const val = activeValues[f.originalName];
      if (val === undefined || val === null) return;
      const type = f.config?.filterType || 'multiple';
      const dataType = (datasetId && datasetFieldTypes[`${datasetId}:${f.originalName}`]) || 'text';
      if (type === 'dateRange') {
        if (val && typeof val === 'object' && 'startType' in (val as object)) {
          const [s, e] = resolveDateRangeValue(val as DateRangeFilterValue);
          params.push({ field: f.originalName, type: 'dateRange', dataType, values: [s.format('YYYY-MM-DD'), e.format('YYYY-MM-DD')] });
        }
      } else {
        const values = Array.isArray(val) ? val : (val !== '' ? [val] : []);
        if (values.length > 0) params.push({ field: f.originalName, type, dataType, values: values.map(String) });
      }
    });
    return params;
  };

  // 图表自身筛选值变化时，合并看板筛选与图表筛选后重新拉取该图表
  const applyChartConfigFilterChange = (chartId: string, cfg: Record<string, any>, datasetId: string | undefined, fieldName: string, value: any) => {
    setChartFilterValues(prev => {
      const nextForChart = { ...(prev[chartId] || {}), [fieldName]: value };
      const combined = [...buildFilterParamsForChart(chartId), ...buildChartConfigFilterParams(cfg, datasetId, nextForChart)];
      fetchChartData(chartId, combined);
      return { ...prev, [chartId]: nextForChart };
    });
  };

  // 打开图表筛选 Popover 时，加载各筛选字段的可选值与字段类型
  const prepareChartConfigFilters = (chartId: string, cfg: Record<string, any>, datasetId?: string) => {
    const fields = (Array.isArray(cfg.filterFields) ? cfg.filterFields : []) as Array<{ originalName: string; config?: { filterType?: string; filterDefault?: any } }>;
    if (datasetId) {
      fields.forEach(f => {
        fetchDatasetFieldType(datasetId, f.originalName);
        if ((f.config?.filterType || 'multiple') !== 'dateRange') fetchFilterFieldOptions(datasetId, f.originalName);
      });
    }
    // 首次打开时，用图表配置的默认筛选值初始化尚未设置的字段
    setChartFilterValues(prev => {
      if (prev[chartId]) return prev;
      const seeded: Record<string, any> = {};
      fields.forEach(f => {
        const def = f.config?.filterDefault;
        if (def !== undefined && def !== null && !(Array.isArray(def) && def.length === 0)) seeded[f.originalName] = def;
      });
      return Object.keys(seeded).length > 0 ? { ...prev, [chartId]: seeded } : prev;
    });
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
          <Button type="default" icon={<FontSizeOutlined />} onClick={handleAddText}>文本</Button>
        </div>
        <Space>
          <Button onClick={handleCancel}>取消</Button>
          <Button type="primary" onClick={handleSave}>保存</Button>
        </Space>
      </div>

      {/* 主内容区域 */}
      <Layout style={{ flex: 1, minHeight: 0, height: 'auto', overflow: 'hidden' }}>
        <Content style={{ padding: '10px', background: 'var(--bg-layout)', overflow: 'auto' }}>
          {/* 置于筛选器上方的文本组件 */}
          {selectedCharts.filter(item => item.type === 'text' && item.position === 'top').map(item => (
            <div key={item.chartId} style={{ marginBottom: 10 }}>
              <Card styles={{ body: { padding: 0 } }}>
                <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0, padding: 8 }}>
                    <RichTextEditor
                      value={item.text || ''}
                      onChange={value => handleTextChange(item.chartId, value)}
                      placeholder="请输入文本内容"
                    />
                  </div>
                  <div style={{ display: 'flex', flexShrink: 0, padding: '4px 6px 0 0' }}>
                    <Tooltip title="移回看板内">
                      <Button type="text" size="small" icon={<VerticalAlignBottomOutlined />} onClick={() => handleMoveTextToGrid(item.chartId)} />
                    </Tooltip>
                    <Tooltip title="移除">
                      <Button type="text" danger size="small" icon={<EllipsisOutlined />} onClick={() => handleRemoveChart(item.chartId)} />
                    </Tooltip>
                  </div>
                </div>
              </Card>
            </div>
          ))}

          {/* 筛选器展示区域 */}
          {filters.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, padding: '10px 12px', marginBottom: 10, background: '#fff', borderRadius: 10, border: '1px solid var(--border)', boxShadow: 'var(--shadow-card)' }}>
              {filters.map(filter => (
                <div key={filter.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{filter.name}</span>
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

          {selectedCharts.some(item => !(item.type === 'text' && item.position === 'top')) ? (
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
              {selectedCharts.filter(item => !(item.type === 'text' && item.position === 'top')).map((item, index) => {
                const chart = charts.find(c => c.id === item.chartId);
                const cfg = chartConfigs[item.chartId] || EMPTY_CFG;
                // 图表自身配置的筛选字段（图表配置里「筛选」区域拖入的字段）
                const chartConfigFilterFields = (Array.isArray(cfg.filterFields) ? cfg.filterFields : []) as Array<{ originalName: string; displayName?: string; config?: { filterType?: string } }>;
                const key = item.chartId;
                const layoutItem = rglLayout.find(l => l.i === key);
                const h = layoutItem?.h ?? DEFAULT_H;
                const chartH = chartAreaHeight(h);

                const isConfigSelected = configChartId === item.chartId;

                if (item.type === 'text') {
                  return (
                    <div key={key}>
                      <Card
                        style={{ height: '100%', overflow: 'hidden' }}
                        styles={{ body: { padding: 0, height: '100%' } }}
                      >
                        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                          <div className="chart-drag-handle" style={{ height: 24, cursor: 'move', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 6px', flexShrink: 0 }}>
                            <Tooltip title="置于筛选器上方">
                              <Button type="text" size="small" icon={<VerticalAlignTopOutlined />} onMouseDown={e => e.stopPropagation()} onClick={() => handleMoveTextToTop(key)} />
                            </Tooltip>
                            <Tooltip title="移除">
                              <Button type="text" danger size="small" icon={<EllipsisOutlined />} onMouseDown={e => e.stopPropagation()} onClick={() => handleRemoveChart(key)} />
                            </Tooltip>
                          </div>
                          <div style={{ flex: 1, minHeight: 0, padding: '0 8px 8px' }}>
                            <RichTextEditor
                              value={item.text || ''}
                              onChange={value => handleTextChange(key, value)}
                              placeholder="请输入文本内容"
                            />
                          </div>
                        </div>
                      </Card>
                    </div>
                  );
                }

                return (
                  <div key={key} onClick={() => setConfigChartId(item.chartId)}>
                    <Card
                      title={(() => {
                        const appliedFilters = filters.filter(f => f.charts.length === 0 || f.charts.includes(item.chartId));
                        return (
                          <span className="chart-drag-handle" style={{ cursor: 'move', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {chart?.name || `图表${index + 1}`}
                            </span>
                            {appliedFilters.length > 0 && (
                              <Tooltip
                                title={
                                  <div>
                                    <div style={{ marginBottom: 4, fontWeight: 500 }}>命中筛选器：</div>
                                    {appliedFilters.map(f => (
                                      <div key={f.id} style={{ fontSize: 12 }}>{f.name}（{f.field}）</div>
                                    ))}
                                  </div>
                                }
                              >
                                <FilterOutlined style={{ fontSize: 12, color: 'var(--primary)', flexShrink: 0, cursor: 'default' }} />
                              </Tooltip>
                            )}
                          </span>
                        );
                      })()}
                      style={{ height: '100%', boxShadow: isConfigSelected ? '0 0 0 2px var(--primary)' : 'none', overflow: 'visible' }}
                      styles={{
                        header: { height: '40px', padding: '0 12px', display: 'flex', alignItems: 'center', borderBottom: 'none', cursor: 'move' },
                        body: { padding: '10px', overflow: 'visible', height: 'calc(100% - 40px)' },
                      }}
                      extra={
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        {chartConfigFilterFields.length > 0 && (
                          <Popover
                            open={!!chartFilterOpen[item.chartId]}
                            onOpenChange={open => {
                              if (open) prepareChartConfigFilters(item.chartId, cfg, chart?.datasetId);
                              setChartFilterOpen(prev => ({ ...prev, [item.chartId]: open }));
                            }}
                            trigger="click"
                            placement="bottomRight"
                            arrow={false}
                            content={
                              <div style={{ minWidth: 240, maxWidth: 320, padding: '4px 0' }} onClick={e => e.stopPropagation()} onMouseDown={e => e.stopPropagation()}>
                                <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 13 }}>筛选项</div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                  {chartConfigFilterFields.map(ff => {
                                    const fType = ff.config?.filterType || 'multiple';
                                    const curVal = chartFilterValues[item.chartId]?.[ff.originalName];
                                    const dpKey = `cf:${item.chartId}:${ff.originalName}`;
                                    return (
                                      <div key={ff.originalName} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{ff.displayName || ff.originalName}</span>
                                        {fType === 'dateRange' ? (
                                          <Popover
                                            trigger="click"
                                            placement="bottomLeft"
                                            open={!!datePickerOpen[dpKey]}
                                            onOpenChange={open => setDatePickerOpen(prev => ({ ...prev, [dpKey]: open }))}
                                            content={
                                              <DateRangeFilterPicker
                                                value={curVal as DateRangeFilterValue | undefined}
                                                onChange={(val) => {
                                                  applyChartConfigFilterChange(item.chartId, cfg, chart?.datasetId, ff.originalName, val);
                                                  setDatePickerOpen(prev => ({ ...prev, [dpKey]: false }));
                                                }}
                                                onCancel={() => setDatePickerOpen(prev => ({ ...prev, [dpKey]: false }))}
                                              />
                                            }
                                          >
                                            <Button size="small" icon={<CalendarOutlined />} style={{ width: '100%', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                              {curVal ? resolvedRangeLabel(curVal as DateRangeFilterValue) : '选择日期范围'}
                                            </Button>
                                          </Popover>
                                        ) : (
                                          <Select
                                            size="small"
                                            style={{ width: '100%' }}
                                            mode={fType === 'multiple' ? 'multiple' : undefined}
                                            maxTagCount="responsive"
                                            value={curVal}
                                            onChange={(value) => applyChartConfigFilterChange(item.chartId, cfg, chart?.datasetId, ff.originalName, value)}
                                            allowClear
                                            placeholder="请选择"
                                            getPopupContainer={triggerNode => triggerNode.parentElement || document.body}
                                          >
                                            {(filterFieldOptions[`${chart?.datasetId}:${ff.originalName}`] || []).map((val: any) => (
                                              <Select.Option key={String(val)} value={String(val)}>{String(val)}</Select.Option>
                                            ))}
                                          </Select>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            }
                            getPopupContainer={() => document.body}
                          >
                            <Button
                              size="small"
                              type="text"
                              icon={<FilterOutlined style={{ fontSize: 12 }} />}
                              style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '0 6px', display: 'flex', alignItems: 'center' }}
                              onClick={e => e.stopPropagation()}
                              onMouseDown={e => e.stopPropagation()}
                            >
                              筛选
                            </Button>
                          </Popover>
                        )}
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
                              {
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
                                  downloadSensitiveCsv(csv, chart?.name || 'chart');
                                },
                              },
                              { type: 'divider' as const },
                              {
                                key: 'remove',
                                label: <span style={{ color: 'var(--error)' }}>移除</span>,
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
                        </span>
                      }
                    >
                      <DashboardChartBody
                        chartType={chart?.type as any}
                        data={chartData[item.chartId] || EMPTY_DATA}
                        cfg={cfg}
                        chartH={chartH}
                        statusMessage={chartStatus[item.chartId]}
                      />
                    </Card>
                  </div>
                );
              })}
            </ReactGridLayout>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 0', backgroundColor: '#F8FAFC', borderRadius: '12px', border: '1px dashed var(--border)' }}>
              <div style={{ fontSize: 16, color: 'var(--text-secondary)', marginBottom: 16 }}>暂无图表</div>
              <div style={{ fontSize: 14, color: 'var(--text-tertiary)' }}>请从右侧选择图表添加到看板</div>
            </div>
          )}
        </Content>

        {/* 图表选择 / 配置区域 */}
        <Sider width={siderWidth} style={{ background: '#fff', borderLeft: '1px solid var(--border-secondary)', overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative' }}>
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
                      <div key={chart.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '8px 12px', borderRadius: 8, backgroundColor: '#F8FAFC', border: '1px solid var(--border-secondary)' }}>
                        <div style={{ fontWeight: 500 }}>{chart.name}</div>
                        {isChartAdded(chart.id) ? (
                          <Button type="text" danger size="small" onClick={() => handleRemoveChart(chart.id)}>移除</Button>
                        ) : (
                          <Button type="text" size="small" onClick={() => handleAddChart(chart.id)}>添加</Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)' }}>没有找到匹配的图表</div>
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
        <pre style={{ background: '#111827', padding: 16, borderRadius: 10, overflow: 'auto', maxHeight: 400, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 13, color: '#D1D5DB', fontFamily: 'source-code-pro, Menlo, Monaco, Consolas, monospace' }}>
          {currentSQL}
        </pre>
      </Modal>
    </div>
  );
};

export default DashboardEditPage;
