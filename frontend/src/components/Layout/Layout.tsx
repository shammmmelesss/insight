import React from 'react';
import { Layout as AntLayout, Menu, Typography, Select, Button, Space, Tooltip } from 'antd';
import { Link, useLocation } from 'react-router-dom';
import {
  HomeOutlined,
  TableOutlined,
  BarChartOutlined,
  LayoutOutlined,
  SwapOutlined,
  SettingOutlined,
  MonitorOutlined,
  CodeOutlined,
} from '@ant-design/icons';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import PortalSidebar from './PortalSidebar';

const { Header, Content } = AntLayout;
const { Title } = Typography;

const menuItems = [
  {
    key: '/',
    icon: <HomeOutlined />,
    label: <Link to="/">首页</Link>,
  },
  // {
  //   key: '/data-sources',
  //   icon: <DatabaseOutlined />,
  //   label: <Link to="/data-sources">数据源</Link>,
  // },
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
  {
    key: '/monitor',
    icon: <MonitorOutlined />,
    label: <Link to="/monitor">监控</Link>,
  },
  {
    key: '/sql',
    icon: <CodeOutlined />,
    label: <Link to="/sql">SQL 查询</Link>,
  },
];

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const isDashboardRoute = location.pathname === '/dashboards' || location.pathname.startsWith('/dashboards/');
  // 新建/编辑看板为全屏编辑态，隐藏顶部导航
  const isDashboardEditRoute = location.pathname === '/dashboards/create' || location.pathname.startsWith('/dashboards/edit');
  const { workspaces, currentWorkspace, setCurrentWorkspace } = useWorkspace();

  const handleWorkspaceChange = (workspaceId: string) => {
    const ws = workspaces.find(w => w.id === workspaceId);
    if (ws) {
      setCurrentWorkspace(ws);
    }
  };

  // 打开独立的项目空间管理页面（新浏览器标签页）
  const openWorkspaceManager = () => {
    window.open('/workspaces', '_blank');
  };

  return (
    <AntLayout style={{ height: '100vh' }}>
      {!isDashboardEditRoute && (
      <Header style={{ display: 'flex', alignItems: 'center', padding: '0 24px', background: '#fff', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <PortalSidebar />
            <Title level={4} style={{ margin: '0 24px 0 0', color: '#165DFF', whiteSpace: 'nowrap' }}>Insight</Title>
            <Menu
              mode="horizontal"
              selectedKeys={[location.pathname]}
              items={menuItems}
              disabledOverflow
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
            <Tooltip title="项目空间管理">
              <Button type="text" size="small" icon={<SettingOutlined />} onClick={openWorkspaceManager} />
            </Tooltip>
          </Space>
        </div>
      </Header>
      )}
      {isDashboardRoute ? (
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
    </AntLayout>
  );
};

export default Layout;
