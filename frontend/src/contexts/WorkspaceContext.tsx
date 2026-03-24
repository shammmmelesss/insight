import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Workspace } from '@shared/api.interface';

interface WorkspaceContextType {
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  setCurrentWorkspace: (ws: Workspace) => void;
  refreshWorkspaces: () => Promise<void>;
  loading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextType>({
  workspaces: [],
  currentWorkspace: null,
  setCurrentWorkspace: () => {},
  refreshWorkspaces: async () => {},
  loading: true,
});

export const useWorkspace = () => useContext(WorkspaceContext);

// 全局 axios 拦截器：直接从 localStorage 读取，不依赖 React state
// 这样即使组件还没渲染完，请求也能带上正确的 header
axios.interceptors.request.use((config) => {
  const wsId = localStorage.getItem('currentWorkspaceId');
  if (wsId) {
    config.headers['X-Workspace-Id'] = wsId;
  }
  return config;
});

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspaceState] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshWorkspaces = useCallback(async () => {
    try {
      const response = await axios.get('/api/workspaces');
      const items: Workspace[] = response.data.items || [];
      setWorkspaces(items);

      if (items.length === 0) {
        const createRes = await axios.post('/api/workspaces', { name: '默认空间', description: '系统自动创建的默认项目空间' });
        const newWs = createRes.data;
        setWorkspaces([newWs]);
        setCurrentWorkspaceState(newWs);
        localStorage.setItem('currentWorkspaceId', newWs.id);
        return;
      }

      const savedId = localStorage.getItem('currentWorkspaceId');
      const found = items.find(w => w.id === savedId);
      if (found) {
        setCurrentWorkspaceState(found);
      } else {
        setCurrentWorkspaceState(items[0]);
        localStorage.setItem('currentWorkspaceId', items[0].id);
      }
    } catch (error) {
      console.error('获取项目空间列表失败:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const setCurrentWorkspace = useCallback((ws: Workspace) => {
    setCurrentWorkspaceState(ws);
    localStorage.setItem('currentWorkspaceId', ws.id);
  }, []);

  useEffect(() => {
    refreshWorkspaces();
  }, [refreshWorkspaces]);

  return (
    <WorkspaceContext.Provider value={{ workspaces, currentWorkspace, setCurrentWorkspace, refreshWorkspaces, loading }}>
      {children}
    </WorkspaceContext.Provider>
  );
};
