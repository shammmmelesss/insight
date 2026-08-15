import React, { useEffect, useMemo, useState } from 'react';
import { App, Avatar, Button, Card, Table, Modal, Form, Input, Space, Tooltip, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UserOutlined } from '@ant-design/icons';
import axios from 'axios';
import { Workspace } from '@shared/api.interface';
import { useAuth } from '../../contexts/AuthContext';
import { WorkUser, fetchAllWorkUsers } from '@/lib/workUser';

const { Title } = Typography;
const { TextArea } = Input;

const formatDateTime = (val?: string) => {
  if (!val) return '-';
  const d = new Date(val);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const WorkspacesPage: React.FC = () => {
  const { message, modal } = App.useApp();
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(false);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
  const [form] = Form.useForm();
  const [workUsers, setWorkUsers] = useState<WorkUser[]>([]);

  // openId -> 用户信息（用于展示头像），与「看板分享用户」使用同一数据源
  const userMap = useMemo(() => {
    const m: Record<string, WorkUser> = {};
    workUsers.forEach((u) => { m[u.openId] = u; });
    return m;
  }, [workUsers]);

  // 只有创建人可编辑；历史数据（无创建人）默认允许
  const canModify = (ws: Workspace) => !ws.createdBy || ws.createdBy === user?.openId;

  // 渲染「头像 + 姓名」，头像按 openId 从全量用户里取
  const renderUser = (openId?: string, name?: string) => {
    if (!openId && !name) return '-';
    return (
      <Space size={6}>
        <Avatar size="small" src={openId ? userMap[openId]?.avatar : undefined} icon={<UserOutlined />} />
        <span>{name || userMap[openId || '']?.name || '-'}</span>
      </Space>
    );
  };

  const fetchWorkspaces = async () => {
    setLoading(true);
    try {
      const res = await axios.get('/api/workspaces');
      setWorkspaces(res.data.items || []);
    } catch (error) {
      message.error('获取项目空间列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkspaces();
    fetchAllWorkUsers().then(setWorkUsers).catch(() => {});
  }, []);

  const showCreateModal = () => {
    setEditingWorkspace(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const showEditModal = (ws: Workspace) => {
    setEditingWorkspace(ws);
    form.setFieldsValue({ name: ws.name, description: ws.description });
    setIsModalVisible(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      if (editingWorkspace) {
        await axios.put(`/api/workspaces/${editingWorkspace.id}`, values);
        message.success('项目空间更新成功');
      } else {
        await axios.post('/api/workspaces', values);
        message.success('项目空间创建成功');
      }
      setIsModalVisible(false);
      await fetchWorkspaces();
    } catch (error: any) {
      if (error?.errorFields) return; // 表单校验失败
      const msg = error?.response?.data?.error || '操作失败';
      message.error(msg);
    }
  };

  const handleDelete = (ws: Workspace) => {
    if (workspaces.length <= 1) {
      message.warning('至少保留一个项目空间');
      return;
    }
    modal.confirm({
      title: '确认删除',
      content: `确定要删除项目空间「${ws.name}」吗？此操作不可恢复。`,
      okText: '确认删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        try {
          await axios.delete(`/api/workspaces/${ws.id}`);
          message.success('项目空间删除成功');
          await fetchWorkspaces();
        } catch (error: any) {
          const msg = error?.response?.data?.error || '删除失败';
          message.error(msg);
        }
      },
    });
  };

  const columns = [
    { title: '空间名称', dataIndex: 'name', key: 'name' },
    { title: '备注', dataIndex: 'description', key: 'description', render: (v: string) => v || '-' },
    { title: '创建人', key: 'createdByName', render: (_: unknown, ws: Workspace) => renderUser(ws.createdBy, ws.createdByName) },
    { title: '创建时间', dataIndex: 'createdAt', key: 'createdAt', render: formatDateTime },
    { title: '修改人', key: 'updatedByName', render: (_: unknown, ws: Workspace) => renderUser(ws.updatedBy, ws.updatedByName) },
    { title: '修改时间', dataIndex: 'updatedAt', key: 'updatedAt', render: formatDateTime },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_: unknown, ws: Workspace) => {
        const editable = canModify(ws);
        return (
          <Space size={4}>
            <Tooltip title={editable ? '编辑' : '只有创建人可编辑'}>
              <Button
                type="text"
                size="small"
                icon={<EditOutlined />}
                disabled={!editable}
                onClick={() => showEditModal(ws)}
              />
            </Tooltip>
            <Tooltip title={editable ? '删除' : '只有创建人可删除'}>
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                disabled={!editable}
                onClick={() => handleDelete(ws)}
              />
            </Tooltip>
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>项目空间管理</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={showCreateModal}>
          新建空间
        </Button>
      </div>
      <Card bodyStyle={{ padding: 0 }}>
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={workspaces}
          pagination={false}
        />
      </Card>

      <Modal
        title={editingWorkspace ? '编辑项目空间' : '新建项目空间'}
        open={isModalVisible}
        onOk={handleModalOk}
        onCancel={() => setIsModalVisible(false)}
        okText="确定"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="空间名称" rules={[{ required: true, message: '请输入空间名称' }]}>
            <Input placeholder="请输入项目空间名称" />
          </Form.Item>
          <Form.Item name="description" label="备注">
            <TextArea placeholder="请输入备注（可选）" rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default WorkspacesPage;
