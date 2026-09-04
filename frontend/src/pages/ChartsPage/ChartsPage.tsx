import React, { useEffect, useState } from 'react';
import { App, Button, Card, Table, Tag, Modal } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Chart } from '@shared/api.interface';
import { canModifyRecord, displayCreator } from '../../utils/currentUser';

const formatDateTime = (val: string) => {
  if (!val) return '';
  const d = new Date(val);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const chartTypeMap: Record<string, { label: string; color: string }> = {
  crossTable: { label: '交叉表', color: 'purple' },
  bar: { label: '柱状图', color: 'blue' },
  line: { label: '折线图', color: 'green' },
  pie: { label: '饼图', color: 'orange' },
  indicator: { label: '指标卡', color: 'cyan' },
};

const ChartsPage: React.FC = () => {
  const [charts, setCharts] = useState<Chart[]>([]);
  const [loading, setLoading] = useState(false);
  const [dashboardModalVisible, setDashboardModalVisible] = useState(false);
  const [chartDashboards, setChartDashboards] = useState<any[]>([]);
  const [loadingDashboards, setLoadingDashboards] = useState(false);
  const { modal, message } = App.useApp();
  const navigate = useNavigate();

  // 获取图表列表
  const fetchCharts = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/charts');
      const items = response.data.items as Chart[];
      setCharts(items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
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
    modal.confirm({
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
        <a
          onClick={() => openChartConfig(record)}
          style={{ color: 'var(--primary)', fontWeight: 500 }}
        >
          {text}
        </a>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      render: (type: string) => {
        const m = chartTypeMap[type];
        return m ? <Tag color={m.color}>{m.label}</Tag> : (type || '-');
      },
    },
    {
      title: '创建人',
      dataIndex: 'createdByName',
      key: 'createdByName',
      render: (_: any, record: Chart) => displayCreator(record.createdByName, record.createdBy),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (val: string) => formatDateTime(val),
      sorter: (a: Chart, b: Chart) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      defaultSortOrder: 'descend' as const,
    },
    {
      title: '修改人',
      dataIndex: 'updatedByName',
      key: 'updatedByName',
      render: (_: any, record: Chart) => displayCreator(record.updatedByName, record.updatedBy),
    },
    {
      title: '修改时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      render: (val: string) => formatDateTime(val),
      sorter: (a: Chart, b: Chart) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime(),
    },
    {
      title: '看板',
      dataIndex: 'dashboardCount',
      key: 'dashboardCount',
      render: (count: number, record: Chart) => (
        <span
          style={{ color: 'var(--primary)', cursor: 'pointer', fontWeight: 500 }}
          onClick={() => showDashboardModal(record.id)}
        >
          {count}个
        </span>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: Chart) => {
        const editable = canModifyRecord(record.createdBy);
        return (
        <div className="action-buttons">
          <Button
            icon={<EditOutlined />}
            size="small"
            disabled={!editable}
            title={!editable ? '只有创建人才能编辑' : ''}
            onClick={() => openChartConfig(record)}
          >
            编辑
          </Button>
          <Button
            icon={<DeleteOutlined />}
            size="small"
            danger
            onClick={() => handleDelete(record.id)}
            disabled={record.dashboardCount > 0 || !editable}
            title={
              !editable
                ? '只有创建人才能删除'
                : record.dashboardCount > 0
                ? '该图表已关联看板，不可删除'
                : ''
            }
          >
            删除
          </Button>
        </div>
        );
      },
    },
  ];

  return (
    <div className="charts-page" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <div className="page-title">
          <h2>图表配置</h2>
          <span className="page-sub-title">共 {charts.length} 个图表</span>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => openChartConfig()}
        >
          新增图表
        </Button>
      </div>

      <Card style={{ flex: 1, minHeight: 0, overflow: 'hidden' }} styles={{ body: { height: '100%', overflow: 'auto', padding: '4px 16px 16px' } }}>
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
            { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', render: (val: string) => formatDateTime(val), sorter: (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(), defaultSortOrder: 'descend' as const },
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