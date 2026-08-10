import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '@/api/client';
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

// 注：请求拦截器（含 X-Workspace-Id）统一在 @/api/client 中注册。

export const WorkspaceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspaceState] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshWorkspaces = useCallback(async () => {
    try {
      const response = await api.get('/api/workspaces');
      const items: Workspace[] = response.data.items || [];
      setWorkspaces(items);

      if (items.length === 0) {
        const createRes = await api.post('/api/workspaces', { name: '默认空间', description: '系统自动创建的默认项目空间' });
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
