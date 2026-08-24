import { App as AntdApp, ConfigProvider, Spin } from 'antd';
import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
// 首页保持同步加载，保证首屏最快渲染；其余页面按路由懒加载
import HomePage from './pages/HomePage/HomePage';
const DataSourcesPage = lazy(() => import('./pages/DataSourcesPage/DataSourcesPage'));
const DatasetsPage = lazy(() => import('./pages/DatasetsPage/DatasetsPage'));
const ChartsPage = lazy(() => import('./pages/ChartsPage/ChartsPage'));
const ChartConfigPage = lazy(() => import('./pages/ChartConfigPage/ChartConfigPage'));
const DashboardsPage = lazy(() => import('./pages/DashboardsPage/DashboardsPage'));
const DashboardEditPage = lazy(() => import('./pages/DashboardEditPage/DashboardEditPage'));
const MonitorPage = lazy(() => import('./pages/MonitorPage/MonitorPage'));
const SQLQueryPage = lazy(() => import('./pages/SQLQueryPage/SQLQueryPage'));
const WorkspacesPage = lazy(() => import('./pages/WorkspacesPage/WorkspacesPage'));
const NotFound = lazy(() => import('./pages/NotFound/NotFound'));
import Layout from './components/Layout/Layout';
import GlobalWatermark from './components/GlobalWatermark';
import ErrorBoundary from './components/ErrorBoundary';
import { WorkspaceProvider, useWorkspace } from './contexts/WorkspaceContext';
import AuthProvider from './contexts/AuthContext';
import './App.css';

/** 用 currentWorkspace.id 作为 key，切换空间时强制重新挂载所有页面组件 */
function AppRoutes() {
  const { currentWorkspace, loading } = useWorkspace();

  if (loading) return null;

  return (
    <div key={currentWorkspace?.id || 'none'} style={{ display: 'contents' }}>
      <Suspense fallback={<div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}><Spin size="large" /></div>}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/data-sources" element={<DataSourcesPage />} />
        <Route path="/datasets" element={<DatasetsPage />} />
        <Route path="/charts" element={<ChartsPage />} />
        <Route path="/chart-config" element={<ChartConfigPage />} />
        <Route path="/dashboards" element={<DashboardsPage />} />
        <Route path="/dashboards/create" element={<DashboardEditPage />} />
        <Route path="/dashboards/edit/:id" element={<DashboardEditPage />} />
        <Route path="/dashboards/:id" element={<DashboardsPage />} />
        <Route path="/monitor" element={<MonitorPage />} />
        <Route path="/sql" element={<SQLQueryPage />} />
        <Route path="/workspaces" element={<WorkspacesPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ConfigProvider
        theme={{
          token: {
            colorPrimary: '#165DFF',
            borderRadius: 8,
          },
        }}
      >
        <AntdApp>
          <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <AuthProvider>
              <WorkspaceProvider>
                <GlobalWatermark>
                  <Layout>
                    <AppRoutes />
                  </Layout>
                </GlobalWatermark>
              </WorkspaceProvider>
            </AuthProvider>
          </Router>
        </AntdApp>
      </ConfigProvider>
    </ErrorBoundary>
  );
}

export default App;
