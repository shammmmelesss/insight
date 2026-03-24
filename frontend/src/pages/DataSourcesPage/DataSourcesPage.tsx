import React, { useEffect, useState } from 'react';
import { Button, Card, Table, Modal, Form, Input, InputNumber, Switch, message, Select, Row, Col, Tag } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, CheckOutlined } from '@ant-design/icons';
import axios from 'axios';
import { DataSource, CreateDataSourceRequest, UpdateDataSourceRequest } from '@shared/api.interface';

const { Option } = Select;
const { TextArea } = Input;

// BigQuery 类型判断
const isBigQueryType = (type?: string) => type === 'BigQuery';

const DataSourcesPage: React.FC = () => {
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [form] = Form.useForm();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string>('PostgreSQL');

  const fetchDataSources = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/data-sources');
      setDataSources(response.data.items);
    } catch (error) {
      message.error('获取数据源列表失败');
      console.error('获取数据源列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDataSources();
  }, []);

  const showModal = (record?: DataSource) => {
    if (record) {
      setEditingId(record.id);
      setSelectedType(record.type);
      form.setFieldsValue({
        name: record.name,
        type: record.type,
        host: record.host,
        port: record.port,
        database: record.database,
        username: record.username,
        password: record.password,
        credentials: record.credentials,
        isActive: record.isActive,
      });
    } else {
      setEditingId(null);
      setSelectedType('PostgreSQL');
      form.resetFields();
      form.setFieldsValue({
        type: 'PostgreSQL',
        port: 3306,
        isActive: true,
      });
    }
    setIsModalVisible(true);
  };

  const handleCancel = () => {
    setIsModalVisible(false);
  };

  const handleTypeChange = (value: string) => {
    setSelectedType(value);
    // 切换类型时清空不相关的字段
    if (isBigQueryType(value)) {
      form.setFieldsValue({ host: '', port: undefined, username: '', password: '' });
    } else {
      form.setFieldsValue({ credentials: '' });
    }
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();

      const payload: CreateDataSourceRequest & UpdateDataSourceRequest = {
        name: values.name,
        type: values.type,
        database: values.database,
        isActive: values.isActive,
      };

      if (isBigQueryType(values.type)) {
        payload.credentials = values.credentials;
      } else {
        payload.host = values.host;
        payload.port = values.port;
        payload.username = values.username;
        payload.password = values.password;
      }

      if (editingId) {
        await axios.put(`/api/data-sources/${editingId}`, payload);
        message.success('数据源更新成功');
      } else {
        await axios.post('/api/data-sources', payload);
        message.success('数据源创建成功');
      }

      setIsModalVisible(false);
      fetchDataSources();
    } catch (error) {
      message.error('操作失败，请检查输入');
      console.error('操作失败:', error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await axios.delete(`/api/data-sources/${id}`);
      message.success('数据源删除成功');
      fetchDataSources();
    } catch (error) {
      message.error('数据源删除失败');
      console.error('数据源删除失败:', error);
    }
  };

  const handleTestConnection = async (id: string) => {
    try {
      const response = await axios.post(`/api/data-sources/${id}/test`);
      if (response.data.success) {
        message.success('连接测试成功');
      } else {
        message.error(`连接测试失败: ${response.data.message}`);
      }
    } catch (error) {
      message.error('连接测试失败');
      console.error('连接测试失败:', error);
    }
  };

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => (
        <Tag color={isBigQueryType(type) ? 'blue' : 'default'}>{type}</Tag>
      ),
    },
    {
      title: '连接信息',
      key: 'connection',
      render: (_: any, record: DataSource) => {
        if (isBigQueryType(record.type)) {
          return <span>Project: {record.database}</span>;
        }
        return <span>{record.host}:{record.port} / {record.database}</span>;
      },
    },
    {
      title: '状态',
      dataIndex: 'isActive',
      key: 'isActive',
      render: (isActive: boolean) => (
        <Switch checked={isActive} disabled />
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: DataSource) => (
        <div className="action-buttons">
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
            style={{ marginRight: 8 }}
          >
            删除
          </Button>
          <Button
            icon={<CheckOutlined />}
            size="small"
            onClick={() => handleTestConnection(record.id)}
          >
            测试连接
          </Button>
        </div>
      ),
    },
  ];

  const isBigQuery = isBigQueryType(selectedType);

  return (
    <div className="data-sources-page">
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2>数据源管理</h2>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => showModal()}
        >
          新增数据源
        </Button>
      </div>

      <Card>
        <Table
          columns={columns}
          dataSource={dataSources}
          rowKey="id"
          loading={loading}
          pagination={false}
        />
      </Card>

      <Modal
        title={
          <div>
            <h2>{editingId ? '编辑数据源' : '新增数据源'}</h2>
            <p style={{ margin: '8px 0 0 0', color: '#888', fontSize: '14px' }}>配置数据库连接信息，用于后续创建数据集</p>
          </div>
        }
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
            label="数据源名称"
            rules={[{ required: true, message: '请输入数据源名称' }]}
          >
            <Input placeholder="如：生产环境 MySQL" />
          </Form.Item>

          <Form.Item
            name="type"
            label="数据库类型"
            rules={[{ required: true, message: '请选择数据库类型' }]}
          >
            <Select placeholder="请选择数据库类型" onChange={handleTypeChange}>
              <Option value="PostgreSQL">PostgreSQL</Option>
              <Option value="MySQL">MySQL</Option>
              <Option value="Oracle">Oracle</Option>
              <Option value="SQL Server">SQL Server</Option>
              <Option value="BigQuery">Google BigQuery</Option>
            </Select>
          </Form.Item>

          {isBigQuery ? (
            <>
              {/* BigQuery 专用字段 */}
              <Form.Item
                name="database"
                label="Project ID"
                rules={[{ required: true, message: '请输入 Google Cloud Project ID' }]}
              >
                <Input placeholder="如：my-gcp-project-123" />
              </Form.Item>

              <Form.Item
                name="credentials"
                label="Service Account JSON 凭证"
                rules={[{ required: !editingId, message: '请粘贴 Service Account JSON 凭证' }]}
                extra="从 Google Cloud Console 下载的 Service Account Key JSON 文件内容"
              >
                <TextArea
                  rows={6}
                  placeholder={'粘贴 Service Account JSON 内容，例如：\n{\n  "type": "service_account",\n  "project_id": "my-project",\n  ...\n}'}
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                />
              </Form.Item>
            </>
          ) : (
            <>
              {/* 传统数据库字段 */}
              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="host"
                    label="主机地址"
                    rules={[{ required: true, message: '请输入主机地址' }]}
                  >
                    <Input placeholder="如：localhost" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="port"
                    label="端口"
                    rules={[{ required: true, message: '请输入端口号' }]}
                  >
                    <InputNumber style={{ width: '100%' }} placeholder="如：5432" />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item
                name="database"
                label="数据库名称"
                rules={[{ required: true, message: '请输入数据库名称' }]}
              >
                <Input placeholder="数据库名" />
              </Form.Item>

              <Row gutter={16}>
                <Col span={12}>
                  <Form.Item
                    name="username"
                    label="用户名"
                    rules={[{ required: true, message: '请输入用户名' }]}
                  >
                    <Input placeholder="用户名" />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item
                    name="password"
                    label="密码"
                    rules={[{ required: true, message: '请输入密码' }]}
                  >
                    <Input.Password placeholder="密码" />
                  </Form.Item>
                </Col>
              </Row>
            </>
          )}

          <Form.Item
            name="isActive"
            label="启用"
            valuePropName="checked"
          >
            <Switch defaultChecked />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
            <Button onClick={handleCancel} style={{ marginRight: 8 }}>
              取消
            </Button>
            <Button type="primary" htmlType="submit" size="large">
              {editingId ? '更新' : '保存'}
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

export default DataSourcesPage;
