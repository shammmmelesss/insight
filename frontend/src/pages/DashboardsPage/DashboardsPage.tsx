import React, { useEffect, useState } from 'react';
import { Button, Card, Modal, Layout, Skeleton, Select, DatePicker, Tooltip, Dropdown } from 'antd';
import { EditOutlined, MenuUnfoldOutlined, EllipsisOutlined, CodeOutlined, InboxOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Dashboard, ChartOption, FilterField, DashboardLayoutItem } from '@shared/api.interface';
import DashboardList from '../../components/DashboardList/DashboardList';
import ChartRenderer from '../../components/ChartRenderer';

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

const { RangePicker } = DatePicker;
const { Sider, Content } = Layout;

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

const DashboardsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDashboard, setSelectedDashboard] = useState<Dashboard | null>(null);
  const [charts, setCharts] = useState<ChartOption[]>([]);
  const [chartData, setChartData] = useState<Record<string, unknown[]>>({});
  const [chartConfigs, setChartConfigs] = useState<Record<string, Record<string, unknown>>>({});
  const [chartLoading, setChartLoading] = useState(false);
  const [filters, setFilters] = useState<FilterField[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, unknown>>({});
  const [filterFieldOptions, setFilterFieldOptions] = useState<Record<string, unknown[]>>({});
  const [datasetFieldTypes, setDatasetFieldTypes] = useState<Record<string, string>>({});
  const [siderCollapsed, setSiderCollapsed] = useState(false);
  const [parsedLayout, setParsedLayout] = useState<DashboardLayoutItem[]>([]);
  const [chartSQLs, setChartSQLs] = useState<Record<string, string>>({});
  const [sqlModalVisible, setSqlModalVisible] = useState(false);
  const [currentSQLChartId, setCurrentSQLChartId] = useState('');

  const fetchDashboards = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/dashboards');
      const items: Dashboard[] = response.data.items;
      setDashboards(items);
      if (items.length > 0) {
        const selectedId = searchParams.get('selected');
        setSelectedDashboard(prev => {
          if (prev) return prev;
          if (selectedId) return items.find(d => d.id === selectedId) ?? items[0];
          return items[0];
        });
      }
    } catch (error) {
      console.error('获取看板列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboards();
  }, []);

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`/api/dashboards/${id}`);
      fetchDashboards();
    } catch (error) {
      console.error('看板删除失败:', error);
    }
  };

  const fetchCharts = async () => {
    try {
      const response = await axios.get('/api/charts/select-list');
      setCharts(response.data.items);
    } catch (error) {
      console.error('获取图表列表失败:', error);
    }
  };

  type FilterParam = { field: string; type: string; dataType: string; values: string[] };

  const fetchChartData = async (chartId: string, filterParams?: FilterParam[]) => {
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
          try { config = JSON.parse(config); } catch { config = {}; }
        }
        setChartConfigs(prev => ({ ...prev, [chartId]: config }));
      }
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
      if (!f.charts.includes(chartId)) return;
      const val = activeValues[f.id];
      if (val === undefined || val === null) return;
      const dataType = datasetFieldTypes[`${f.dataset}:${f.field}`] || 'text';
      if (f.type === 'dateRange') {
        if (Array.isArray(val) && val.length === 2 && val[0] && val[1]) {
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
          params.push({ field: f.field, type: f.type, dataType, values: values.map(String) });
        }
      }
    });
    return params;
  };

  useEffect(() => {
    if (!selectedDashboard) {
      setParsedLayout([]);
      setFilters([]);
      setFilterValues({});
      return;
    }

    fetchCharts();
    setChartLoading(true);

    const layout = parseLayout(selectedDashboard.layout);
    setParsedLayout(layout);

    const savedFilters = parseFilters(selectedDashboard.filters);
    setFilters(savedFilters);

    const initialValues: Record<string, unknown> = {};
    savedFilters.forEach(f => { initialValues[f.id] = f.defaultValue; });
    setFilterValues(initialValues);

    savedFilters.forEach(f => {
      if (f.dataset && f.field) {
        if (f.type !== 'dateRange') fetchFilterFieldOptions(f.dataset, f.field);
        fetchDatasetFieldType(f.dataset, f.field);
      }
    });

    Promise.all(layout.map(item => {
      const fp = buildFilterParamsForChart(item.chartId, savedFilters, initialValues);
      return fetchChartData(item.chartId, fp.length > 0 ? fp : undefined);
    })).finally(() => {
      setChartLoading(false);
    });
  }, [selectedDashboard]);

  const refetchSingleChart = (chartId: string) => {
    const params = buildFilterParamsForChart(chartId);
    fetchChartData(chartId, params.length > 0 ? params : undefined);
  };

  useEffect(() => {
    if (filters.length === 0) return;
    const affectedChartIds = new Set<string>();
    filters.forEach(f => f.charts.forEach(cid => affectedChartIds.add(cid)));
    affectedChartIds.forEach(chartId => {
      fetchChartData(chartId, buildFilterParamsForChart(chartId));
    });
  }, [filterValues]);

  const extractNames = (fields: Array<{ originalName: string }> | unknown) =>
    (Array.isArray(fields) ? fields : []).map((f: { originalName: string }) => f.originalName);

  return (
    <Layout style={{ height: 'calc(100vh - 64px)', overflow: 'hidden', position: 'relative' }}>
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
          onSelectDashboard={setSelectedDashboard}
          onAddDashboard={() => navigate('/dashboards/create')}
          onEditDashboard={(dashboard) => navigate(`/dashboards/edit/${dashboard.id}`)}
          onDeleteDashboard={handleDelete}
          collapsed={siderCollapsed}
          onCollapse={() => setSiderCollapsed(!siderCollapsed)}
        />
      </Sider>

      {siderCollapsed && (
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

      <Content style={{ background: '#f0f2f5', overflow: 'auto', padding: '12px 12px 12px' }}>
        {/* 标题栏 - sticky，负margin抵消Content两侧padding */}
        <div style={{ background: '#fff', border: '1px solid #ebebeb', padding: '0 12px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, borderRadius: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {selectedDashboard && <div style={{ width: 3, height: 16, background: '#4096ff', borderRadius: 2 }} />}
            <span style={{ fontSize: 16, fontWeight: 600, color: '#1f1f1f' }}>
              {selectedDashboard ? selectedDashboard.name : '看板'}
            </span>
          </div>
          {selectedDashboard && (
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

        {/* 筛选器栏 */}
        {selectedDashboard && filters.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, padding: '10px 12px', marginBottom: 12, background: '#fff', borderRadius: 6, border: '1px solid #ebebeb' }}>
            {filters.map(filter => (
              <div key={filter.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                <span style={{ fontSize: 12, color: '#666' }}>{filter.name}</span>
                {filter.type === 'dateRange' ? (
                  <RangePicker
                    size="small"
                    style={{ width: '100%' }}
                    value={filterValues[filter.id] as Parameters<typeof RangePicker>[0]['value']}
                    onChange={(dates) => setFilterValues(prev => ({ ...prev, [filter.id]: dates }))}
                  />
                ) : (
                  <Select
                    size="small"
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
              const chart = charts.find(c => c.id === item.chartId);
              const cfg = chartConfigs[item.chartId] || {};
              const isLarge = isWide(item);
              const chartH = chartAreaHeight(resolveH(item));
              const chartMenuItems = [
                { key: 'refresh', label: '刷新数据', onClick: () => refetchSingleChart(item.chartId) },
                { key: 'sql', label: '查看SQL', icon: <CodeOutlined />, onClick: () => { setCurrentSQLChartId(item.chartId); setSqlModalVisible(true); } },
                { key: 'edit', label: '编辑图表', onClick: () => navigate(`/chart-config?chartId=${item.chartId}`) },
              ];
              const cardTitle = (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 500, fontSize: 13, color: '#262626' }}>{chart?.name || `图表${index + 1}`}</span>
                  <Dropdown menu={{ items: chartMenuItems }} trigger={['click']} placement="bottomRight">
                    <Button type="text" size="small" icon={<EllipsisOutlined style={{ fontSize: 13, color: '#8c8c8c' }} />} onClick={e => e.stopPropagation()} />
                  </Dropdown>
                </div>
              );
              return (
                <Card
                  key={item.chartId}
                  title={cardTitle}
                  style={{ gridColumn: isLarge ? 'span 2' : 'span 1', minWidth: 0, borderRadius: 8, boxShadow: '0 2px 8px rgba(0,0,0,0.08)', transition: 'box-shadow 0.2s, transform 0.2s' }}
                  styles={{ header: { padding: '10px 16px', minHeight: 44, borderBottom: 'none' }, body: { padding: '12px 16px', overflow: 'hidden' } }}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 4px 16px rgba(0,0,0,0.12)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-1px)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; }}
                >
                  {chartLoading ? (
                    <Skeleton active paragraph={{ rows: 4 }} />
                  ) : (
                    <ChartRenderer
                      chartType={chart?.type ?? 'bar'}
                      chartData={chartData[item.chartId] as Record<string, unknown>[] || []}
                      rowFields={extractNames(cfg.rowFields)}
                      colFields={extractNames(cfg.colFields)}
                      measureFields={extractNames(cfg.measureFields)}
                      xAxisFields={extractNames(cfg.xAxisFields)}
                      yAxisFields={extractNames(cfg.yAxisFields)}
                      groupFields={extractNames(cfg.groupFields)}
                      indicatorFields={extractNames(cfg.indicatorFields)}
                      containerHeight={chartH}
                    />
                  )}
                </Card>
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
