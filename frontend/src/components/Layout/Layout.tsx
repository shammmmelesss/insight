import React, { useState } from 'react';
import { Layout as AntLayout, Menu, Typography, Select, Button, Modal, Form, Input, message, Space, Dropdown } from 'antd';
import { Link, useLocation } from 'react-router-dom';
import {
  HomeOutlined,
  DatabaseOutlined,
  TableOutlined,
  BarChartOutlined,
  LayoutOutlined,
  SwapOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import axios from 'axios';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { Workspace } from '@shared/api.interface';

const { Header, Content } = AntLayout;
const { Title } = Typography;

const menuItems = [
  {
    key: '/',
    icon: <HomeOutlined />,
    label: <Link to="/">首页</Link>,
  },
  {
    key: '/data-sources',
    icon: <DatabaseOutlined />,
    label: <Link to="/data-sources">数据源</Link>,
  },
  {
    key: '/datasets',
    icon: <TableOutlined />,
    label: <Link to="/datasets">数据集</Link>,
  },
  {
    key: '/charts',
    icon: <BarChartOutlined />,
    label: <Link to="/charts">图表配置</Link>,
  },
  {
    key: '/dashboards',
    icon: <LayoutOutlined />,
    label: <Link to="/dashboards">看板</Link>,
  },
];

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const { workspaces, currentWorkspace, setCurrentWorkspace, refreshWorkspaces } = useWorkspace();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
  const [form] = Form.useForm();

  const handleWorkspaceChange = (workspaceId: string) => {
    const ws = workspaces.find(w => w.id === workspaceId);
    if (ws) {
      setCurrentWorkspace(ws);
    }
  };

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
        const res = await axios.post('/api/workspaces', values);
        message.success('项目空间创建成功');
        // 自动切换到新创建的空间
        setCurrentWorkspace(res.data);
      }
      setIsModalVisible(false);
      await refreshWorkspaces();
    } catch (error) {
      message.error('操作失败');
    }
  };

  const handleDelete = async (ws: Workspace) => {
    if (workspaces.length <= 1) {
      message.warning('至少保留一个项目空间');
      return;
    }
    try {
      await axios.delete(`/api/workspaces/${ws.id}`);
      message.success('项目空间删除成功');
      await refreshWorkspaces();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const manageMenuItems = [
    {
      key: 'create',
      icon: <PlusOutlined />,
      label: '新建空间',
      onClick: showCreateModal,
    },
    { type: 'divider' as const },
    ...workspaces.map(ws => ({
      key: ws.id,
      label: (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minWidth: 200 }}>
          <span>{ws.name}</span>
          <Space size={4}>
            <Button type="text" size="small" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); showEditModal(ws); }} />
            <Button type="text" size="small" danger icon={<DeleteOutlined />} onClick={(e) => { e.stopPropagation(); handleDelete(ws); }} />
          </Space>
        </div>
      ),
    })),
  ];

  return (
    <AntLayout>
      <Header style={{ display: 'flex', alignItems: 'center', padding: '0 24px', background: '#fff', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Title level={4} style={{ margin: '0 24px 0 0', color: '#165DFF', whiteSpace: 'nowrap' }}>Insight</Title>
            <Menu
              mode="horizontal"
              selectedKeys={[location.pathname]}
              items={menuItems}
              style={{ background: 'transparent', borderBottom: 0 }}
            />
          </div>
          <Space size={8}>
            <SwapOutlined style={{ color: '#666' }} />
            <Select
              value={currentWorkspace?.id}
              onChange={handleWorkspaceChange}
              style={{ width: 140 }}
              size="small"
              popupMatchSelectWidth={false}
            >
              {workspaces.map(ws => (
                <Select.Option key={ws.id} value={ws.id}>{ws.name}</Select.Option>
              ))}
            </Select>
            <Dropdown menu={{ items: manageMenuItems }} trigger={['click']}>
              <Button type="text" size="small" icon={<SettingOutlined />} />
            </Dropdown>
          </Space>
        </div>
      </Header>
      {(location.pathname === '/dashboards' || location.pathname.startsWith('/dashboards/edit/') || location.pathname === '/dashboards/create') ? (
        children
      ) : (
        <Content style={{ padding: '10px', background: '#f0f2f5', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
          <div
            style={{
              background: '#fff',
              flex: 1,
              minHeight: 0,
              borderRadius: 8,
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
              padding: 10,
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {children}
          </div>
        </Content>
      )}

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
          <Form.Item name="description" label="描述">
            <Input.TextArea placeholder="请输入描述（可选）" rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </AntLayout>
  );
};

export default Layout;
