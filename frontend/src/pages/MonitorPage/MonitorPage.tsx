import React, { useEffect, useState, useCallback } from 'react';
import { App, Button, Card, Table, Space, message, Modal, Form, Input, Select, TimePicker, Row, Col, Tooltip, Avatar} from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, UserOutlined } from '@ant-design/icons';
import { PlusOutlined, EditOutlined, DeleteOutlined, CopyOutlined, HistoryOutlined } from '@ant-design/icons';
import axios from 'axios';
import { fetchDatasetOptions } from '@/api/datasets';
import dayjs from 'dayjs';
import {
  Monitor, MonitorOperator, MonitorScheduleFrequency,
  DatasetOption, FieldConfig, LarkUser, MonitorRecord,
} from '@shared/api.interface';
import { canModifyRecord, displayCreator } from '../../utils/currentUser';

const formatDateTime = (val: string) => {
  if (!val) return '';
  const d = new Date(val);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

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
  const [notifyChannel, setNotifyChannel] = useState<'webhook' | 'lark_user'>('webhook');
  const [larkUserOptions, setLarkUserOptions] = useState<LarkUser[]>([]);
  const [larkUserSearching, setLarkUserSearching] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<MonitorRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [triggerResult, setTriggerResult] = useState<{ triggered: boolean; rows: { dimension: string; value: number }[]; threshold: number; operator: string; metric: string; aggFunc: string; sql: string; notifyErrors?: string[] } | null>(null);
  const [form] = Form.useForm();

  const searchLarkUsers = useCallback(async (keyword: string) => {
    if (!keyword) { setLarkUserOptions([]); return; }
    setLarkUserSearching(true);
    try {
      const res = await axios.get('/api/lark/users/search', { params: { keyword } });
      setLarkUserOptions(res.data.items || []);
    } catch { setLarkUserOptions([]); }
    finally { setLarkUserSearching(false); }
  }, []);

  const fetchMonitors = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/monitors');
      const items: Monitor[] = res.data.items;
      setMonitors(items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
    } catch { message.error('获取监控列表失败'); }
    finally { setLoading(false); }
  };

  const fetchDatasets = async () => {
    try {
      setDatasets(await fetchDatasetOptions());
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
    setNotifyChannel('webhook');
    setLarkUserOptions([]);
    setTriggerResult(null);
    form.resetFields();
    setModalVisible(true);
  };

  const openCopy = (record: Monitor) => {
    setEditingMonitor(null);
    const schedule = parseJson(record.triggerSchedule, { frequency: 'daily' as MonitorScheduleFrequency, time: '09:00' });
    setScheduleFrequency(schedule.frequency || 'daily');
    const channels = parseJson<string[]>(record.notifyChannels as string, []);
    const ch = channels.includes('lark_user') ? 'lark_user' : 'webhook';
    setNotifyChannel(ch);
    const notifyUsers = parseJson<LarkUser[]>(record.notifyLarkUsers as string, []);
    setLarkUserOptions(notifyUsers);
    form.setFieldsValue({
      name: `${record.name} (复制)`,
      datasetId: record.datasetId,
      dimensionField: record.dimensionField,
      whereClause: record.whereClause,
      triggerAggFunc: record.triggerAggFunc || 'SUM',
      triggerMetric: record.triggerMetric,
      triggerOperator: record.triggerOperator,
      triggerThreshold: record.triggerThreshold,
      scheduleFrequency: schedule.frequency || 'daily',
      scheduleTime: schedule.time ? dayjs(schedule.time, 'HH:mm') : undefined,
      scheduleWeekday: schedule.weekday,
      scheduleDay: schedule.day,
      notifyChannel: ch,
      webhookUrl: record.webhookUrl || '',
      webhookSecret: record.webhookSecret || '',
      notifyLarkUsers: notifyUsers.map(u => u.openId),
    });
    if (record.datasetId) fetchFields(record.datasetId);
    setTriggerResult(null);
    setModalVisible(true);
  };

  const openEdit = (record: Monitor) => {
    setEditingMonitor(record);
    const schedule = parseJson(record.triggerSchedule, { frequency: 'daily' as MonitorScheduleFrequency, time: '09:00' });
    setScheduleFrequency(schedule.frequency || 'daily');
    const channels = parseJson<string[]>(record.notifyChannels as string, []);
    const ch = channels.includes('lark_user') ? 'lark_user' : 'webhook';
    setNotifyChannel(ch);
    const notifyUsers = parseJson<LarkUser[]>(record.notifyLarkUsers as string, []);
    setLarkUserOptions(notifyUsers);
    form.setFieldsValue({
      name: record.name,
      datasetId: record.datasetId,
      dimensionField: record.dimensionField,
      whereClause: record.whereClause,
      triggerAggFunc: record.triggerAggFunc || 'SUM',
      triggerMetric: record.triggerMetric,
      triggerOperator: record.triggerOperator,
      triggerThreshold: record.triggerThreshold,
      scheduleFrequency: schedule.frequency || 'daily',
      scheduleTime: schedule.time ? dayjs(schedule.time, 'HH:mm') : undefined,
      scheduleWeekday: schedule.weekday,
      scheduleDay: schedule.day,
      notifyChannel: ch,
      webhookUrl: record.webhookUrl || '',
      webhookSecret: record.webhookSecret || '',
      notifyLarkUsers: notifyUsers.map(u => u.openId),
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
    form.setFieldsValue({ dimensionField: undefined, triggerMetric: undefined });
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
    const channel = values.notifyChannel as 'webhook' | 'lark_user';
    const selectedUserIds: string[] = channel === 'lark_user' ? (values.notifyLarkUsers || []) : [];
    const selectedUsers = selectedUserIds.map(id => larkUserOptions.find(u => u.openId === id)).filter(Boolean) as LarkUser[];
    const payload = {
      name: values.name,
      datasetId: values.datasetId,
      dimensionField: values.dimensionField,
      whereClause: values.whereClause || '',
      triggerAggFunc: values.triggerAggFunc || 'SUM',
      triggerMetric: values.triggerMetric,
      triggerOperator: values.triggerOperator,
      triggerThreshold: values.triggerThreshold,
      triggerSchedule: JSON.stringify(schedule),
      notifyChannels: JSON.stringify([channel]),
      notifyLarkUsers: JSON.stringify(selectedUsers),
      webhookUrl: channel === 'webhook' ? (values.webhookUrl || '') : '',
      webhookSecret: channel === 'webhook' ? (values.webhookSecret || '') : '',
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

  const openHistory = async (record: Monitor) => {
    setHistoryRecords([]);
    setHistoryVisible(true);
    setHistoryLoading(true);
    try {
      const res = await axios.get(`/api/monitors/${record.id}/records`);
      setHistoryRecords(res.data.items || []);
    } catch { message.error('获取告警历史失败'); }
    finally { setHistoryLoading(false); }
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

  const dimensionFields = fields.filter(f => f.type === 'dimension');
  const measureFields = fields.filter(f => f.type === 'measure');

  const columns = [
    { title: '监控名称', dataIndex: 'name', key: 'name' },
    { title: '创建人', dataIndex: 'createdByName', key: 'createdByName', render: (_: any, record: Monitor) => displayCreator(record.createdByName, record.createdBy) },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', render: (val: string) => formatDateTime(val), sorter: (a: Monitor, b: Monitor) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(), defaultSortOrder: 'descend' as const },
    { title: '修改人', dataIndex: 'updatedByName', key: 'updatedByName', render: (_: any, record: Monitor) => displayCreator(record.updatedByName, record.updatedBy) },
    { title: '修改时间', dataIndex: 'updatedAt', key: 'updatedAt', render: (val: string) => formatDateTime(val), sorter: (a: Monitor, b: Monitor) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime() },
    {
      title: '操作', key: 'action',
      render: (_: any, record: Monitor) => {
        const editable = canModifyRecord(record.createdBy);
        return (
        <div className="action-buttons">
          <Button icon={<EditOutlined />} size="small" disabled={!editable} title={!editable ? '只有创建人才能编辑' : undefined} onClick={() => openEdit(record)}>编辑</Button>
          <Button icon={<CopyOutlined />} size="small" onClick={() => openCopy(record)}>复制</Button>
          <Button icon={<HistoryOutlined />} size="small" onClick={() => openHistory(record)}>告警历史</Button>
          <Button icon={<DeleteOutlined />} size="small" danger disabled={!editable} title={!editable ? '只有创建人才能删除' : undefined} onClick={() => handleDelete(record.id)}>删除</Button>
        </div>
        );
      },
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="page-header">
        <div className="page-title">
          <h2>监控</h2>
          <span className="page-sub-title">共 {monitors.length} 个监控</span>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增监控</Button>
      </div>

      <Card style={{ flex: 1, minHeight: 0, overflow: 'hidden' }} styles={{ body: { height: '100%', overflow: 'auto', padding: '4px 16px 16px' } }}>
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
                  <Tooltip title={`SQL: ${triggerResult.sql}`}>
                    <Space size={4}>
                      {triggerResult.triggered
                        ? <CheckCircleOutlined style={{ color: 'var(--error)' }} />
                        : <CloseCircleOutlined style={{ color: 'var(--success)' }} />}
                      <span style={{ fontSize: 12, color: triggerResult.triggered ? 'var(--error)' : 'var(--success)' }}>
                        {triggerResult.triggered
                          ? `已触发告警（${triggerResult.rows.length} 条满足条件 ${triggerResult.operator} ${triggerResult.threshold}）`
                          : `未触发（无数据满足条件 ${triggerResult.operator} ${triggerResult.threshold}）`}
                      </span>
                    </Space>
                  </Tooltip>
                  {triggerResult.triggered && triggerResult.rows.length > 0 && (
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', maxHeight: 80, overflowY: 'auto' }}>
                      {triggerResult.rows.map((r, i) => (
                        <span key={i}>{r.dimension ? `${r.dimension}：` : ''}{r.value}；</span>
                      ))}
                    </div>
                  )}
                  {triggerResult.notifyErrors && triggerResult.notifyErrors.length > 0 && (
                    <Tooltip title={triggerResult.notifyErrors.join('\n')}>
                      <span style={{ fontSize: 12, color: 'var(--warning)', cursor: 'pointer' }}>⚠️ 通知发送失败，点击查看详情</span>
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
        <Form form={form} layout="vertical" initialValues={{ scheduleFrequency: 'daily', notifyChannel: 'webhook', notifyLarkUsers: [] }}>
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

          <Form.Item name="dimensionField" label="维度字段">
            <Select
              placeholder="请选择维度字段：显示名称（原始字段名）"
              options={dimensionFields.map(f => ({ label: f.displayName ? `${f.displayName}（${f.originalName}）` : f.originalName, value: f.originalName }))}
              allowClear disabled={dimensionFields.length === 0}
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

          <Form.Item name="notifyChannel" label="发送渠道" rules={[{ required: true }]}>
            <Select
              options={[
                { label: '群', value: 'webhook' },
                { label: '飞书', value: 'lark_user' },
              ]}
              onChange={(v) => {
                setNotifyChannel(v);
                form.setFieldsValue({ webhookUrl: '', webhookSecret: '', notifyLarkUsers: [] });
              }}
            />
          </Form.Item>

          {notifyChannel === 'webhook' && (
            <>
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
            </>
          )}

          {notifyChannel === 'lark_user' && (
            <Form.Item
              name="notifyLarkUsers"
              label="选择飞书用户"
              rules={[{ required: true, message: '请至少选择一个用户', type: 'array', min: 1 }]}
            >
              <Select
                mode="multiple"
                placeholder="输入姓名搜索飞书用户"
                filterOption={false}
                showSearch
                loading={larkUserSearching}
                onSearch={searchLarkUsers}
                notFoundContent={larkUserSearching ? '搜索中...' : '暂无结果'}
                optionLabelProp="label"
              >
                {larkUserOptions.map(u => (
                  <Select.Option key={u.openId} value={u.openId} label={u.name}>
                    <Space>
                      {u.avatar
                        ? <Avatar size={20} src={u.avatar} />
                        : <Avatar size={20} icon={<UserOutlined />} />}
                      {u.name}
                    </Space>
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          )}

        </Form>
      </Modal>

      <Modal
        title="告警历史"
        open={historyVisible}
        onCancel={() => setHistoryVisible(false)}
        footer={null}
        width={700}
      >
        <Table
          dataSource={historyRecords}
          rowKey="id"
          loading={historyLoading}
          size="small"
          pagination={{ pageSize: 20, showSizeChanger: false }}
          columns={[
            {
              title: '触发时间',
              dataIndex: 'createdAt',
              key: 'createdAt',
              render: (val: string) => formatDateTime(val),
              defaultSortOrder: 'descend' as const,
              sorter: (a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            },
            {
              title: '结果',
              dataIndex: 'triggered',
              key: 'triggered',
              render: (v: boolean) => v
                ? <span style={{ color: 'var(--error)' }}>已触发</span>
                : <span style={{ color: 'var(--success)' }}>未触发</span>,
            },
            {
              title: '通知状态',
              key: 'notifyStatus',
              render: (_: unknown, r: MonitorRecord) => {
                if (!r.triggered) return <span style={{ color: 'var(--text-tertiary)' }}>-</span>;
                const errors = parseJson<string[]>(r.notifyErrors, []);
                if (r.notifySuccess) {
                  return <span style={{ color: 'var(--success)' }}><CheckCircleOutlined /> 已发送</span>;
                }
                return (
                  <Tooltip title={<pre style={{ margin: 0, whiteSpace: 'pre-wrap', maxWidth: 360 }}>{errors.join('\n')}</pre>}>
                    <span style={{ color: 'var(--error)', cursor: 'pointer' }}>
                      <CloseCircleOutlined /> 发送失败
                    </span>
                  </Tooltip>
                );
              },
            },
            { title: '指标', dataIndex: 'metric', key: 'metric' },
            { title: '聚合', dataIndex: 'aggFunc', key: 'aggFunc' },
            {
              title: '满足条件行数',
              dataIndex: 'currentValue',
              key: 'currentValue',
              render: (v: number) => v,
            },
            {
              title: '条件',
              key: 'condition',
              render: (_: any, r: any) => `${r.operator} ${r.threshold}`,
            },
            {
              title: '触发SQL',
              dataIndex: 'sql',
              key: 'sql',
              render: (val: string) => (
                <Tooltip title={<pre style={{ maxWidth: 500, whiteSpace: 'pre-wrap', margin: 0 }}>{val}</pre>}>
                  <span style={{ color: 'var(--primary)', cursor: 'pointer', fontFamily: 'monospace', fontSize: 12 }}>
                    {val ? val.slice(0, 40) + (val.length > 40 ? '…' : '') : '-'}
                  </span>
                </Tooltip>
              ),
            },
          ]}
        />
      </Modal>
    </div>
  );
};

export default MonitorPage;
