import React, { useEffect, useState, useCallback } from 'react';
import { Button, Card, Modal, Form, Input, message, Layout, Space, Divider, Spin, Select, DatePicker, Tooltip, Dropdown } from 'antd';
import { PlusOutlined, EditOutlined, ShareAltOutlined, SettingOutlined, MenuFoldOutlined, MenuUnfoldOutlined, EllipsisOutlined, CodeOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Dashboard, CreateDashboardRequest, UpdateDashboardRequest, ChartOption, FilterField } from '@shared/api.interface';
import DashboardList from '../../components/DashboardList/DashboardList';
import ChartRenderer from '../../components/ChartRenderer';

const { RangePicker } = DatePicker;
const { Sider, Content } = Layout;


const DashboardsPage: React.FC = () => {
  const navigate = useNavigate();
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedDashboard, setSelectedDashboard] = useState<Dashboard | null>(null);
  const [charts, setCharts] = useState<ChartOption[]>([]);
  const [chartData, setChartData] = useState<Record<string, any[]>>({});
  const [chartConfigs, setChartConfigs] = useState<Record<string, any>>({});
  const [chartLoading, setChartLoading] = useState(false);
  const [filters, setFilters] = useState<FilterField[]>([]);
  const [filterValues, setFilterValues] = useState<Record<string, any>>({});
  const [filterFieldOptions, setFilterFieldOptions] = useState<Record<string, any[]>>({});
  const [datasetFieldTypes, setDatasetFieldTypes] = useState<Record<string, string>>({});
  const [siderCollapsed, setSiderCollapsed] = useState(false);
  const [chartSQLs, setChartSQLs] = useState<Record<string, string>>({});
  const [sqlModalVisible, setSqlModalVisible] = useState(false);
  const [currentSQL, setCurrentSQL] = useState('');

  // 获取看板列表
  const fetchDashboards = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/dashboards');
      setDashboards(response.data.items);
    } catch (error) {
      message.error('获取看板列表失败');
      console.error('获取看板列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboards();
  }, []);

  // 打开模态框
  const showModal = (record?: Dashboard) => {
    if (record) {
      // 编辑模式
      setEditingId(record.id);
      form.setFieldsValue({
        name: record.name,
        layout: JSON.stringify(record.layout, null, 2),
      });
    } else {
      // 新增模式
      setEditingId(null);
      form.resetFields();
    }
    setIsModalVisible(true);
  };

  // 关闭模态框
  const handleCancel = () => {
    setIsModalVisible(false);
  };

  // 提交表单
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      
      if (editingId) {
        // 编辑模式：需要解析layout
        let layout = [];
        try {
          layout = JSON.parse(values.layout);
        } catch (e) {
          message.error('layout 格式错误，请输入有效的 JSON');
          return;
        }
        
        // 更新看板
        const updateData: UpdateDashboardRequest = {
          name: values.name,
          layout: layout,
        };
        await axios.put(`/api/dashboards/${editingId}`, updateData);
        message.success('看板更新成功');
      } else {
        // 创建模式：使用默认空数组作为layout，不需要解析
        const createData: CreateDashboardRequest = {
          name: values.name,
        };
        await axios.post('/api/dashboards', createData);
        message.success('看板创建成功');
      }
      
      setIsModalVisible(false);
      fetchDashboards();
    } catch (error) {
      message.error('操作失败，请检查输入');
      console.error('操作失败:', error);
    }
  };

  // 删除看板
  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`/api/dashboards/${id}`);
      message.success('看板删除成功');
      fetchDashboards();
    } catch (error) {
      message.error('看板删除失败');
      console.error('看板删除失败:', error);
    }
  };

  // 获取图表列表
  const fetchCharts = async () => {
    try {
      const response = await axios.get('/api/charts/select-list');
      setCharts(response.data.items);
    } catch (error) {
      message.error('获取图表列表失败');
      console.error('获取图表列表失败:', error);
    }
  };

  // 获取图表数据
  const fetchChartData = async (chartId: string, filterParams?: Array<{ field: string; type: string; dataType: string; values: string[] }>) => {
    try {
      const params: Record<string, string> = {};
      if (filterParams && filterParams.length > 0) {
        params.filters = JSON.stringify(filterParams);
      }
      const response = await axios.get(`/api/charts/${chartId}/data`, { params });
      setChartData(prev => ({
        ...prev,
        [chartId]: response.data.data
      }));
      if (response.data.sql) {
        setChartSQLs(prev => ({ ...prev, [chartId]: response.data.sql }));
      }
      // 保存图表配置
      if (response.data.chart?.config) {
        let config = response.data.chart.config;
        if (typeof config === 'string') {
          try { config = JSON.parse(config); } catch (e) { config = {}; }
        }
        setChartConfigs(prev => ({
          ...prev,
          [chartId]: config
        }));
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
      setFilterFieldOptions(prev => ({
        ...prev,
        [cacheKey]: response.data.values || []
      }));
    } catch (error) {
      console.error('获取筛选字段值失败:', error);
    }
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

  // 当选择看板变化时，获取图表数据
  useEffect(() => {
    if (selectedDashboard) {
      fetchCharts();
      setChartLoading(true);
      
      // 解析layout字段
      let layout = [];
      if (typeof selectedDashboard.layout === 'string') {
        try {
          layout = JSON.parse(selectedDashboard.layout);
        } catch (e) {
          console.error('解析layout失败:', e);
          layout = [];
        }
      } else if (Array.isArray(selectedDashboard.layout)) {
        layout = selectedDashboard.layout;
      }

      // 解析filters字段
      let savedFilters: FilterField[] = [];
      if (typeof (selectedDashboard as any).filters === 'string') {
        try {
          savedFilters = JSON.parse((selectedDashboard as any).filters);
        } catch (e) {
          console.error('解析filters失败:', e);
          savedFilters = [];
        }
      } else if (Array.isArray(selectedDashboard.filters)) {
        savedFilters = selectedDashboard.filters;
      }
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
      
      // 获取每个图表的数据
      Promise.all(
        layout.map(item => fetchChartData(item.chartId))
      ).finally(() => {
        setChartLoading(false);
      });
    } else {
      setFilters([]);
      setFilterValues({});
    }
  }, [selectedDashboard]);

  const refetchSingleChart = (chartId: string) => {
    const params = buildFilterParamsForChart(chartId);
    fetchChartData(chartId, params.length > 0 ? params : undefined);
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



  return (
    <Layout style={{ minHeight: 'calc(100vh - 64px)', position: 'relative' }}>
      {/* 左侧：看板目录 */}
      <Sider
        width={280}
        collapsedWidth={0}
        collapsed={siderCollapsed}
        trigger={null}
        style={{ background: '#fff', boxShadow: '2px 0 8px rgba(0, 0, 0, 0.06)', borderRight: '1px solid #f0f0f0', position: 'relative', transition: 'all 0.2s' }}
      >
        <DashboardList
          dashboards={dashboards}
          loading={loading}
          selectedDashboard={selectedDashboard}
          onSelectDashboard={setSelectedDashboard}
          onAddDashboard={() => navigate('/dashboards/create')}
          onEditDashboard={(dashboard) => navigate(`/dashboards/edit/${dashboard.id}`)}
          onDeleteDashboard={handleDelete}
        />
        {/* 收起按钮 */}
        <Tooltip title={siderCollapsed ? '展开' : '收起'} placement="right">
          <Button
            type="text"
            size="small"
            icon={siderCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setSiderCollapsed(!siderCollapsed)}
            style={{
              position: 'absolute',
              bottom: 16,
              right: 8,
              color: '#999',
              fontSize: 14,
            }}
          />
        </Tooltip>
      </Sider>
      {/* 侧边栏收起时的展开入口 */}
      {siderCollapsed && (
        <Tooltip title="展开侧边栏" placement="right">
          <Button
            type="text"
            size="small"
            icon={<MenuUnfoldOutlined />}
            onClick={() => setSiderCollapsed(false)}
            style={{
              position: 'absolute',
              left: 0,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 10,
              background: '#fff',
              border: '1px solid #f0f0f0',
              borderLeft: 'none',
              borderRadius: '0 4px 4px 0',
              width: 16,
              height: 48,
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '2px 0 6px rgba(0,0,0,0.08)',
              color: '#666',
            }}
          />
        </Tooltip>
      )}
      
      {/* 右侧：看板展示区域 */}
      <Content style={{ padding: '10px', background: '#f0f2f5', overflow: 'auto' }}>
        <Card style={{ borderRadius: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ margin: 0 }}>
              {selectedDashboard ? selectedDashboard.name : '请选择看板'}
            </h2>
            {selectedDashboard && (
              <Space>
                <Button
                  type="text"
                  icon={<ShareAltOutlined />}
                  onClick={() => message.info('分享功能开发中')}
                >
                  分享
                </Button>
                <Button
                  type="text"
                  icon={<SettingOutlined />}
                  onClick={() => message.info('设置功能开发中')}
                >
                  设置
                </Button>
                <Button
                  type="primary"
                  icon={<EditOutlined />}
                  onClick={() => navigate(`/dashboards/edit/${selectedDashboard?.id}`)}
                >
                  编辑
                </Button>
              </Space>
            )}
          </div>
          
          {selectedDashboard ? (
            <div style={{ padding: '10px' }}>
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
              {chartLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '400px' }}>
                  <Spin size="large" />
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                  {(() => {
                    // 解析layout字段
                    let layout = [];
                    if (typeof selectedDashboard.layout === 'string') {
                      try {
                        layout = JSON.parse(selectedDashboard.layout);
                      } catch (e) {
                        console.error('解析layout失败:', e);
                        layout = [];
                      }
                    } else if (Array.isArray(selectedDashboard.layout)) {
                      layout = selectedDashboard.layout;
                    }
                    
                    if (layout.length > 0) {
                      return layout.map((item, index) => {
                        const chart = charts.find(c => c.id === item.chartId);
                        const cfg = chartConfigs[item.chartId] || {};
                        const extractNames = (fields: any[]) => (fields || []).map((f: any) => f.originalName);
                        const isLarge = item.width >= 8;
                        const chartMenuItems = [
                          { key: 'refresh', label: '刷新数据', onClick: () => refetchSingleChart(item.chartId) },
                          { key: 'sql', label: '查看SQL', icon: <CodeOutlined />, onClick: () => { setCurrentSQL(chartSQLs[item.chartId] || '暂无SQL'); setSqlModalVisible(true); } },
                          { key: 'edit', label: '编辑图表', onClick: () => navigate(`/chart-config?chartId=${item.chartId}`) },
                        ];
                        const cardTitle = (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontWeight: 500, fontSize: 14, color: '#1f1f1f' }}>{chart?.name || `图表${index + 1}`}</span>
                            <Dropdown menu={{ items: chartMenuItems }} trigger={['click']} placement="bottomRight">
                              <Button type="text" size="small" icon={<EllipsisOutlined style={{ fontSize: 13, color: '#8c8c8c' }} />} onClick={e => e.stopPropagation()} />
                            </Dropdown>
                          </div>
                        );
                        return (
                          <Card key={item.chartId} title={cardTitle} style={{ gridColumn: isLarge ? 'span 2' : 'span 1', minWidth: 0, borderRadius: 8, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }} styles={{ header: { padding: '10px 16px', minHeight: 44, borderBottom: '1px solid #f5f5f5' }, body: { padding: '12px 16px', overflow: 'hidden' } }}>
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
                        );
                      });
                    } else {
                      return (
                        <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '60px 0', backgroundColor: '#fafafa', borderRadius: '8px' }}>
                          <div style={{ fontSize: '16px', color: '#666', marginBottom: 16 }}>暂无图表</div>
                          <div style={{ fontSize: '14px', color: '#999' }}>请编辑看板添加图表</div>
                        </div>
                      );
                    }
                  })()}
                </div>
              )}
            </div>
          ) : (
            <div style={{ padding: '40px 20px', textAlign: 'center', backgroundColor: '#fafafa', borderRadius: '8px' }}>
              <div style={{ fontSize: '16px', color: '#666', marginBottom: 8 }}>
                请从左侧选择或创建一个看板
              </div>
              <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => navigate('/dashboards/create')}
                >
                  立即创建
                </Button>
            </div>
          )}
        </Card>
      </Content>

      <Modal
        title={editingId ? '编辑看板' : '新增看板'}
        open={isModalVisible}
        onCancel={handleCancel}
        footer={null}
        width={800}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: '请输入看板名称' }]}
          >
            <Input placeholder="请输入看板名称" />
          </Form.Item>

          {editingId && (
            <Form.Item
              name="layout"
              label="布局配置"
              rules={[{ required: true, message: '请输入布局配置' }]}
            >
              <Input.TextArea
                rows={8}
                placeholder="请输入布局配置 JSON"
                style={{ fontFamily: 'monospace' }}
              />
            </Form.Item>
          )}

          <div className="modal-footer">
            <Button onClick={handleCancel} style={{ marginRight: 8 }}>
              取消
            </Button>
            <Button type="primary" htmlType="submit">
              {editingId ? '更新' : '创建'}
            </Button>
          </div>
        </Form>
      </Modal>
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
    </Layout>
  );
};

export default DashboardsPage;