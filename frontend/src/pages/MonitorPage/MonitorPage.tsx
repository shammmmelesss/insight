import React, { useEffect, useState } from 'react';
import { App, Button, Card, Table, Space, message, Modal, Form, Input, Select, TimePicker, Row, Col, Tooltip} from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import { PlusOutlined, EditOutlined, DeleteOutlined, CopyOutlined } from '@ant-design/icons';
import axios from 'axios';
import dayjs from 'dayjs';
import {
  Monitor, MonitorOperator, MonitorScheduleFrequency,
  DatasetOption, FieldConfig,
} from '@shared/api.interface';

const OPERATORS: { label: string; value: MonitorOperator }[] = [
  { label: '>', value: '>' },
  { label: '>=', value: '>=' },
  { label: '<', value: '<' },
  { label: '<=', value: '<=' },
  { label: '=', value: '=' },
  { label: '!=', value: '!=' },
];

const WEEKDAYS = [
  { label: '周一', value: 1 }, { label: '周二', value: 2 }, { label: '周三', value: 3 },
  { label: '周四', value: 4 }, { label: '周五', value: 5 }, { label: '周六', value: 6 },
  { label: '周日', value: 0 },
];

function parseJson<T>(raw: T | string, fallback: T): T {
  if (typeof raw !== 'string') return raw ?? fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

const MonitorPage: React.FC = () => {
  const { modal } = App.useApp();
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingMonitor, setEditingMonitor] = useState<Monitor | null>(null);
  const [datasets, setDatasets] = useState<DatasetOption[]>([]);
  const [fields, setFields] = useState<FieldConfig[]>([]);
  const [scheduleFrequency, setScheduleFrequency] = useState<MonitorScheduleFrequency>('daily');
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<{ triggered: boolean; currentValue: number; threshold: number; operator: string; metric: string; aggFunc: string; sql: string; notifyErrors?: string[] } | null>(null);
  const [form] = Form.useForm();

  const fetchMonitors = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/monitors');
      setMonitors(res.data.items);
    } catch { message.error('获取监控列表失败'); }
    finally { setLoading(false); }
  };

  const fetchDatasets = async () => {
    try {
      const res = await axios.get('/api/datasets/select-list');
      setDatasets(res.data.items);
    } catch { /* ignore */ }
  };

  const fetchFields = async (datasetId: string) => {
    setFields([]);
    try {
      const res = await axios.get(`/api/datasets/${datasetId}`);
      setFields(res.data.fieldsConfig || []);
    } catch { /* ignore */ }
  };

  useEffect(() => { fetchMonitors(); fetchDatasets(); }, []);

  const openCreate = () => {
    setEditingMonitor(null);
    setFields([]);
    setScheduleFrequency('daily');
    setTriggerResult(null);
    form.resetFields();
    setModalVisible(true);
  };

  const openCopy = (record: Monitor) => {
    setEditingMonitor(null);
    const schedule = parseJson(record.triggerSchedule, { frequency: 'daily' as MonitorScheduleFrequency, time: '09:00' });
    setScheduleFrequency(schedule.frequency || 'daily');
    form.setFieldsValue({
      name: `${record.name} (复制)`,
      datasetId: record.datasetId,
      timeField: record.timeField,
      whereClause: record.whereClause,
      triggerAggFunc: record.triggerAggFunc || 'SUM',
      triggerMetric: record.triggerMetric,
      triggerOperator: record.triggerOperator,
      triggerThreshold: record.triggerThreshold,
      scheduleFrequency: schedule.frequency || 'daily',
      scheduleTime: schedule.time ? dayjs(schedule.time, 'HH:mm') : undefined,
      scheduleWeekday: schedule.weekday,
      scheduleDay: schedule.day,
      webhookUrl: record.webhookUrl || '',
      webhookSecret: record.webhookSecret || '',
    });
    if (record.datasetId) fetchFields(record.datasetId);
    setTriggerResult(null);
    setModalVisible(true);
  };

  const openEdit = (record: Monitor) => {
    setEditingMonitor(record);
    const schedule = parseJson(record.triggerSchedule, { frequency: 'daily' as MonitorScheduleFrequency, time: '09:00' });
    setScheduleFrequency(schedule.frequency || 'daily');
    form.setFieldsValue({
      name: record.name,
      datasetId: record.datasetId,
      timeField: record.timeField,
      whereClause: record.whereClause,
      triggerAggFunc: record.triggerAggFunc || 'SUM',
      triggerMetric: record.triggerMetric,
      triggerOperator: record.triggerOperator,
      triggerThreshold: record.triggerThreshold,
      scheduleFrequency: schedule.frequency || 'daily',
      scheduleTime: schedule.time ? dayjs(schedule.time, 'HH:mm') : undefined,
      scheduleWeekday: schedule.weekday,
      scheduleDay: schedule.day,
      webhookUrl: record.webhookUrl || '',
      webhookSecret: record.webhookSecret || '',
    });
    if (record.datasetId) fetchFields(record.datasetId);
    setTriggerResult(null);
    setModalVisible(true);
  };

  const handleTrigger = async () => {
    if (!editingMonitor) return;
    setTriggering(true);
    setTriggerResult(null);
    try {
      const res = await axios.post(`/api/monitors/${editingMonitor.id}/trigger`);
      setTriggerResult(res.data);
    } catch (e: any) {
      message.error(e?.response?.data?.error || '触发失败');
    } finally {
      setTriggering(false);
    }
  };

  const handleDatasetChange = (datasetId: string) => {
    form.setFieldsValue({ timeField: undefined, triggerMetric: undefined });
    fetchFields(datasetId);
  };

  const handleOk = async () => {
    const values = await form.validateFields();
    const schedule = {
      frequency: values.scheduleFrequency,
      time: values.scheduleTime ? dayjs(values.scheduleTime).format('HH:mm') : undefined,
      ...(values.scheduleFrequency === 'weekly' ? { weekday: values.scheduleWeekday } : {}),
      ...(values.scheduleFrequency === 'monthly' ? { day: values.scheduleDay } : {}),
    };
    const payload = {
      name: values.name,
      datasetId: values.datasetId,
      timeField: values.timeField,
      whereClause: values.whereClause || '',
      triggerAggFunc: values.triggerAggFunc || 'SUM',
      triggerMetric: values.triggerMetric,
      triggerOperator: values.triggerOperator,
      triggerThreshold: values.triggerThreshold,
      triggerSchedule: JSON.stringify(schedule),
      notifyChannels: JSON.stringify(['lark']),
      webhookUrl: values.webhookUrl || '',
      webhookSecret: values.webhookSecret || '',
      ...(editingMonitor ? { updatedBy: values.updatedBy } : { createdBy: values.createdBy }),
    };
    try {
      if (editingMonitor) {
        await axios.put(`/api/monitors/${editingMonitor.id}`, payload);
        message.success('监控更新成功');
      } else {
        await axios.post('/api/monitors', payload);
        message.success('监控创建成功');
      }
      setModalVisible(false);
      fetchMonitors();
    } catch { message.error(editingMonitor ? '监控更新失败' : '监控创建失败'); }
  };

  const handleDelete = (id: string) => {
    modal.confirm({
      title: '确认删除', content: '删除后不可恢复，确认删除该监控吗？',
      okText: '确认删除', okButtonProps: { danger: true }, cancelText: '取消',
      onOk: async () => {
        try {
          await axios.delete(`/api/monitors/${id}`);
          message.success('监控删除成功');
          fetchMonitors();
        } catch { message.error('监控删除失败'); }
      },
    });
  };

  const timeFields = fields.filter(f => f.dataType === 'date');
  const measureFields = fields.filter(f => f.type === 'measure');

  const columns = [
    { title: '监控名称', dataIndex: 'name', key: 'name' },
    { title: '创建人', dataIndex: 'createdBy', key: 'createdBy' },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt' },
    { title: '修改人', dataIndex: 'updatedBy', key: 'updatedBy' },
    { title: '修改时间', dataIndex: 'updatedAt', key: 'updatedAt' },
    {
      title: '操作', key: 'action',
      render: (_: any, record: Monitor) => (
        <Space>
          <Button icon={<EditOutlined />} size="small" onClick={() => openEdit(record)}>编辑</Button>
          <Button icon={<CopyOutlined />} size="small" onClick={() => openCopy(record)}>复制</Button>
          <Button icon={<DeleteOutlined />} size="small" danger onClick={() => handleDelete(record.id)}>删除</Button>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexShrink: 0 }}>
        <h2>监控</h2>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增监控</Button>
      </div>

      <Card style={{ flex: 1, minHeight: 0, overflow: 'hidden' }} styles={{ body: { height: '100%', overflow: 'auto', padding: '0 16px' } }}>
        <Table columns={columns} dataSource={monitors} rowKey="id" loading={loading} pagination={false} />
      </Card>

      <Modal
        title={editingMonitor ? '编辑监控' : '新增监控'}
        open={modalVisible}
        onCancel={() => setModalVisible(false)}
        width={560}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Space>
              {editingMonitor && (
                <Button
                  type="link"
                  danger
                  loading={triggering}
                  onClick={handleTrigger}
                  style={{ padding: 0 }}
                >
                  立即触发
                </Button>
              )}
              {triggerResult && (
                <Space direction="vertical" size={2}>
                  <Tooltip title={`${triggerResult.aggFunc}(${triggerResult.metric}) = ${triggerResult.currentValue}，阈值 ${triggerResult.operator} ${triggerResult.threshold}\nSQL: ${triggerResult.sql}`}>
                    <Space size={4}>
                      {triggerResult.triggered
                        ? <CheckCircleOutlined style={{ color: '#ff4d4f' }} />
                        : <CloseCircleOutlined style={{ color: '#52c41a' }} />}
                      <span style={{ fontSize: 12, color: triggerResult.triggered ? '#ff4d4f' : '#52c41a' }}>
                        {triggerResult.triggered ? '已触发告警' : '未触发'}（当前值：{triggerResult.currentValue}）
                      </span>
                    </Space>
                  </Tooltip>
                  {triggerResult.notifyErrors && triggerResult.notifyErrors.length > 0 && (
                    <Tooltip title={triggerResult.notifyErrors.join('\n')}>
                      <span style={{ fontSize: 12, color: '#faad14', cursor: 'pointer' }}>⚠️ 通知发送失败，点击查看详情</span>
                    </Tooltip>
                  )}
                </Space>
              )}
            </Space>
            <Space>
              <Button onClick={() => setModalVisible(false)}>取消</Button>
              <Button type="primary" onClick={handleOk}>确定</Button>
            </Space>
          </div>
        }
      >
        <Form form={form} layout="vertical" initialValues={{ scheduleFrequency: 'daily', notifyLarkUsers: [] }}>
          <Form.Item name="name" label="监控名称" rules={[{ required: true, message: '请输入监控名称' }]}>
            <Input placeholder="请输入监控名称" />
          </Form.Item>

          <Form.Item name="datasetId" label="数据" rules={[{ required: true, message: '请选择数据集' }]}>
            <Select
              placeholder="请选择数据集"
              options={datasets.map(d => ({ label: d.name, value: d.id }))}
              onChange={handleDatasetChange}
              showSearch
              filterOption={(input, option) => (option?.label as string)?.includes(input)}
            />
          </Form.Item>

          <Form.Item name="timeField" label="时间字段">
            <Select
              placeholder="请选择时间字段"
              options={timeFields.map(f => ({ label: f.displayName || f.originalName, value: f.originalName }))}
              allowClear disabled={timeFields.length === 0}
            />
          </Form.Item>

          <Form.Item name="whereClause" label="筛选条件（WHERE）" extra="可选，手动输入 SQL WHERE 条件，如：status = 'active' AND region = 'CN'">
            <Input.TextArea placeholder="例：status = 'active' AND region = 'CN'" autoSize={{ minRows: 1, maxRows: 3 }} allowClear />
          </Form.Item>

          <Form.Item label="触发方式" required style={{ marginBottom: 0 }}>
            <Space.Compact style={{ width: '100%' }}>
              <Form.Item name="triggerAggFunc" noStyle rules={[{ required: true, message: '请选择聚合函数' }]}>
                <Select placeholder="聚合" style={{ width: '18%' }} options={[
                  { label: 'SUM', value: 'SUM' },
                  { label: 'COUNT', value: 'COUNT' },
                  { label: 'AVG', value: 'AVG' },
                  { label: 'MAX', value: 'MAX' },
                  { label: 'MIN', value: 'MIN' },
                ]} />
              </Form.Item>
              <Form.Item name="triggerMetric" noStyle rules={[{ required: true, message: '请选择指标' }]}>
                <Select placeholder="指标" style={{ width: '32%' }}
                  options={measureFields.map(f => ({ label: f.displayName || f.originalName, value: f.originalName }))}
                  disabled={measureFields.length === 0} />
              </Form.Item>
              <Form.Item name="triggerOperator" noStyle rules={[{ required: true, message: '请选择运算符' }]}>
                <Select placeholder="符号" style={{ width: '18%' }} options={OPERATORS} />
              </Form.Item>
              <Form.Item name="triggerThreshold" noStyle rules={[{ required: true, message: '请输入阈值' }]}>
                <Input placeholder="阈值" style={{ width: '32%' }} />
              </Form.Item>
            </Space.Compact>
          </Form.Item>

          <Form.Item label="触发时间" required style={{ marginTop: 16, marginBottom: 0 }}>
            <Row gutter={8}>
              <Col flex="120px">
                <Form.Item name="scheduleFrequency" noStyle rules={[{ required: true }]}>
                  <Select
                    options={[{ label: '每天', value: 'daily' }, { label: '每周', value: 'weekly' }, { label: '每月', value: 'monthly' }]}
                    onChange={(v) => { setScheduleFrequency(v); form.setFieldsValue({ scheduleWeekday: undefined, scheduleDay: undefined }); }}
                  />
                </Form.Item>
              </Col>
              {scheduleFrequency === 'weekly' && (
                <Col flex="110px">
                  <Form.Item name="scheduleWeekday" noStyle rules={[{ required: true, message: '请选择星期' }]}>
                    <Select placeholder="选择星期" options={WEEKDAYS} />
                  </Form.Item>
                </Col>
              )}
              {scheduleFrequency === 'monthly' && (
                <Col flex="110px">
                  <Form.Item name="scheduleDay" noStyle rules={[{ required: true, message: '请选择日期' }]}>
                    <Select placeholder="选择日期"
                      options={Array.from({ length: 31 }, (_, i) => ({ label: `${i + 1}日`, value: i + 1 }))} />
                  </Form.Item>
                </Col>
              )}
              <Col flex="auto">
                <Form.Item name="scheduleTime" noStyle rules={[{ required: true, message: '请选择时间' }]}>
                  <TimePicker format="HH:mm" minuteStep={5} style={{ width: '100%' }} placeholder="选择时间" />
                </Form.Item>
              </Col>
            </Row>
          </Form.Item>

          <Form.Item
            name="webhookUrl"
            label="Webhook URL"
            rules={[{ required: true, message: '请输入 Webhook URL' }]}
          >
            <Input placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/..." />
          </Form.Item>

          <Form.Item
            name="webhookSecret"
            label="Webhook Secret"
            rules={[{ required: true, message: '请输入 Webhook Secret' }]}
          >
            <Input.Password placeholder="签名校验密钥" />
          </Form.Item>

        </Form>
      </Modal>
    </div>
  );
};

export default MonitorPage;
