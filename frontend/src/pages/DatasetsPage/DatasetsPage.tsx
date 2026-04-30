import React, { useEffect, useState } from 'react';
import { Button, Card, Table, Modal, Drawer, Form, Input, message, Tabs, Row, Col, Select } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, PlayCircleOutlined } from '@ant-design/icons';
import axios from 'axios';
import { Dataset, CreateDatasetRequest, UpdateDatasetRequest, FieldConfig } from '@shared/api.interface';

const { Option } = Select;


const { TextArea } = Input;

const DatasetsPage: React.FC = () => {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  
  // SQL运行和字段配置相关状态
  const [sqlResult, setSqlResult] = useState<any[]>([]);
  const [sqlColumns, setSqlColumns] = useState<any[]>([]);
  const [runningSql, setRunningSql] = useState(false);
  const [activeTab, setActiveTab] = useState('query');
  const [fieldsConfig, setFieldsConfig] = useState<FieldConfig[]>([]);
  const [dataSources, setDataSources] = useState<any[]>([]);
  const [selectedDataSource, setSelectedDataSource] = useState<string>('');
  
  // 表单字段状态
  const [formValues, setFormValues] = useState({
    name: '',
    sql: '',
    description: ''
  });
  
  // 图表列表相关状态
  const [chartModalVisible, setChartModalVisible] = useState(false);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [datasetCharts, setDatasetCharts] = useState<any[]>([]);
  const [loadingCharts, setLoadingCharts] = useState(false);

  // 获取数据集列表
  const fetchDatasets = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/datasets', {
        params: { name: searchKeyword }
      });
      console.log('获取数据集列表响应:', response.data.items);
      setDatasets(response.data.items);
    } catch (error) {
      message.error('获取数据集列表失败');
      console.error('获取数据集列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 处理搜索
  const handleSearch = () => {
    fetchDatasets();
  };

  // 处理搜索框输入变化
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchKeyword(e.target.value);
  };

  useEffect(() => {
    fetchDatasets();
    fetchDataSources();
  }, []);

  // 获取数据源列表
  const fetchDataSources = async () => {
    try {
      const response = await axios.get('/api/data-sources');
      setDataSources(response.data.items);
    } catch (error) {
      console.error('获取数据源列表失败:', error);
    }
  };

  // 运行SQL
  const runSql = async () => {
    try {
      // 验证必填字段
      if (!formValues.name.trim()) {
        message.error('请输入数据集名称');
        return;
      }
      if (!formValues.sql.trim()) {
        message.error('请输入SQL查询语句');
        return;
      }
      if (!selectedDataSource) {
        message.error('请选择数据源');
        return;
      }
      
      setRunningSql(true);
      
      const response = await axios.post('/api/datasets/preview', {
        sql: formValues.sql,
        dataSourceId: selectedDataSource
      });
      
      setSqlResult(response.data.data || []);
      setSqlColumns(response.data.columns || []);
      
      // 自动生成字段配置
      const autoFieldsConfig: FieldConfig[] = (response.data.columns || []).map((col: any) => {
        const dataType = mapDbTypeToDataType(col.type);
        // 字段类型默认逻辑：数字类型默认指标，其他默认维度
        const fieldType = dataType === 'number' ? 'measure' : 'dimension';
        return {
          originalName: col.name,
          displayName: col.name,
          type: fieldType as const,
          dataType: dataType,
        };
      });
      setFieldsConfig(autoFieldsConfig);
      
      message.success('SQL运行成功');
      setActiveTab('fields');
    } catch (error) {
      message.error('SQL运行失败');
      console.error('SQL运行失败:', error);
    } finally {
      setRunningSql(false);
    }
  };

  // 更新字段配置
  const updateFieldConfig = (index: number, key: keyof FieldConfig, value: any) => {
    const newFieldsConfig = [...fieldsConfig];
    newFieldsConfig[index][key] = value;
    setFieldsConfig(newFieldsConfig);
  };
  
  // 根据数据库类型自动匹配数据类型
  const mapDbTypeToDataType = (dbType: string): DataType => {
    const lowerType = dbType.toLowerCase();
    if (lowerType.includes('date') || lowerType.includes('time')) {
      return 'date';
    } else if (lowerType.includes('int') || lowerType.includes('float') || lowerType.includes('double') || lowerType.includes('numeric')) {
      return 'number';
    } else if (lowerType.includes('bool') || lowerType.includes('boolean')) {
      return 'boolean';
    } else {
      return 'text';
    }
  };

  // 添加计算字段
  const addCalculatedField = () => {
    const newField: FieldConfig = {
      originalName: `calculated_${fieldsConfig.length}`,
      displayName: `计算字段${fieldsConfig.length + 1}`,
      type: 'measure' as const,
      dataType: 'number' as const,
      expression: '',
      isCalculated: true,
    };
    setFieldsConfig([...fieldsConfig, newField]);
  };

  // 打开模态框
  const showModal = (record?: Dataset) => {
    if (record) {
      // 编辑模式
      setEditingId(record.id);
      setSelectedDataSource(record.dataSourceId || '');
      setFieldsConfig((record.fieldsConfig || []).map(f => ({
        ...f,
        isCalculated: f.isCalculated ?? f.originalName.startsWith('calculated_'),
      })));
      setFormValues({
        name: record.name,
        sql: record.sql,
        description: record.description || ''
      });
      setSqlResult([]);
      setSqlColumns([]);
    } else {
      // 新增模式
      setEditingId(null);
      setSelectedDataSource('');
      setFieldsConfig([]);
      setFormValues({
        name: '',
        sql: '',
        description: ''
      });
      setSqlResult([]);
      setSqlColumns([]);
    }
    setActiveTab('query');
    setIsModalVisible(true);
  };

  // 关闭模态框
  const handleCancel = () => {
    setIsModalVisible(false);
  };

  // 提交表单
  const handleSubmit = async () => {
    try {
      // 验证必填字段
      if (!formValues.name.trim()) {
        message.error('请输入数据集名称');
        return;
      }
      if (!formValues.sql.trim()) {
        message.error('请输入SQL查询语句');
        return;
      }
      if (!selectedDataSource) {
        message.error('请选择数据源');
        return;
      }
      
      // 验证至少有一个字段配置
      if (fieldsConfig.length === 0) {
        message.error('请至少定义一个字段');
        return;
      }

      // 验证计算字段必须填写表达式
      const missingExpression = fieldsConfig.find(f => f.isCalculated && !f.expression?.trim());
      if (missingExpression) {
        message.error(`计算字段「${missingExpression.displayName}」必须填写计算表达式`);
        setActiveTab('fields');
        return;
      }
      
      let requestData: CreateDatasetRequest | UpdateDatasetRequest;
      let response;
      
      // 确保selectedDataSource被包含在请求中
      const dataSourceId = selectedDataSource;
      
      if (editingId) {
        // 更新数据集
        requestData = {
          name: formValues.name,
          sql: formValues.sql,
          description: formValues.description,
          fieldsConfig: fieldsConfig,
          dataSourceId: dataSourceId,
        };
        console.log('更新数据集请求数据:', requestData);
        response = await axios.put(`/api/datasets/${editingId}`, requestData);
        message.success('数据集更新成功');
      } else {
        // 创建数据集
        requestData = {
          name: formValues.name,
          sql: formValues.sql,
          description: formValues.description,
          fieldsConfig: fieldsConfig,
          dataSourceId: dataSourceId,
        };
        console.log('创建数据集请求数据:', requestData);
        response = await axios.post('/api/datasets', requestData);
        message.success('数据集创建成功');
      }
      
      console.log('请求成功，响应数据:', response.data);
      setIsModalVisible(false);
      fetchDatasets();
    } catch (error: any) {
      message.error('操作失败，请检查输入');
      console.error('操作失败:', error);
      console.error('错误详情:', error.response?.data || error.message);
      console.error('错误状态码:', error.response?.status);
    }
  };

  // 删除数据集
  const handleDelete = async (id: string) => {
    try {
      const dataset = datasets.find(d => d.id === id);
      if (dataset && dataset.chartCount > 0) {
        message.error('该数据集下有关联图表，不可删除');
        return;
      }
      
      await axios.delete(`/api/datasets/${id}`);
      message.success('数据集删除成功');
      fetchDatasets();
    } catch (error) {
      message.error('数据集删除失败');
      console.error('数据集删除失败:', error);
    }
  };
  
  // 获取使用特定数据集的图表列表
  const fetchDatasetCharts = async (datasetId: string) => {
    setLoadingCharts(true);
    try {
      const response = await axios.get(`/api/datasets/${datasetId}/charts`);
      setDatasetCharts(response.data.items || []);
    } catch (error) {
      message.error('获取图表列表失败');
      console.error('获取图表列表失败:', error);
    } finally {
      setLoadingCharts(false);
    }
  };
  
  // 打开图表列表模态框
  const showChartModal = (datasetId: string) => {
    setSelectedDatasetId(datasetId);
    fetchDatasetCharts(datasetId);
    setChartModalVisible(true);
  };

  // 表格列配置
  const columns = [
    {
      title: '数据集名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '关联图表',
      dataIndex: 'chartCount',
      key: 'chartCount',
      render: (chartCount: number, record: Dataset) => (
        <span 
          style={{ color: '#1890ff', cursor: 'pointer' }} 
          onClick={() => showChartModal(record.id)}
        >
          {chartCount}个
        </span>
      ),
    },
    {
      title: '创建人',
      dataIndex: 'createdBy',
      key: 'createdBy',
    },
    {
      title: '修改人',
      dataIndex: 'updatedBy',
      key: 'updatedBy',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
    },
    {
      title: '修改时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Dataset) => (
        <div className="action-buttons">
          <Button
            size="small"
            onClick={() => window.open(`/charts/create?datasetId=${record.id}`, '_blank')}
            style={{ marginRight: 8, color: '#1890ff' }}
          >
            可视化
          </Button>
          <Button
            icon={<EditOutlined />}
            size="small"
            onClick={() => showModal(record)}
            style={{ marginRight: 8 }}
          >
            编辑
          </Button>
          <Button
            icon={<DeleteOutlined />}
            size="small"
            danger
            onClick={() => handleDelete(record.id)}
          >
            删除
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="datasets-page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexShrink: 0 }}>
        <h2>数据集管理</h2>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => showModal()}
        >
          新增数据集
        </Button>
      </div>

      <Card style={{ marginBottom: 16, flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <Input
            placeholder="搜索数据集名称..."
            value={searchKeyword}
            onChange={handleSearchChange}
            style={{ width: 300 }}
          />
          <Button type="primary" onClick={handleSearch}>
            搜索
          </Button>
        </div>
      </Card>

      <Card style={{ flex: 1, minHeight: 0, overflow: 'hidden' }} styles={{ body: { height: '100%', overflow: 'auto', padding: '0 16px' } }}>
        <Table
          columns={columns}
          dataSource={datasets}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Drawer
        title={editingId ? '编辑数据集' : '新增数据集'}
        open={isModalVisible}
        onClose={handleCancel}
        width="80vw"
        placement="right"
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                label="数据集名称"
                rules={[{ required: true, message: '请输入数据集名称' }]}
              >
                <Input 
                  placeholder="请输入数据集名称" 
                  value={formValues.name}
                  onChange={(e) => setFormValues({...formValues, name: e.target.value})}
                />
              </Form.Item>

              <Form.Item
                label="数据源"
              >
                <Select
                  placeholder="请选择数据源"
                  value={selectedDataSource}
                  onChange={setSelectedDataSource}
                  style={{ width: '100%' }}
                >
                  {dataSources.map(source => (
                    <Option key={source.id} value={source.id}>{source.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                label="数据集描述"
              >
                <Input 
                  placeholder="请输入数据集描述" 
                  value={formValues.description}
                  onChange={(e) => setFormValues({...formValues, description: e.target.value})}
                />
              </Form.Item>
            </Col>
          </Row>

          <Tabs activeKey={activeTab} onChange={setActiveTab}>
            <Tabs.TabPane tab="SQL语句" key="query">
              <Form.Item
                label="SQL查询"
                rules={[{ required: true, message: '请输入SQL查询语句' }]}
              >
                <div style={{ display: 'flex', gap: 8 }}>
                  <TextArea
                    rows={8}
                    placeholder="请输入SQL查询语句"
                    value={formValues.sql}
                    onChange={(e) => setFormValues({...formValues, sql: e.target.value})}
                    style={{ fontFamily: 'monospace', flex: 1 }}
                  />
                  <Button
                    type="primary"
                    icon={<PlayCircleOutlined />}
                    onClick={runSql}
                    loading={runningSql}
                    style={{ height: 'fit-content', whiteSpace: 'nowrap' }}
                  >
                    试运行
                  </Button>
                </div>
              </Form.Item>

              {sqlResult.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <h4>查询结果</h4>
                  <Table
                    columns={sqlColumns.map((col: any) => ({
                      title: col.name,
                      dataIndex: col.name,
                      key: col.name,
                    }))}
                    dataSource={sqlResult}
                    rowKey={(index) => index?.toString() || '0'}
                    pagination={{ pageSize: 5 }}
                    size="small"
                  />
                </div>
              )}
            </Tabs.TabPane>

            <Tabs.TabPane tab="字段设置" key="fields">
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                <Button type="dashed" onClick={addCalculatedField}>
                  + 新增计算字段
                </Button>
              </div>

              {fieldsConfig.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 32, color: '#999' }}>
                  暂无字段配置
                  <br />
                  请先在SQL语句标签页运行SQL生成字段
                </div>
              ) : (
                <Table
                  dataSource={fieldsConfig}
                  rowKey={(index) => index?.toString() || '0'}
                  pagination={false}
                  size="small"
                >
                  <Table.Column
                    title="原始字段名"
                    dataIndex="originalName"
                    key="originalName"
                  />
                  <Table.Column
                    title="显示名称"
                    key="displayName"
                    render={(_, __, index) => (
                      <Input
                        value={fieldsConfig[index]?.displayName}
                        onChange={(e) => updateFieldConfig(index, 'displayName', e.target.value)}
                        placeholder="请输入显示名称"
                      />
                    )}
                  />
                  <Table.Column
                    title="字段类型"
                    key="type"
                    render={(_, __, index) => (
                      <Select
                        value={fieldsConfig[index]?.type}
                        onChange={(value) => updateFieldConfig(index, 'type', value)}
                        style={{ width: 120 }}
                      >
                        <Option value="dimension">维度</Option>
                        <Option value="measure">指标</Option>
                      </Select>
                    )}
                  />
                  <Table.Column
                    title="数据类型"
                    key="dataType"
                    render={(_, __, index) => (
                      <Select
                        value={fieldsConfig[index]?.dataType}
                        onChange={(value) => updateFieldConfig(index, 'dataType', value)}
                        style={{ width: 120 }}
                      >
                        <Option value="date">日期</Option>
                        <Option value="number">数字</Option>
                        <Option value="text">文本</Option>
                        <Option value="boolean">布尔</Option>
                      </Select>
                    )}
                  />
                  <Table.Column
                    title="计算表达式"
                    key="expression"
                    render={(_, __, index) => {
                      const field = fieldsConfig[index];
                      const isCalculated = field?.isCalculated;
                      const isEmpty = isCalculated && !field?.expression?.trim();
                      return (
                        <Input
                          value={field?.expression || ''}
                          onChange={(e) => updateFieldConfig(index, 'expression', e.target.value)}
                          placeholder={isCalculated ? '请输入计算表达式（必填）' : '—'}
                          disabled={!isCalculated}
                          status={isEmpty ? 'error' : undefined}
                          style={!isCalculated ? { background: '#f5f5f5', color: '#bbb', cursor: 'not-allowed' } : undefined}
                        />
                      );
                    }}
                  />
                  <Table.Column
                    title="操作"
                    key="action"
                    width={60}
                    render={(_, __, index) => {
                      if (!fieldsConfig[index]?.isCalculated) return null;
                      return (
                        <Button
                          type="text"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          onClick={() => setFieldsConfig(fieldsConfig.filter((_, i) => i !== index))}
                        />
                      );
                    }}
                  />
                </Table>
              )}
            </Tabs.TabPane>
          </Tabs>

          <div className="modal-footer" style={{ marginTop: 24, textAlign: 'right' }}>
            <Button onClick={handleCancel} style={{ marginRight: 8 }}>
              取消
            </Button>
            <Button type="primary" htmlType="submit">
              {editingId ? '更新' : '创建'}
            </Button>
          </div>
        </Form>
      </Drawer>

      {/* 图表列表模态框 */}
      <Modal
        title="使用该数据集的图表"
        open={chartModalVisible}
        onCancel={() => setChartModalVisible(false)}
        footer={null}
        width={800}
      >
        <Table
          columns={[
            {
              title: '图表名称',
              dataIndex: 'name',
              key: 'name',
            },
            {
              title: '图表类型',
              dataIndex: 'type',
              key: 'type',
              render: (type: string) => {
                const typeMap: Record<string, string> = {
                  'crossTable': '交叉表',
                  'bar': '柱状图',
                  'line': '折线图',
                  'pie': '饼图',
                  'indicator': '指标卡'
                };
                return typeMap[type] || type;
              }
            },
            {
              title: '创建时间',
              dataIndex: 'createdAt',
              key: 'createdAt',
            },
            {
              title: '操作',
              key: 'action',
              render: (_: any, record: any) => (
                <div className="action-buttons">
                  <Button
                    size="small"
                    onClick={() => window.open(`/charts/edit/${record.id}`, '_blank')}
                    style={{ marginRight: 8, color: '#1890ff' }}
                  >
                    编辑
                  </Button>
                </div>
              ),
            },
          ]}
          dataSource={datasetCharts}
          rowKey="id"
          loading={loadingCharts}
          pagination={{ pageSize: 10 }}
        />
      </Modal>
    </div>
  );
};

export default DatasetsPage;