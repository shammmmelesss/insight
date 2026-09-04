import React, { useEffect, useState } from 'react';
import { Layout as AntLayout, Menu, Select, Button, Tooltip, Avatar } from 'antd';
import { Link, useLocation } from 'react-router-dom';
import {
  HomeOutlined,
  TableOutlined,
  BarChartOutlined,
  LayoutOutlined,
  SwapOutlined,
  SettingOutlined,
  MonitorOutlined,
  UserOutlined,
  CompassOutlined,
} from '@ant-design/icons';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import PortalSidebar from './PortalSidebar';
import { fetchAllWorkUsers } from '../../lib/workUser';
import { getCurrentUserId, getCurrentUserName } from '../../utils/currentUser';
import { isEmbedMode } from '../../utils/embed';

const { Header, Content } = AntLayout;

const menuItems = [
  {
    key: '/',
    icon: <HomeOutlined />,
    label: <Link to="/">首页</Link>,
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
  {
    key: '/monitor',
    icon: <MonitorOutlined />,
    label: <Link to="/monitor">监控</Link>,
  },
];

// 子路由归属：看板详情/编辑等仍高亮所在模块
const resolveSelectedKey = (pathname: string): string => {
  if (pathname.startsWith('/dashboards')) return '/dashboards';
  return pathname;
};

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const isDashboardRoute =
    location.pathname === '/dashboards' || location.pathname.startsWith('/dashboards/');
  // 新建/编辑看板为全屏编辑态，隐藏导航与顶栏
  const isDashboardEditRoute =
    location.pathname === '/dashboards/create' ||
    location.pathname.startsWith('/dashboards/edit');
  // 嵌入模式：被其它系统 iframe 嵌入时隐藏导航与顶栏
  const embed = isEmbedMode();
  const fullscreen = isDashboardEditRoute || embed;

  const { workspaces, currentWorkspace, setCurrentWorkspace } = useWorkspace();

  // 当前登录人（姓名取自 sessionStorage，头像按 openId 从全量用户列表匹配）
  const currentUserId = getCurrentUserId();
  const currentUserName = getCurrentUserName();
  const [currentUserAvatar, setCurrentUserAvatar] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!currentUserId && !currentUserName) return;
    fetchAllWorkUsers()
      .then(users => {
        const me = users.find(u => u.openId === currentUserId || u.name === currentUserName);
        if (me?.avatar) setCurrentUserAvatar(me.avatar);
      })
      .catch(() => {});
  }, [currentUserId, currentUserName]);

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

  // 全屏编辑/嵌入模式：直接渲染子路由
  if (fullscreen) {
    return (
      <AntLayout style={{ height: '100vh', background: '#fff' }}>
        <Content style={{ height: '100vh', overflow: 'hidden' }}>{children}</Content>
      </AntLayout>
    );
  }

  const selectedKey = resolveSelectedKey(location.pathname);

  return (
    <AntLayout style={{ height: '100vh' }}>
      <AntLayout style={{ background: 'var(--bg-layout)' }}>
        <Header className="app-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0, flex: 1 }}>
            <PortalSidebar />
            <div className="app-logo app-logo--top">
              <span className="app-logo-mark">I</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>Insight</span>
            </div>
            <Menu
              mode="horizontal"
              selectedKeys={[selectedKey]}
              items={menuItems}
              className="app-top-menu"
              style={{ flex: 1, minWidth: 0, borderBottom: 'none', background: 'transparent' }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SwapOutlined style={{ color: 'var(--text-secondary)' }} rotate={90} />
            <Select
              value={currentWorkspace?.id}
              onChange={handleWorkspaceChange}
              placeholder="选择项目空间"
              style={{ width: 140 }}
              size="middle"
              popupMatchSelectWidth={false}
              suffixIcon={<CompassOutlined />}
            >
              {workspaces.map(ws => (
                <Select.Option key={ws.id} value={ws.id}>
                  {ws.name}
                </Select.Option>
              ))}
            </Select>
            <Tooltip title="项目空间管理">
              <Button type="text" size="middle" icon={<SettingOutlined />} onClick={openWorkspaceManager} />
            </Tooltip>
            {(currentUserName || currentUserId) && (
              <Tooltip title={currentUserName || currentUserId}>
                <Avatar size="small" src={currentUserAvatar} icon={<UserOutlined />} style={{ cursor: 'default' }}>
                  {(currentUserName || currentUserId)?.slice(0, 1)}
                </Avatar>
              </Tooltip>
            )}
          </div>
        </Header>

        {isDashboardRoute ? (
          <Content
            style={{
              minHeight: 0,
              overflow: 'auto',
              height: 'calc(100vh - var(--header-height))',
            }}
          >
            {children}
          </Content>
        ) : (
          <Content
            className="app-content"
            style={{
              height: 'calc(100vh - var(--header-height))',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div className="app-content-shell">{children}</div>
          </Content>
        )}
      </AntLayout>
    </AntLayout>
  );
};

export default Layout;