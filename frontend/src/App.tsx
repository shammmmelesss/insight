import { ConfigProvider } from 'antd';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage/HomePage';
import DataSourcesPage from './pages/DataSourcesPage/DataSourcesPage';
import DatasetsPage from './pages/DatasetsPage/DatasetsPage';
import ChartsPage from './pages/ChartsPage/ChartsPage';
import ChartConfigPage from './pages/ChartConfigPage/ChartConfigPage';
import DashboardsPage from './pages/DashboardsPage/DashboardsPage';
import DashboardEditPage from './pages/DashboardEditPage/DashboardEditPage';
import NotFound from './pages/NotFound/NotFound';
import Layout from './components/Layout/Layout';
import ErrorBoundary from './components/ErrorBoundary';
import { WorkspaceProvider, useWorkspace } from './contexts/WorkspaceContext';
import './App.css';

/** 用 currentWorkspace.id 作为 key，切换空间时强制重新挂载所有页面组件 */
function AppRoutes() {
  const { currentWorkspace, loading } = useWorkspace();

  if (loading) return null;

  return (
    <div key={currentWorkspace?.id || 'none'} style={{ display: 'contents' }}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/data-sources" element={<DataSourcesPage />} />
        <Route path="/datasets" element={<DatasetsPage />} />
        <Route path="/charts" element={<ChartsPage />} />
        <Route path="/chart-config" element={<ChartConfigPage />} />
        <Route path="/dashboards" element={<DashboardsPage />} />
        <Route path="/dashboards/create" element={<DashboardEditPage />} />
        <Route path="/dashboards/edit/:id" element={<DashboardEditPage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
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
        <Router>
          <WorkspaceProvider>
            <Layout>
              <AppRoutes />
            </Layout>
          </WorkspaceProvider>
        </Router>
      </ConfigProvider>
    </ErrorBoundary>
  );
}

export default App;
