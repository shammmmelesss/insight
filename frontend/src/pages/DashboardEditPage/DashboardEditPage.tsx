import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Button, Input, Layout, Space, Card, Modal, message, Spin, Dropdown, Tooltip, Select, DatePicker } from 'antd';
import { ArrowLeftOutlined, SearchOutlined, EllipsisOutlined, CheckOutlined, CodeOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { DashboardLayoutItem, ChartOption, FilterField } from '@shared/api.interface';
import ChartRenderer from '../../components/ChartRenderer';
import FilterConfigModal from '../../components/FilterConfigModal/FilterConfigModal';

const { RangePicker } = DatePicker;
const { Sider, Content } = Layout;

const DashboardEditPage: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  
  const [charts, setCharts] = useState<ChartOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [selectedCharts, setSelectedCharts] = useState<DashboardLayoutItem[]>([]);
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

  // 跟踪已加载数据的图表ID，避免重复请求
  const loadedChartIds = useRef<Set<string>>(new Set());

  // 获取看板详情
  const fetchDashboardDetail = async () => {
    if (id) {
      try {
        const response = await axios.get(`/api/dashboards/${id}`);
        const dashboardData = response.data;
        setName(dashboardData.name);
        let layout: DashboardLayoutItem[] = [];
        if (typeof dashboardData.layout === 'string') {
          try {
            layout = JSON.parse(dashboardData.layout);
          } catch (e) {
            console.error('解析layout失败:', e);
            layout = [];
          }
        } else if (Array.isArray(dashboardData.layout)) {
          layout = dashboardData.layout;
        }
        setSelectedCharts(layout);

        // 加载已保存的筛选器配置
        let savedFilters: FilterField[] = [];
        if (typeof dashboardData.filters === 'string') {
          try {
            savedFilters = JSON.parse(dashboardData.filters);
          } catch (e) {
            console.error('解析filters失败:', e);
            savedFilters = [];
          }
        } else if (Array.isArray(dashboardData.filters)) {
          savedFilters = dashboardData.filters;
        }
        if (savedFilters.length > 0) {
          setFilters(savedFilters);
          const initialValues: Record<string, any> = {};
          savedFilters.forEach(f => {
            initialValues[f.id] = f.defaultValue;
          });
          setFilterValues(initialValues);
          savedFilters.forEach(f => {
            if (f.dataset && f.field) {
              if (f.type !== 'dateRange') {
                fetchFilterFieldOptions(f.dataset, f.field);
              }
              fetchDatasetFieldType(f.dataset, f.field);
            }
          });
        }
      } catch (error) {
        message.error('获取看板详情失败');
        console.error('获取看板详情失败:', error);
      }
    }
  };

  const fetchCharts = async () => {
    try {
      const response = await axios.get('/api/charts/select-list');
      setCharts(response.data.items);
    } catch (error) {
      message.error('获取图表列表失败');
      console.error('获取图表列表失败:', error);
    }
  };

  const fetchDatasets = async () => {
    try {
      const response = await axios.get('/api/datasets/select-list');
      setDatasets(response.data.items);
    } catch (error) {
      message.error('获取数据集列表失败');
      console.error('获取数据集列表失败:', error);
    }
  };

  // 获取图表数据（支持筛选条件）
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

  // 当选中的图表变化时，只获取新增图表的数据
  useEffect(() => {
    selectedCharts.forEach(item => {
      if (!loadedChartIds.current.has(item.chartId)) {
        loadedChartIds.current.add(item.chartId);
        fetchChartData(item.chartId);
      }
    });
    // 清理已移除图表的缓存
    const currentIds = new Set(selectedCharts.map(item => item.chartId));
    loadedChartIds.current.forEach(cid => {
      if (!currentIds.has(cid)) {
        loadedChartIds.current.delete(cid);
      }
    });
  }, [selectedCharts, fetchChartData]);

  const filteredCharts = charts.filter(chart =>
    chart.name.toLowerCase().includes(searchKeyword.toLowerCase())
  );

  const isChartAdded = (chartId: string) => {
    return selectedCharts.some(item => item.chartId === chartId);
  };

  const handleAddChart = (chartId: string) => {
    if (isChartAdded(chartId)) {
      message.info('该图表已添加至看板');
      return;
    }
    const newItem: DashboardLayoutItem = {
      chartId,
      x: 0,
      y: selectedCharts.length,
      width: 4,
      height: 4
    };
    setSelectedCharts([...selectedCharts, newItem]);
  };

  const handleRemoveChart = (chartId: string) => {
    setSelectedCharts(selectedCharts.filter(item => item.chartId !== chartId));
  };

  const handleBack = () => navigate('/dashboards');

  const handleCancel = () => setIsCancelModalVisible(true);

  const handleConfirmCancel = () => {
    setIsCancelModalVisible(false);
    navigate('/dashboards');
  };

  // 保存 — 创建时一次请求搞定（后端已支持 layout 字段）
  const handleSave = async () => {
    if (!name.trim()) {
      message.error('请输入看板名称');
      return;
    }

    try {
      const payload = {
        name,
        layout: JSON.stringify(selectedCharts),
        filters: JSON.stringify(filters)
      };

      if (id) {
        await axios.put(`/api/dashboards/${id}`, payload);
        message.success('看板更新成功');
      } else {
        await axios.post('/api/dashboards', payload);
        message.success('看板创建成功');
      }
      navigate('/dashboards');
    } catch (error) {
      message.error('保存失败，请重试');
      console.error('保存失败:', error);
    }
  };

  const handleChartSizeChange = (chartId: string, size: 'medium' | 'large') => {
    setSelectedCharts(prev => prev.map(item =>
      item.chartId === chartId ? { ...item, width: size === 'large' ? 8 : 4 } : item
    ));
  };

  const handleOpenFilterModal = () => setIsFilterModalVisible(true);
  const handleCloseFilterModal = () => setIsFilterModalVisible(false);

  const handleSaveFilterConfig = (newFilters: FilterField[]) => {
    setFilters(newFilters);
    const initialValues: Record<string, any> = {};
    newFilters.forEach(f => {
      initialValues[f.id] = f.defaultValue;
    });
    setFilterValues(initialValues);
    newFilters.forEach(f => {
      if (f.dataset && f.field) {
        if (f.type !== 'dateRange') {
          fetchFilterFieldOptions(f.dataset, f.field);
        }
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
        setDatasetFieldTypes(prev => ({ ...prev, [key]: isNumber ? 'number' : 'text' }));
      });
    } catch (error) {
      console.error('获取字段类型失败:', error);
    }
  };

  const buildFilterParamsForChart = (chartId: string): Array<{ field: string; type: string; dataType: string; values: string[] }> => {
    const params: Array<{ field: string; type: string; dataType: string; values: string[] }> = [];
    filters.forEach(f => {
      if (!f.charts.includes(chartId)) return;
      const val = filterValues[f.id];
      if (val === undefined || val === null) return;
      const dataType = datasetFieldTypes[`${f.dataset}:${f.field}`] || 'text';
      if (f.type === 'dateRange') {
        if (Array.isArray(val) && val.length === 2 && val[0] && val[1]) {
          params.push({
            field: f.field,
            type: 'dateRange',
            dataType,
            values: [val[0].format('YYYY-MM-DD'), val[1].format('YYYY-MM-DD')]
          });
        }
      } else {
        const values = Array.isArray(val) ? val : (val !== undefined && val !== null && val !== '' ? [val] : []);
        if (values.length > 0) {
          params.push({ field: f.field, type: f.type, dataType, values: values.map(String) });
        }
      }
    });
    return params;
  };

  // 筛选器值变化时重新获取受影响图表的数据
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
      const response = await axios.get(`/api/datasets/${datasetId}/field-values`, {
        params: { field: fieldName }
      });
      setFilterFieldOptions(prev => ({
        ...prev,
        [cacheKey]: response.data.values || []
      }));
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
    <div style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column' }}>
      {/* 顶部操作栏 */}
      <div style={{ padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={handleBack}
            style={{ marginRight: 16 }}
          >
            返回
          </Button>
          <Input
            placeholder="看板名称编辑"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: '300px' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <Button type="default" onClick={handleOpenFilterModal}>
            筛选器
          </Button>
        </div>
        <Space>
          <Button onClick={handleCancel}>取消</Button>
          <Button type="primary" onClick={handleSave}>保存</Button>
        </Space>
      </div>

      {/* 主内容区域 */}
      <Layout style={{ flex: 1, overflow: 'hidden' }}>
        <Content style={{ padding: '10px', background: '#f0f2f5', overflow: 'auto' }}>
          {/* 筛选器展示区域 */}
          {filters.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, padding: '12px 16px', marginBottom: 10, background: '#fff', borderRadius: 4, border: '1px solid #f0f0f0' }}>
              {filters.map(filter => (
                <div key={filter.id} style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 'calc(100% / 6 - 14px)' }}>
                  <span style={{ fontSize: 12, color: '#666' }}>{filter.name}</span>
                  {filter.type === 'dateRange' ? (
                    <RangePicker
                      size="small"
                      style={{ width: '100%', height: 32 }}
                      value={filterValues[filter.id]}
                      onChange={(dates) => setFilterValues(prev => ({ ...prev, [filter.id]: dates }))}
                    />
                  ) : (
                    <Select
                      size="small"
                      style={{ width: '100%', height: 32 }}
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
            {selectedCharts.length > 0 ? (
              selectedCharts.map((item, index) => {
                const chart = charts.find(c => c.id === item.chartId);
                const cfg = chartConfigs[item.chartId] || {};
                const extractNames = (fields: any[]) => (fields || []).map((f: any) => f.originalName);
                const currentSize = item.width >= 8 ? 'large' : 'medium';
                const isLarge = currentSize === 'large';
                const sizeMenuItems = [
                  {
                    key: 'viewSQL',
                    label: '查看SQL',
                    icon: <CodeOutlined />,
                    onClick: () => {
                      setCurrentSQL(chartSQLs[item.chartId] || '暂无SQL');
                      setSqlModalVisible(true);
                    },
                  },
                  { type: 'divider' as const },
                  {
                    key: 'medium',
                    label: (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        中图{currentSize === 'medium' && <CheckOutlined style={{ color: '#1677ff' }} />}
                      </span>
                    ),
                    onClick: () => handleChartSizeChange(item.chartId, 'medium'),
                  },
                  {
                    key: 'large',
                    label: (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        大图{currentSize === 'large' && <CheckOutlined style={{ color: '#1677ff' }} />}
                      </span>
                    ),
                    onClick: () => handleChartSizeChange(item.chartId, 'large'),
                  },
                ];
                return (
                  <div key={item.chartId} style={{ marginBottom: '10px', gridColumn: isLarge ? 'span 2' : 'span 1', minWidth: 0 }}>
                    <Card
                      title={chart?.name || `图表${index + 1}`}
                      style={{ boxShadow: 'none' }}
                      styles={{ header: { height: '40px', padding: '0 24px', display: 'flex', alignItems: 'center' }, body: { padding: '10px', overflow: 'hidden' } }}
                      extra={
                        <Dropdown menu={{ items: sizeMenuItems }} trigger={['hover']}>
                          <Tooltip title="更多">
                            <Button type="text" icon={<EllipsisOutlined />} size="small" />
                          </Tooltip>
                        </Dropdown>
                      }
                    >
                      <div style={{ width: '100%' }}>
                        <ChartRenderer
                          chartType={chart?.type as any || 'bar'}
                          chartData={chartData[item.chartId] || []}
                          rowFields={extractNames(cfg.rowFields)}
                          colFields={extractNames(cfg.colFields)}
                          measureFields={extractNames(cfg.measureFields)}
                          xAxisFields={extractNames(cfg.xAxisFields)}
                          yAxisFields={extractNames(cfg.yAxisFields)}
                          groupFields={extractNames(cfg.groupFields)}
                          indicatorFields={extractNames(cfg.indicatorFields)}
                        />
                      </div>
                    </Card>
                  </div>
                );
              })
            ) : (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px 0', backgroundColor: '#fafafa', borderRadius: '8px' }}>
                <div style={{ fontSize: '16px', color: '#666', marginBottom: 16 }}>暂无图表</div>
                <div style={{ fontSize: '14px', color: '#999' }}>请从右侧选择图表添加到看板</div>
              </div>
            )}
          </div>
        </Content>

        {/* 图表选择区域 */}
        <Sider width={300} style={{ background: '#fff', borderLeft: '1px solid #f0f0f0' }}>
          <div style={{ padding: '20px' }}>
            <div style={{ marginBottom: 16 }}>
              <Input
                placeholder="搜索图表名称"
                prefix={<SearchOutlined />}
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                style={{ width: '100%' }}
              />
            </div>
          </div>
          <div style={{ padding: '16px' }}>
            {filteredCharts.length > 0 ? (
              <div>
                {filteredCharts.map((chart) => (
                  <div key={chart.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, padding: '8px 12px', borderRadius: '4px', backgroundColor: '#fafafa' }}>
                    <div>{chart.name}</div>
                    {isChartAdded(chart.id) ? (
                      <Button type="text" danger size="small" onClick={() => handleRemoveChart(chart.id)}>
                        移除
                      </Button>
                    ) : (
                      <Button type="text" size="small" onClick={() => handleAddChart(chart.id)}>
                        添加
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
                没有找到匹配的图表
              </div>
            )}
          </div>
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
