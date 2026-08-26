import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Button, Card, Modal, Layout, Skeleton, Select, Tooltip, Dropdown, Popover, Avatar, Checkbox } from 'antd';
import { EditOutlined, MenuUnfoldOutlined, EllipsisOutlined, CodeOutlined, InboxOutlined, PlusOutlined, CalendarOutlined, FilterOutlined, UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { fetchChartOptions } from '@/api/charts';
import { Dashboard, ChartOption, FilterField, DashboardLayoutItem } from '@shared/api.interface';
import DashboardList from '../../components/DashboardList/DashboardList';
import ChartRenderer, { ChartRendererHandle } from '../../components/ChartRenderer';
import { dashboardCache } from '../../utils/dashboardCache';
import DateRangeFilterPicker, { DateRangeFilterValue, DEFAULT_DATE_RANGE_VALUE, resolveDateRangeValue, resolvedRangeLabel} from '../../components/DateRangeFilterPicker/DateRangeFilterPicker';
import { WorkUser, fetchAllWorkUsers } from '@/lib/workUser';
import { canModifyRecord, displayCreator } from '../../utils/currentUser';
import { isEmbedMode } from '../../utils/embed';

// 解析看板的 sharedWith 字段（可能是 JSON 字符串或数组）
const parseSharedWith = (raw: string | WorkUser[] | undefined): WorkUser[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as WorkUser[];
  try { return JSON.parse(raw) || []; } catch { return []; }
};

const ROW_HEIGHT = 30;
const GRID_MARGIN = 10;
const DEFAULT_H = 10;

// Mirror the formula used in DashboardEditPage
const resolveH = (item: DashboardLayoutItem) =>
  item.width <= 8 && item.height <= 8 ? DEFAULT_H : item.height;
const chartAreaHeight = (h: number) =>
  Math.max(120, ROW_HEIGHT * h + GRID_MARGIN * (h - 1) - 60);
const isWide = (item: DashboardLayoutItem) =>
  item.width <= 8 ? item.width >= 8 : item.width >= 10;

const { Sider, Content } = Layout;

interface LazyChartCardProps {
  onEnter: () => void;
  onExit: () => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

const LazyChartCard: React.FC<LazyChartCardProps> = ({ onEnter, onExit, children, style }) => {
  const ref = useRef<HTMLDivElement>(null);
  const onEnterRef = useRef(onEnter);
  const onExitRef = useRef(onExit);
  onEnterRef.current = onEnter;
  onExitRef.current = onExit;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { entry.isIntersecting ? onEnterRef.current() : onExitRef.current(); },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return <div ref={ref} style={style}>{children}</div>;
};

function parseLayout(raw: Dashboard['layout'] | string | unknown): DashboardLayoutItem[] {
  if (Array.isArray(raw)) return raw as DashboardLayoutItem[];
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
}

function parseFilters(raw: FilterField[] | string | unknown): FilterField[] {
  if (Array.isArray(raw)) return raw as FilterField[];
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
}

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

const extractNamesStatic = (fields: Array<{ originalName: string }> | unknown) =>
  (Array.isArray(fields) ? fields : []).map((f: { originalName: string }) => f.originalName);

const buildFieldFormatsStatic = (cfg: Record<string, unknown>): Record<string, string> => {
  const result: Record<string, string> = {};
  const measureLike = [
    ...((cfg.measureFields as any[]) || []),
    ...((cfg.yAxisFields as any[]) || []),
    ...((cfg.y2AxisFields as any[]) || []),
    ...((cfg.indicatorFields as any[]) || []),
  ];
  measureLike.forEach((f: any) => {
    if (f.originalName && f.config?.dataFormat && f.config.dataFormat !== '原始值') {
      result[f.originalName] = f.config.dataFormat;
    }
  });
  return result;
};

const buildFieldLabelMapStatic = (cfg: Record<string, unknown>): Record<string, string> => {
  const map: Record<string, string> = {};
  const dimFields = [
    ...((cfg.rowFields as any[]) || []),
    ...((cfg.colFields as any[]) || []),
    ...((cfg.xAxisFields as any[]) || []),
    ...((cfg.groupFields as any[]) || []),
  ];
  dimFields.forEach((f: any) => {
    if (f.originalName) map[f.originalName] = f.displayName || f.originalName;
  });
  const measureLike = [
    ...((cfg.measureFields as any[]) || []),
    ...((cfg.yAxisFields as any[]) || []),
    ...((cfg.y2AxisFields as any[]) || []),
    ...((cfg.indicatorFields as any[]) || []),
  ];
  measureLike.forEach((f: any) => {
    if (f.originalName) {
      const chineseAgg = f.config?.aggregation || '计数';
      const englishAlias = chineseAggToAlias(chineseAgg);
      map[`${f.originalName}_${englishAlias}`] = f.displayName || f.originalName;
    }
  });
  return map;
};

interface ViewChartBodyProps {
  chartType: string;
  data: Record<string, unknown>[];
  cfg: Record<string, unknown>;
  chartH: number;
  visibleFields?: { rowFields: string[]; colFields: string[]; measureFields: string[] } | null;
  groupFieldsOverride?: string[] | null;
  chartRef: React.RefObject<ChartRendererHandle>;
}
const ViewChartBody: React.FC<ViewChartBodyProps> = React.memo(({ chartType, data, cfg, chartH, visibleFields, groupFieldsOverride, chartRef }) => {
  const rowFields = useMemo(() => visibleFields ? visibleFields.rowFields : extractNamesStatic(cfg.rowFields), [cfg.rowFields, visibleFields]);
  const colFields = useMemo(() => visibleFields ? visibleFields.colFields : extractNamesStatic(cfg.colFields), [cfg.colFields, visibleFields]);
  const measureFields = useMemo(() => visibleFields ? visibleFields.measureFields : extractNamesStatic(cfg.measureFields), [cfg.measureFields, visibleFields]);
  const xAxisFields = useMemo(() => extractNamesStatic(cfg.xAxisFields), [cfg.xAxisFields]);
  const yAxisFields = useMemo(() => extractNamesStatic(cfg.yAxisFields), [cfg.yAxisFields]);
  const y2AxisFields = useMemo(() => extractNamesStatic(cfg.y2AxisFields), [cfg.y2AxisFields]);
  const groupFields = useMemo(
    () => (groupFieldsOverride ? groupFieldsOverride : extractNamesStatic(cfg.groupFields)),
    [cfg.groupFields, groupFieldsOverride]
  );
  const indicatorFields = useMemo(() => extractNamesStatic(cfg.indicatorFields), [cfg.indicatorFields]);
  const fieldFormats = useMemo(() => buildFieldFormatsStatic(cfg), [cfg]);
  const fieldLabelMap = useMemo(() => buildFieldLabelMapStatic(cfg), [cfg]);
  return (
    <ChartRenderer
      ref={chartRef}
      chartType={chartType as any}
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
      fieldFormats={fieldFormats}
      fieldLabelMap={fieldLabelMap}
    />
  );
});

const DashboardsPage: React.FC = () => {
  const navigate = useNavigate();
  const { id: urlId } = useParams<{ id: string }>();
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDashboard, setSelectedDashboard] = useState<Dashboard | null>(null);
  // 非 null 时表示无权限访问 URL 指定的看板（值为看板名称，空串表示名称未知）
  const [noPermission, setNoPermission] = useState<string | null>(null);
  const [charts, setCharts] = useState<ChartOption[]>([]);
  const [chartData, setChartData] = useState<Record<string, unknown[]>>({});
  const [chartConfigs, setChartConfigs] = useState<Record<string, Record<string, unknown>>>({});
  const [chartLoadingMap, setChartLoadingMap] = useState<Record<string, boolean>>({});
  const chartRendererRefs = useRef<Record<string, React.RefObject<ChartRendererHandle>>>({});
  const getChartRef = (id: string) => {
    if (!chartRendererRefs.current[id]) chartRendererRefs.current[id] = React.createRef<ChartRendererHandle>();
    return chartRendererRefs.current[id];
  };
  const loadedChartIds = useRef<Set<string>>(new Set());
  const visibleChartIds = useRef<Set<string>>(new Set());
  const [filters, setFilters] = useState<FilterField[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, unknown>>({});
  const filtersRef = useRef<FilterField[]>([]);
  const filterValuesRef = useRef<Record<string, unknown>>({});
  const [datePickerOpen, setDatePickerOpen] = useState<Record<string, boolean>>({});
  const [filterFieldOptions, setFilterFieldOptions] = useState<Record<string, unknown[]>>({});
  const [datasetFieldTypes, setDatasetFieldTypes] = useState<Record<string, string>>({});
  const [siderCollapsed, setSiderCollapsed] = useState(false);
  const [parsedLayout, setParsedLayout] = useState<DashboardLayoutItem[]>([]);
  const [chartSQLs, setChartSQLs] = useState<Record<string, string>>({});
  const [sqlModalVisible, setSqlModalVisible] = useState(false);
  const [currentSQLChartId, setCurrentSQLChartId] = useState('');
  // openId -> 头像 URL 映射（用于展示创建人头像）
  const [userAvatarMap, setUserAvatarMap] = useState<Record<string, string>>({});

  // 柱状图/折线图分组维度选择：已选用于聚合的分组字段名 (undefined = 全部分组字段)
  const [groupSelection, setGroupSelection] = useState<Record<string, string[]>>({});
  const groupSelectionRef = useRef<Record<string, string[]>>({});
  // 分组选择 Popover 开关
  const [groupPickerOpen, setGroupPickerOpen] = useState<Record<string, boolean>>({});
  // 每个图表左上角「筛选」按钮 Popover 的展开状态
  const [chartFilterOpen, setChartFilterOpen] = useState<Record<string, boolean>>({});
  // 图表自身配置筛选（config.filterFields）的运行时取值：[chartId][字段名] = value
  const [chartFilterValues, setChartFilterValues] = useState<Record<string, Record<string, any>>>({});

  // 交叉表自定义表头：已确认的可见字段 (null = 全部可见)
  const [crossTableVisible, setCrossTableVisible] = useState<Record<string, { rowFields: string[]; colFields: string[]; measureFields: string[] } | null>>({});
  // Popover 开关
  const [fieldPickerOpen, setFieldPickerOpen] = useState<Record<string, boolean>>({});
  // Popover 内临时选中状态（未确认）
  const [fieldPickerTemp, setFieldPickerTemp] = useState<Record<string, { rowFields: Set<string>; colFields: Set<string>; measureFields: Set<string> }>>({});
  // 搜索关键词
  const [fieldPickerSearch, setFieldPickerSearch] = useState<Record<string, string>>({});

  const applyDashboardList = (items: Dashboard[], fromCache: boolean) => {
    setDashboards(items);
    if (items.length > 0 && !fromCache) {
      setSelectedDashboard(prev => {
        if (prev) return prev;
        if (urlId) return items.find(d => d.id === urlId) ?? items[0];
        return items[0];
      });
    }
  };

  const fetchDashboards = async () => {
    const cacheKey = 'dashboards';
    const cached = dashboardCache.get<Dashboard[]>(cacheKey);

    if (cached) {
      applyDashboardList(cached, false);
      void (async () => {
        try {
          const response = await axios.get('/api/dashboards');
          const items: Dashboard[] = response.data.items;
          dashboardCache.set(cacheKey, items);
          applyDashboardList(items, true);
        } catch { /* silent */ }
      })();
      return;
    }

    setLoading(true);
    try {
      const response = await axios.get('/api/dashboards');
      const items: Dashboard[] = response.data.items;
      dashboardCache.set(cacheKey, items);
      applyDashboardList(items, false);
    } catch (error) {
      console.error('获取看板列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboards();
  }, []);

  // 加载全量用户列表，构建 openId -> 头像 映射（用于展示创建人头像）
  useEffect(() => {
    fetchAllWorkUsers()
      .then(users => {
        const map: Record<string, string> = {};
        users.forEach(u => { if (u.avatar) map[u.openId] = u.avatar; });
        setUserAvatarMap(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!dashboards.length) return;
    setSelectedDashboard(prev => {
      if (!urlId) return prev;
      if (prev?.id === urlId) return prev;
      return dashboards.find(d => d.id === urlId) ?? prev;
    });
  }, [urlId, dashboards]);

  // URL 指定的看板不在有权限的列表中时，拉取详情以判断是否无权限，并在看板上覆盖蒙层提示
  useEffect(() => {
    if (loading || !urlId) { setNoPermission(null); return; }
    if (dashboards.some(d => d.id === urlId)) { setNoPermission(null); return; }
    let cancelled = false;
    (async () => {
      try {
        await axios.get(`/api/dashboards/${urlId}`);
        if (!cancelled) setNoPermission(null);
      } catch (error: any) {
        if (cancelled) return;
        if (error?.response?.status === 403) {
          setNoPermission(error.response.data?.name || '');
        } else {
          setNoPermission(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [urlId, dashboards, loading]);

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`/api/dashboards/${id}`);
      dashboardCache.invalidate('dashboards');
      fetchDashboards();
    } catch (error) {
      console.error('看板删除失败:', error);
    }
  };

  const fetchCharts = async () => {
    try {
      setCharts(await fetchChartOptions());
    } catch (error) {
      console.error('获取图表列表失败:', error);
    }
  };

  type FilterParam = { field: string; type: string; dataType: string; values: string[]; exclude?: boolean };
  interface ChartCacheEntry { data: unknown[]; config?: Record<string, unknown>; sql?: string; }

  const applyChartResponse = (chartId: string, data: unknown[], config: Record<string, unknown> | undefined, sql: string | undefined) => {
    setChartData(prev => ({ ...prev, [chartId]: data }));
    if (sql) setChartSQLs(prev => ({ ...prev, [chartId]: sql }));
    if (config) setChartConfigs(prev => ({ ...prev, [chartId]: config }));
  };

  const fetchChartData = async (chartId: string, filterParams?: FilterParam[], groupOverride?: string[]) => {
    const buildParams = () => {
      const params: Record<string, string> = {};
      if (filterParams && filterParams.length > 0) params.filters = JSON.stringify(filterParams);
      if (groupOverride) params.groupFields = JSON.stringify(groupOverride);
      return params;
    };
    const cacheKey = `chart:${chartId}:${JSON.stringify(filterParams ?? [])}:${groupOverride ? JSON.stringify(groupOverride) : 'all'}`;
    const cached = dashboardCache.get<ChartCacheEntry>(cacheKey);

    if (cached) {
      applyChartResponse(chartId, cached.data, cached.config, cached.sql);
      void (async () => {
        try {
          const response = await axios.get(`/api/charts/${chartId}/data`, { params: buildParams() });
          let config = response.data.chart?.config;
          if (typeof config === 'string') { try { config = JSON.parse(config); } catch { config = undefined; } }
          dashboardCache.set(cacheKey, { data: response.data.data, config, sql: response.data.sql });
          applyChartResponse(chartId, response.data.data, config, response.data.sql);
        } catch { /* silent */ }
      })();
      return;
    }

    try {
      const params = buildParams();
      const response = await axios.get(`/api/charts/${chartId}/data`, { params });
      let config = response.data.chart?.config;
      if (typeof config === 'string') { try { config = JSON.parse(config); } catch { config = undefined; } }
      dashboardCache.set(cacheKey, { data: response.data.data, config, sql: response.data.sql });
      applyChartResponse(chartId, response.data.data, config, response.data.sql);
    } catch (error) {
      console.error('获取图表数据失败:', error);
    }
  };

  const fetchFilterFieldOptions = async (datasetId: string, fieldName: string) => {
    const cacheKey = `${datasetId}:${fieldName}`;
    if (filterFieldOptions[cacheKey]) return;
    try {
      const response = await axios.get(`/api/datasets/${datasetId}/field-values`, {
        params: { field: fieldName }
      });
      setFilterFieldOptions(prev => ({ ...prev, [cacheKey]: response.data.values || [] }));
    } catch (error) {
      console.error('获取筛选字段值失败:', error);
    }
  };

  const fetchDatasetFieldType = async (datasetId: string, fieldName: string) => {
    const cacheKey = `${datasetId}:${fieldName}`;
    if (datasetFieldTypes[cacheKey]) return;
    try {
      const response = await axios.get(`/api/datasets/${datasetId}/fields`);
      const items: Array<{ id?: string; name: string; type?: string }> = response.data.items || [];
      items.forEach(item => {
        const key = `${datasetId}:${item.id || item.name}`;
        const dbType = (item.type || '').toUpperCase();
        const isNumber = ['INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT', 'FLOAT', 'DOUBLE', 'DECIMAL', 'NUMERIC', 'REAL'].some(t => dbType.includes(t));
        setDatasetFieldTypes(prev => ({ ...prev, [key]: isNumber ? 'number' : 'text' }));
      });
    } catch (error) {
      console.error('获取字段类型失败:', error);
    }
  };

  const buildFilterParamsForChart = (
    chartId: string,
    activeFilters: FilterField[] = filters,
    activeValues: Record<string, unknown> = filterValues,
  ): FilterParam[] => {
    const params: FilterParam[] = [];
    activeFilters.forEach(f => {
      if (f.charts.length > 0 && !f.charts.includes(chartId)) return;
      const val = activeValues[f.id];
      if (val === undefined || val === null) return;
      const dataType = datasetFieldTypes[`${f.dataset}:${f.field}`] || 'text';
      if (f.type === 'dateRange') {
        if (val && typeof val === 'object' && 'startType' in (val as object)) {
          const drv = val as DateRangeFilterValue;
          const [s, e] = resolveDateRangeValue(drv);
          params.push({ field: f.field, type: 'dateRange', dataType, values: [s.format('YYYY-MM-DD'), e.format('YYYY-MM-DD')] });
        } else if (Array.isArray(val) && val.length === 2 && val[0] && val[1]) {
          params.push({
            field: f.field,
            type: 'dateRange',
            dataType,
            values: [(val[0] as { format: (s: string) => string }).format('YYYY-MM-DD'), (val[1] as { format: (s: string) => string }).format('YYYY-MM-DD')]
          });
        }
      } else {
        const values = Array.isArray(val) ? val : (val !== '' ? [val] : []);
        if (values.length > 0) {
          params.push({ field: f.field, type: f.type, dataType, values: values.map(String), exclude: f.exclude });
        }
      }
    });
    return params;
  };

  // 从图表自身配置的筛选字段（config.filterFields）构建筛选参数
  const buildChartConfigFilterParams = (
    chartId: string,
    cfg: Record<string, unknown>,
    datasetId?: string,
    activeValues: Record<string, any> = chartFilterValues[chartId] || {},
  ): FilterParam[] => {
    const params: FilterParam[] = [];
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
  const applyChartConfigFilterChange = (chartId: string, cfg: Record<string, unknown>, datasetId: string | undefined, fieldName: string, value: any) => {
    setChartFilterValues(prev => {
      const nextForChart = { ...(prev[chartId] || {}), [fieldName]: value };
      const next = { ...prev, [chartId]: nextForChart };
      const combined = [...buildFilterParamsForChart(chartId), ...buildChartConfigFilterParams(chartId, cfg, datasetId, nextForChart)];
      loadSingleChart(chartId, combined.length > 0 ? combined : undefined);
      return next;
    });
  };

  // 打开图表筛选 Popover 时，加载各筛选字段的可选值与字段类型
  const prepareChartConfigFilters = (chartId: string, cfg: Record<string, unknown>, datasetId?: string) => {
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

  const loadSingleChart = async (chartId: string, filterParams?: FilterParam[]) => {
    setChartLoadingMap(prev => ({ ...prev, [chartId]: true }));
    await fetchChartData(chartId, filterParams, groupSelectionRef.current[chartId]);
    setChartLoadingMap(prev => ({ ...prev, [chartId]: false }));
  };

  const handleChartEnter = useCallback((chartId: string) => {
    visibleChartIds.current.add(chartId);
    if (!loadedChartIds.current.has(chartId)) {
      loadedChartIds.current.add(chartId);
      const fp = buildFilterParamsForChart(chartId, filtersRef.current, filterValuesRef.current);
      loadSingleChart(chartId, fp.length > 0 ? fp : undefined);
    }
  }, []);

  const handleChartExit = useCallback((chartId: string) => {
    visibleChartIds.current.delete(chartId);
  }, []);

  useEffect(() => {
    if (!selectedDashboard) {
      setParsedLayout([]);
      setFilters([]);
      setFilterValues({});
      loadedChartIds.current.clear();
      visibleChartIds.current.clear();
      return;
    }

    fetchCharts();
    loadedChartIds.current.clear();
    visibleChartIds.current.clear();
    setChartLoadingMap({});

    const layout = parseLayout(selectedDashboard.layout);
    setParsedLayout(layout);

    const savedFilters = parseFilters(selectedDashboard.filters);
    filtersRef.current = savedFilters;
    setFilters(savedFilters);

    const initialValues: Record<string, unknown> = {};
    savedFilters.forEach(f => {
      if (f.type === 'dateRange') {
        const dv = f.defaultValue as DateRangeFilterValue | undefined;
        initialValues[f.id] = dv?.startType ? dv : DEFAULT_DATE_RANGE_VALUE;
      } else {
        initialValues[f.id] = f.defaultValue;
      }
    });
    filterValuesRef.current = initialValues;
    setFilterValues(initialValues);

    savedFilters.forEach(f => {
      if (f.dataset && f.field) {
        if (f.type !== 'dateRange') fetchFilterFieldOptions(f.dataset, f.field);
        fetchDatasetFieldType(f.dataset, f.field);
      }
    });
  }, [selectedDashboard]);

  const refetchSingleChart = (chartId: string) => {
    const params = buildFilterParamsForChart(chartId);
    loadSingleChart(chartId, params.length > 0 ? params : undefined);
  };

  // 应用分组维度选择：更新选中状态并按新分组重新请求数据
  const applyGroupSelection = (chartId: string, selected: string[]) => {
    setGroupSelection(prev => ({ ...prev, [chartId]: selected }));
    groupSelectionRef.current = { ...groupSelectionRef.current, [chartId]: selected };
    setGroupPickerOpen(prev => ({ ...prev, [chartId]: false }));
    refetchSingleChart(chartId);
  };

  useEffect(() => {
    filterValuesRef.current = filterValues;
    if (filters.length === 0) return;
    const affectedChartIds = new Set<string>();
    parsedLayout.forEach(item => {
      const isAffected = filters.some(f => f.charts.length === 0 || f.charts.includes(item.chartId));
      if (isAffected) affectedChartIds.add(item.chartId);
    });
    affectedChartIds.forEach(chartId => loadedChartIds.current.delete(chartId));
    visibleChartIds.current.forEach(chartId => {
      if (affectedChartIds.has(chartId)) {
        loadedChartIds.current.add(chartId);
        loadSingleChart(chartId, buildFilterParamsForChart(chartId));
      }
    });
  }, [filterValues]);

  const chartsById = useMemo(() => {
    const map: Record<string, ChartOption> = {};
    charts.forEach(c => { map[c.id] = c; });
    return map;
  }, [charts]);

  const extractNames = (fields: Array<{ originalName: string }> | unknown) =>
    (Array.isArray(fields) ? fields : []).map((f: { originalName: string }) => f.originalName);

  const openFieldPicker = (chartId: string, cfg: Record<string, unknown>) => {
    const visible = crossTableVisible[chartId];
    const allRow = extractNames(cfg.rowFields);
    const allCol = extractNames(cfg.colFields);
    const allMeasure = extractNames(cfg.measureFields);
    setFieldPickerTemp(prev => ({
      ...prev,
      [chartId]: {
        rowFields: new Set(visible ? visible.rowFields : allRow),
        colFields: new Set(visible ? visible.colFields : allCol),
        measureFields: new Set(visible ? visible.measureFields : allMeasure),
      },
    }));
    setFieldPickerSearch(prev => ({ ...prev, [chartId]: '' }));
    setFieldPickerOpen(prev => ({ ...prev, [chartId]: true }));
  };

  const confirmFieldPicker = async (chartId: string, cfg: Record<string, unknown>, chartType: string) => {
    const temp = fieldPickerTemp[chartId];
    if (!temp) return;

    const selectedRow = [...temp.rowFields];
    const selectedCol = [...temp.colFields];
    const selectedMeasure = [...temp.measureFields];

    setCrossTableVisible(prev => ({
      ...prev,
      [chartId]: { rowFields: selectedRow, colFields: selectedCol, measureFields: selectedMeasure },
    }));
    setFieldPickerOpen(prev => ({ ...prev, [chartId]: false }));

    // 用选中字段过滤原始 fieldConfig，构造新 config 发请求重新聚合
    const filterFields = <T extends { originalName: string }>(arr: T[], names: string[]): T[] =>
      (Array.isArray(arr) ? arr : []).filter(f => names.includes(f.originalName));

    const newConfig = {
      ...cfg,
      rowFields: filterFields(cfg.rowFields as any[], selectedRow),
      colFields: filterFields(cfg.colFields as any[], selectedCol),
      measureFields: filterFields(cfg.measureFields as any[], selectedMeasure),
    };

    setChartLoadingMap(prev => ({ ...prev, [chartId]: true }));
    try {
      const resp = await axios.post(`/api/charts/${chartId}/preview`, {
        config: JSON.stringify(newConfig),
        type: chartType,
      });
      setChartData(prev => ({ ...prev, [chartId]: resp.data.data }));
    } catch (e) {
      console.error('重新加载交叉表数据失败', e);
    } finally {
      setChartLoadingMap(prev => ({ ...prev, [chartId]: false }));
    }
  };

  const renderFieldPicker = (chartId: string, cfg: Record<string, unknown>, labelMap: Record<string, string>, chartType: string, visibleOverride?: { rowFields: string[]; colFields: string[]; measureFields: string[] } | null) => {
    const allRow = extractNames(cfg.rowFields);
    const allCol = extractNames(cfg.colFields);
    const allMeasure = extractNames(cfg.measureFields);
    const temp = fieldPickerTemp[chartId] ?? {
      rowFields: new Set(visibleOverride ? visibleOverride.rowFields : allRow),
      colFields: new Set(visibleOverride ? visibleOverride.colFields : allCol),
      measureFields: new Set(visibleOverride ? visibleOverride.measureFields : allMeasure),
    };
    const search = (fieldPickerSearch[chartId] || '').toLowerCase();

    const filterBySearch = (names: string[]) =>
      search ? names.filter(n => (labelMap[n] || n).toLowerCase().includes(search)) : names;

    const visibleRow = filterBySearch(allRow);
    const visibleCol = filterBySearch(allCol);
    const visibleMeasure = filterBySearch(allMeasure);

    const allVisible = [...visibleRow, ...visibleCol, ...visibleMeasure];
    const allChecked = allVisible.every(n =>
      (visibleRow.includes(n) ? temp.rowFields : visibleCol.includes(n) ? temp.colFields : temp.measureFields).has(n)
    );
    const allIndeterminate = !allChecked && allVisible.some(n =>
      (visibleRow.includes(n) ? temp.rowFields : visibleCol.includes(n) ? temp.colFields : temp.measureFields).has(n)
    );

    const toggle = (set: 'rowFields' | 'colFields' | 'measureFields', name: string) => {
      setFieldPickerTemp(prev => {
        const cur = prev[chartId];
        if (!cur) return prev;
        const next = new Set(cur[set]);
        next.has(name) ? next.delete(name) : next.add(name);
        return { ...prev, [chartId]: { ...cur, [set]: next } };
      });
    };

    const toggleGroup = (set: 'rowFields' | 'colFields' | 'measureFields', names: string[], checked: boolean) => {
      setFieldPickerTemp(prev => {
        const cur = prev[chartId];
        if (!cur) return prev;
        const next = new Set(cur[set]);
        names.forEach(n => checked ? next.add(n) : next.delete(n));
        return { ...prev, [chartId]: { ...cur, [set]: next } };
      });
    };

    const toggleAll = (checked: boolean) => {
      setFieldPickerTemp(prev => {
        const cur = prev[chartId];
        if (!cur) return prev;
        return {
          ...prev,
          [chartId]: {
            rowFields: checked ? new Set([...cur.rowFields, ...visibleRow]) : new Set([...cur.rowFields].filter(n => !visibleRow.includes(n))),
            colFields: checked ? new Set([...cur.colFields, ...visibleCol]) : new Set([...cur.colFields].filter(n => !visibleCol.includes(n))),
            measureFields: checked ? new Set([...cur.measureFields, ...visibleMeasure]) : new Set([...cur.measureFields].filter(n => !visibleMeasure.includes(n))),
          },
        };
      });
    };

    const groups: { label: string; set: 'rowFields' | 'colFields' | 'measureFields'; names: string[] }[] = [
      { label: '行维度', set: 'rowFields', names: visibleRow },
      { label: '列维度', set: 'colFields', names: visibleCol },
      { label: '指标', set: 'measureFields', names: visibleMeasure },
    ];

    return (
      <div style={{ width: 240 }} onMouseDown={e => e.stopPropagation()}>
        {/* 搜索框 */}
        <div style={{ padding: '8px 12px 4px' }}>
          <input
            placeholder="搜索字段"
            value={fieldPickerSearch[chartId] || ''}
            onChange={e => setFieldPickerSearch(prev => ({ ...prev, [chartId]: e.target.value }))}
            style={{ width: '100%', padding: '4px 8px', border: '1px solid #d9d9d9', borderRadius: 4, fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        {/* 分组列表 */}
        <div style={{ maxHeight: 260, overflowY: 'auto', padding: '4px 0' }}>
          {groups.map(({ label, set, names }) => {
            if (names.length === 0 && search) return null;
            const checkedCount = names.filter(n => temp[set].has(n)).length;
            const groupChecked = names.length > 0 && checkedCount === names.length;
            const groupIndeterminate = checkedCount > 0 && !groupChecked;
            return (
              <div key={set}>
                {/* 分组标题 */}
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 12px', cursor: names.length > 0 ? 'pointer' : 'default' }}
                  onClick={() => names.length > 0 && toggleGroup(set, names, !groupChecked)}
                >
                  <input
                    type="checkbox"
                    checked={groupChecked}
                    ref={el => { if (el) el.indeterminate = groupIndeterminate; }}
                    onChange={e => toggleGroup(set, names, e.target.checked)}
                    onClick={e => e.stopPropagation()}
                    style={{ cursor: 'pointer', accentColor: '#1677ff' }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 500, color: '#262626' }}>
                    {label}({checkedCount}/{names.length})
                  </span>
                </div>
                {/* 字段列表 */}
                {names.map(name => (
                  <div
                    key={name}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 12px 3px 28px', cursor: 'pointer' }}
                    onClick={() => toggle(set, name)}
                  >
                    <input
                      type="checkbox"
                      checked={temp[set].has(name)}
                      onChange={() => toggle(set, name)}
                      onClick={e => e.stopPropagation()}
                      style={{ cursor: 'pointer', accentColor: '#1677ff' }}
                    />
                    <span style={{ fontSize: 13, color: '#595959', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {labelMap[name] || name}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        {/* 底部：全选 + 按钮 */}
        <div style={{ borderTop: '1px solid #f0f0f0', padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
            <input
              type="checkbox"
              checked={allChecked}
              ref={el => { if (el) el.indeterminate = allIndeterminate; }}
              onChange={e => toggleAll(e.target.checked)}
              style={{ cursor: 'pointer', accentColor: '#1677ff' }}
            />
            全选
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setFieldPickerOpen(prev => ({ ...prev, [chartId]: false }))}
              style={{ padding: '3px 12px', fontSize: 13, border: '1px solid #d9d9d9', borderRadius: 4, background: '#fff', cursor: 'pointer' }}
            >
              取消
            </button>
            <button
              onClick={() => confirmFieldPicker(chartId, cfg, chartType)}
              style={{ padding: '3px 12px', fontSize: 13, border: 'none', borderRadius: 4, background: '#1677ff', color: '#fff', cursor: 'pointer' }}
            >
              确定
            </button>
          </div>
        </div>
      </div>
    );
  };

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


  const buildFieldLabelMap = (cfg: Record<string, unknown>): Record<string, string> => {
    const map: Record<string, string> = {};
    const dimFields = [
      ...((cfg.rowFields as any[]) || []),
      ...((cfg.colFields as any[]) || []),
      ...((cfg.xAxisFields as any[]) || []),
      ...((cfg.groupFields as any[]) || []),
    ];
    dimFields.forEach((f: any) => {
      if (f.originalName) map[f.originalName] = f.displayName || f.originalName;
    });
    const measureLike = [
      ...((cfg.measureFields as any[]) || []),
      ...((cfg.yAxisFields as any[]) || []),
      ...((cfg.y2AxisFields as any[]) || []),
      ...((cfg.indicatorFields as any[]) || []),
    ];
    measureLike.forEach((f: any) => {
      if (f.originalName) {
        const chineseAgg = f.config?.aggregation || '计数';
        const englishAlias = chineseAggToAlias(chineseAgg);
        map[`${f.originalName}_${englishAlias}`] = f.displayName || f.originalName;
      }
    });
    return map;
  };

  const embed = isEmbedMode();

  return (
    <Layout style={{ height: embed ? '100vh' : 'calc(100vh - 64px)', overflow: 'hidden', position: 'relative' }}>
      {!embed && (
      <Sider
        width={240}
        collapsedWidth={0}
        collapsed={siderCollapsed}
        trigger={null}
        style={{ background: '#fff', borderRight: '1px solid #f0f0f0', transition: 'all 0.2s', overflow: 'hidden', height: '100%' }}
      >
        <DashboardList
          dashboards={dashboards}
          loading={loading}
          selectedDashboard={selectedDashboard}
          onSelectDashboard={(dashboard) => navigate(`/dashboards/${dashboard.id}`)}
          onAddDashboard={() => navigate('/dashboards/create')}
          onEditDashboard={(dashboard) => navigate(`/dashboards/edit/${dashboard.id}`)}
          onDeleteDashboard={handleDelete}
          onDashboardShared={(updated) =>
            setDashboards((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
          }
          collapsed={siderCollapsed}
          onCollapse={() => setSiderCollapsed(!siderCollapsed)}
        />
      </Sider>
      )}

      {!embed && siderCollapsed && (
        <Tooltip title="展开侧边栏" placement="right">
          <Button
            type="text"
            size="small"
            icon={<MenuUnfoldOutlined />}
            onClick={() => setSiderCollapsed(false)}
            style={{
              position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
              zIndex: 10, background: '#fff', border: '1px solid #f0f0f0', borderLeft: 'none',
              borderRadius: '0 4px 4px 0', width: 16, height: 48, padding: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '2px 0 6px rgba(0,0,0,0.08)', color: '#666',
            }}
          />
        </Tooltip>
      )}

      {/* 无权限蒙层：覆盖看板内容区，看不到具体数据，中间提示无权限 */}
      {noPermission !== null && (
        <div style={{
          position: 'absolute', top: 0, bottom: 0, right: 0,
          left: embed ? 0 : (siderCollapsed ? 0 : 240),
          background: 'rgba(240, 242, 245, 0.75)', backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)', zIndex: 100,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <LockOutlined style={{ fontSize: 44, color: '#bfbfbf', marginBottom: 16 }} />
          <div style={{ fontSize: 18, fontWeight: 600, color: '#595959', marginBottom: 6 }}>暂无访问权限</div>
          <div style={{ fontSize: 13, color: '#8c8c8c' }}>
            {noPermission ? `你没有「${noPermission}」看板的访问权限` : '你没有该看板的访问权限'}
          </div>
        </div>
      )}

      <Content style={{ background: '#f0f2f5', overflow: 'auto', padding: '12px 12px 12px' }}>
        {/* 标题栏 - sticky，负margin抵消Content两侧padding */}
        <div style={{ background: '#fff', border: '1px solid #ebebeb', padding: '0 12px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, borderRadius: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {selectedDashboard && <div style={{ width: 3, height: 16, background: '#4096ff', borderRadius: 2 }} />}
            <span style={{ fontSize: 16, fontWeight: 600, color: '#1f1f1f' }}>
              {selectedDashboard ? selectedDashboard.name : '看板'}
            </span>
            {selectedDashboard && (selectedDashboard.updatedByName || selectedDashboard.updatedBy) && (
              <span style={{ fontSize: 12, color: '#999' }}>
                修改人：{displayCreator(selectedDashboard.updatedByName, selectedDashboard.updatedBy)}
              </span>
            )}
          </div>
          {selectedDashboard && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {(selectedDashboard.createdByName || selectedDashboard.createdBy) && (
                <Tooltip title={`创建人：${displayCreator(selectedDashboard.createdByName, selectedDashboard.createdBy)}`}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 12, color: '#999' }}>创建人</span>
                    <Avatar
                      size="small"
                      src={selectedDashboard.createdBy ? userAvatarMap[selectedDashboard.createdBy] : undefined}
                      icon={<UserOutlined />}
                    >
                      {displayCreator(selectedDashboard.createdByName, selectedDashboard.createdBy)?.slice(0, 1)}
                    </Avatar>
                  </div>
                </Tooltip>
              )}
              {(() => {
                const sharedUsers = parseSharedWith(selectedDashboard.sharedWith);
                if (sharedUsers.length === 0) return null;
                return (
                  <Popover
                    trigger="click"
                    placement="bottomRight"
                    title={`已分享给 ${sharedUsers.length} 位用户`}
                    content={
                      <div style={{ maxHeight: 260, overflow: 'auto', minWidth: 180 }}>
                        {sharedUsers.map((u) => (
                          <div key={u.openId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                            <Avatar size="small" src={u.avatar} icon={<UserOutlined />}>
                              {u.name?.slice(0, 1)}
                            </Avatar>
                            <span style={{ fontSize: 13 }}>{u.name}</span>
                          </div>
                        ))}
                      </div>
                    }
                  >
                    <Avatar.Group max={{ count: 2 }} size="small" style={{ cursor: 'pointer' }}>
                      {sharedUsers.map((u) => (
                        <Avatar key={u.openId} src={u.avatar} icon={<UserOutlined />}>
                          {u.name?.slice(0, 1)}
                        </Avatar>
                      ))}
                    </Avatar.Group>
                  </Popover>
                );
              })()}
              {canModifyRecord(selectedDashboard.createdBy) && (
                <Button
                  type="primary"
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => navigate(`/dashboards/edit/${selectedDashboard.id}`)}
                >
                  编辑
                </Button>
              )}
            </div>
          )}
        </div>

        {/* 筛选器栏 */}
        {selectedDashboard && filters.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, padding: '10px 12px', marginBottom: 12, background: '#fff', borderRadius: 6, border: '1px solid #ebebeb' }}>
            {filters.map(filter => (
              <div key={filter.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                <span style={{ fontSize: 12, color: '#666' }}>{filter.name}</span>
                {filter.type === 'dateRange' ? (
                  <Popover
                    trigger="click"
                    placement="bottomRight"
                    open={!!datePickerOpen[filter.id]}
                    onOpenChange={open => setDatePickerOpen(prev => ({ ...prev, [filter.id]: open }))}
                    content={
                      <DateRangeFilterPicker
                        value={filterValues[filter.id] as DateRangeFilterValue | undefined}
                        onChange={(val) => {
                          setFilterValues(prev => ({ ...prev, [filter.id]: val }));
                          setDatePickerOpen(prev => ({ ...prev, [filter.id]: false }));
                        }}
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
                    {(filterFieldOptions[`${filter.dataset}:${filter.field}`] || []).map(val => (
                      <Select.Option key={String(val)} value={String(val)}>{String(val)}</Select.Option>
                    ))}
                  </Select>
                )}
              </div>
            ))}
          </div>
        )}

        {/* 图表网格 / 空态 */}
        {selectedDashboard ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            {parsedLayout.length > 0 ? parsedLayout.map((item, index) => {
              if (item.type === 'text') {
                return (
                  <div
                    key={item.chartId}
                    style={{ gridColumn: isWide(item) ? 'span 2' : 'span 1', minWidth: 0 }}
                  >
                    <Card
                      style={{ minWidth: 0, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}
                      styles={{ body: { padding: '12px 16px' } }}
                    >
                      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 14, lineHeight: 1.6, color: '#262626' }}>
                        {item.text || ''}
                      </div>
                    </Card>
                  </div>
                );
              }
              const chart = chartsById[item.chartId];
              const cfg = chartConfigs[item.chartId] || {};
              const isLarge = isWide(item);
              const chartH = chartAreaHeight(resolveH(item));
              const isLoading = chartLoadingMap[item.chartId] ?? false;
              const dataRows = chartData[item.chartId] as Record<string, unknown>[] | undefined;
              const hasData = dataRows !== undefined;
              const isEmpty = hasData && dataRows!.length === 0;
              const chartMenuItems = [
                { key: 'refresh', label: '刷新数据', onClick: () => refetchSingleChart(item.chartId) },
                { key: 'sql', label: '查看SQL', icon: <CodeOutlined />, onClick: () => { setCurrentSQLChartId(item.chartId); setSqlModalVisible(true); } },
                ...(canModifyRecord(selectedDashboard.createdBy)
                  ? [{ key: 'edit', label: '编辑图表', onClick: () => navigate(`/chart-config?chartId=${item.chartId}`) }]
                  : []),
                ...(hasData && !isEmpty ? [{
                  key: 'download',
                  label: '下载数据',
                  onClick: () => getChartRef(item.chartId).current?.downloadData(chart?.name || 'chart'),
                }] : []),
              ];
              const appliedFilters = filters.filter(f => f.charts.length === 0 || f.charts.includes(item.chartId));
              // 图表自身配置的筛选字段（图表配置里「筛选」区域拖入的字段）
              const chartConfigFilterFields = (Array.isArray(cfg.filterFields) ? cfg.filterFields : []) as Array<{ originalName: string; displayName?: string; config?: { filterType?: string } }>;
              const isCrossTable = chart?.type === 'crossTable';
              const labelMap = buildFieldLabelMap(cfg);
              const visibleFields = crossTableVisible[item.chartId];
              const allFieldCount = extractNames(cfg.rowFields).length + extractNames(cfg.colFields).length + extractNames(cfg.measureFields).length;
              const selectedFieldCount = visibleFields
                ? visibleFields.rowFields.length + visibleFields.colFields.length + visibleFields.measureFields.length
                : allFieldCount;
              // 柱状图/折线图：当存在多个分组维度时，允许用户在图表上选择用于聚合的分组维度
              const supportsGroupPicker = chart?.type === 'bar' || chart?.type === 'line';
              const groupFieldNames = extractNames(cfg.groupFields);
              const showGroupPicker = supportsGroupPicker && groupFieldNames.length > 1;
              const selectedGroups = groupSelection[item.chartId] ?? groupFieldNames;
              const cardTitle = (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                    <span style={{ fontWeight: 500, fontSize: 13, color: '#262626', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
                        <FilterOutlined style={{ fontSize: 12, color: '#1677ff', flexShrink: 0, cursor: 'default' }} />
                      </Tooltip>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
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
                          <div style={{ minWidth: 240, maxWidth: 320, padding: '4px 0' }} onClick={e => e.stopPropagation()}>
                            <div style={{ marginBottom: 8, fontWeight: 500, fontSize: 13 }}>筛选项</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              {chartConfigFilterFields.map(ff => {
                                const fType = ff.config?.filterType || 'multiple';
                                const curVal = chartFilterValues[item.chartId]?.[ff.originalName];
                                const dpKey = `cf:${item.chartId}:${ff.originalName}`;
                                return (
                                  <div key={ff.originalName} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                                    <span style={{ fontSize: 12, color: '#666' }}>{ff.displayName || ff.originalName}</span>
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
                                        {(filterFieldOptions[`${chart?.datasetId}:${ff.originalName}`] || []).map(val => (
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
                          style={{ fontSize: 12, color: '#595959', padding: '0 6px', display: 'flex', alignItems: 'center' }}
                          onClick={e => e.stopPropagation()}
                        >
                          筛选
                        </Button>
                      </Popover>
                    )}
                    {showGroupPicker && (
                      <Popover
                        open={!!groupPickerOpen[item.chartId]}
                        onOpenChange={open => setGroupPickerOpen(prev => ({ ...prev, [item.chartId]: open }))}
                        content={
                          <div style={{ minWidth: 160, padding: '4px 0' }} onClick={e => e.stopPropagation()}>
                            <Checkbox.Group
                              value={selectedGroups}
                              onChange={vals => applyGroupSelection(item.chartId, vals as string[])}
                              style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 12px' }}
                            >
                              {groupFieldNames.map(name => (
                                <Checkbox key={name} value={name}>{labelMap[name] || name}</Checkbox>
                              ))}
                            </Checkbox.Group>
                          </div>
                        }
                        trigger="click"
                        placement="bottomRight"
                        arrow={false}
                        overlayInnerStyle={{ padding: 0 }}
                        getPopupContainer={() => document.body}
                      >
                        <Button
                          size="small"
                          type="text"
                          style={{ fontSize: 12, color: '#595959', padding: '0 6px', display: 'flex', alignItems: 'center', gap: 4 }}
                          onClick={e => e.stopPropagation()}
                        >
                          分组({selectedGroups.length})
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ marginTop: 1 }}>
                            <path d="M2 3.5L5 6.5L8 3.5" stroke="#595959" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </Button>
                      </Popover>
                    )}
                    {isCrossTable && allFieldCount > 0 && (
                      <Popover
                        open={!!fieldPickerOpen[item.chartId]}
                        onOpenChange={open => {
                          if (open) openFieldPicker(item.chartId, cfg);
                          else setFieldPickerOpen(prev => ({ ...prev, [item.chartId]: false }));
                        }}
                        content={renderFieldPicker(item.chartId, cfg, labelMap, chart?.type ?? 'crossTable', visibleFields)}
                        trigger="click"
                        placement="bottomRight"
                        arrow={false}
                        overlayInnerStyle={{ padding: 0 }}
                        getPopupContainer={() => document.body}
                      >
                        <Button
                          size="small"
                          type="text"
                          style={{ fontSize: 12, color: '#595959', padding: '0 6px', display: 'flex', alignItems: 'center', gap: 4 }}
                          onClick={e => e.stopPropagation()}
                        >
                          已选字段({selectedFieldCount})
                          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ marginTop: 1 }}>
                            <path d="M2 3.5L5 6.5L8 3.5" stroke="#595959" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </Button>
                      </Popover>
                    )}
                    <Dropdown menu={{ items: chartMenuItems }} trigger={['click']} placement="bottomRight">
                      <Button type="text" size="small" icon={<EllipsisOutlined style={{ fontSize: 13, color: '#8c8c8c' }} />} onClick={e => e.stopPropagation()} />
                    </Dropdown>
                  </div>
                </div>
              );
              return (
                <LazyChartCard
                  key={item.chartId}
                  style={{ gridColumn: isLarge ? 'span 2' : 'span 1', minWidth: 0, overflow: 'hidden' }}
                  onEnter={() => handleChartEnter(item.chartId)}
                  onExit={() => handleChartExit(item.chartId)}
                >
                  <Card
                    title={cardTitle}
                    style={{ minWidth: 0, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', transition: 'box-shadow 0.2s' }}
                    styles={{ header: { padding: '10px 16px', minHeight: 44, borderBottom: 'none' }, body: { padding: '12px 16px', overflow: 'hidden' } }}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.12)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; }}
                  >
                    {isLoading && !hasData ? (
                      <Skeleton active paragraph={{ rows: 4 }} style={{ height: chartH }} />
                    ) : isEmpty ? (
                      <div style={{ height: chartH, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bfbfbf', fontSize: 13 }}>
                        <InboxOutlined style={{ fontSize: 24, marginRight: 8 }} />暂无数据
                      </div>
                    ) : hasData ? (
                      <ViewChartBody
                        chartRef={getChartRef(item.chartId)}
                        chartType={chart?.type ?? 'bar'}
                        data={dataRows!}
                        cfg={cfg}
                        chartH={chartH}
                        visibleFields={visibleFields}
                        groupFieldsOverride={showGroupPicker ? selectedGroups : undefined}
                      />
                    ) : (
                      <div style={{ height: chartH }} />
                    )}
                  </Card>
                </LazyChartCard>
              );
            }) : (
              <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 0', background: '#fff', borderRadius: 8 }}>
                <InboxOutlined style={{ fontSize: 40, color: '#d9d9d9', marginBottom: 12 }} />
                <div style={{ fontSize: 14, color: '#595959', marginBottom: 4 }}>暂无图表</div>
                <div style={{ fontSize: 12, color: '#bbb' }}>请编辑看板添加图表</div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
            <InboxOutlined style={{ fontSize: 48, color: '#d9d9d9', marginBottom: 16 }} />
            <div style={{ fontSize: 15, color: '#595959', marginBottom: 6 }}>请从左侧选择一个看板</div>
            <div style={{ fontSize: 13, color: '#bbb', marginBottom: 20 }}>或新建一个看板开始使用</div>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/dashboards/create')}>
              新建看板
            </Button>
          </div>
        )}
      </Content>

      <Modal
        title="查看SQL"
        open={sqlModalVisible}
        onCancel={() => setSqlModalVisible(false)}
        footer={null}
        width={700}
      >
        <pre style={{ background: '#f5f5f5', padding: 16, borderRadius: 4, overflow: 'auto', maxHeight: 400, whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 13 }}>
          {chartSQLs[currentSQLChartId] || '暂无SQL'}
        </pre>
      </Modal>
    </Layout>
  );
};

export default DashboardsPage;
