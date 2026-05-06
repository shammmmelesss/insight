import React, { useEffect, useState } from 'react';
import { Button, Card, Table, Space, message, Modal } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Chart } from '@shared/api.interface';

const ChartsPage: React.FC = () => {
  const [charts, setCharts] = useState<Chart[]>([]);
  const [loading, setLoading] = useState(false);
  const [dashboardModalVisible, setDashboardModalVisible] = useState(false);
  const [chartDashboards, setChartDashboards] = useState<any[]>([]);
  const [loadingDashboards, setLoadingDashboards] = useState(false);
  const navigate = useNavigate();

  // 获取图表列表
  const fetchCharts = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/charts');
      setCharts(response.data.items);
    } catch (error) {
      message.error('获取图表列表失败');
      console.error('获取图表列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCharts();
  }, []);

  // 打开图表配置页面
  const openChartConfig = (record?: Chart) => {
    if (record) {
      // 编辑模式，传递chartId作为参数
      navigate(`/chart-config?chartId=${record.id}`);
    } else {
      // 新增模式
      navigate('/chart-config');
    }
  };

  // 获取引用该图表的看板列表
  const showDashboardModal = async (chartId: string) => {
    setLoadingDashboards(true);
    setDashboardModalVisible(true);
    try {
      const response = await axios.get(`/api/charts/${chartId}/dashboards`);
      setChartDashboards(response.data.items || []);
    } catch (error) {
      message.error('获取看板列表失败');
    } finally {
      setLoadingDashboards(false);
    }
  };

  // 删除图表
  const handleDelete = (id: string) => {
    Modal.confirm({
      title: '确认删除',
      content: '删除后不可恢复，确认删除该图表吗？',
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await axios.delete(`/api/charts/${id}`);
          message.success('图表删除成功');
          fetchCharts();
        } catch (error) {
          message.error('图表删除失败');
          console.error('图表删除失败:', error);
        }
      },
    });
  };

  // 表格列配置
  const columns = [
    {
      title: '图表名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: Chart) => (
        <a onClick={() => openChartConfig(record)}>{text}</a>
      ),
    },
    {
      title: '创建人',
      dataIndex: 'createdBy',
      key: 'createdBy',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
    },
    {
      title: '修改人',
      dataIndex: 'updatedBy',
      key: 'updatedBy',
    },
    {
      title: '修改时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
    },
    {
      title: '看板',
      dataIndex: 'dashboardCount',
      key: 'dashboardCount',
      render: (count: number, record: Chart) => (
        <span
          style={{ color: '#1890ff', cursor: 'pointer' }}
          onClick={() => showDashboardModal(record.id)}
        >
          {count}个
        </span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Chart) => (
        <Space>
          <Button
            icon={<EditOutlined />}
            size="small"
            onClick={() => openChartConfig(record)}
          >
            编辑
          </Button>
          <Button
            icon={<DeleteOutlined />}
            size="small"
            danger
            onClick={() => handleDelete(record.id)}
            disabled={record.dashboardCount > 0}
            title={record.dashboardCount > 0 ? '该图表已关联看板，不可删除' : ''}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div className="charts-page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexShrink: 0 }}>
        <h2>图表配置</h2>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => openChartConfig()}
        >
          新增图表
        </Button>
      </div>

      <Card style={{ flex: 1, minHeight: 0, overflow: 'hidden' }} styles={{ body: { height: '100%', overflow: 'auto', padding: '0 16px' } }}>
        <Table
          columns={columns}
          dataSource={charts}
          rowKey="id"
          loading={loading}
          pagination={false}
        />
      </Card>
      <Modal
        title="引用该图表的看板"
        open={dashboardModalVisible}
        onCancel={() => setDashboardModalVisible(false)}
        footer={null}
        width={600}
      >
        <Table
          columns={[
            { title: '看板名称', dataIndex: 'name', key: 'name' },
            { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt' },
          ]}
          dataSource={chartDashboards}
          rowKey="id"
          loading={loadingDashboards}
          pagination={{ pageSize: 10 }}
        />
      </Modal>
    </div>
  );
};

export default ChartsPage;