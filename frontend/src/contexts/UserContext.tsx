import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { fetchWorkUsers, WorkUser } from '@/components/ShareDashboardModal/ShareDashboardModal';

interface UserContextType {
  currentUser: WorkUser | null;
  loading: boolean;
}

const UserContext = createContext<UserContextType>({ currentUser: null, loading: true });

export const useCurrentUser = () => useContext(UserContext);

const MOCK_CURRENT_USER: WorkUser = { openId: 'mock_user_1', name: '张三' };
const USER_ID_KEY = 'currentUserId';
const USER_INFO_KEY = 'currentUserInfo';

const isDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

// 尝试从 cookie 中读取飞书用户 ID（SSO 登录后通常会设置）
function getFeishuUserIdFromCookie(): string {
  const match = document.cookie.match(/(?:^|;\s*)feishu_userid=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

// axios 拦截器：每个请求自动带上 X-User-Id
axios.interceptors.request.use((config) => {
  const userId = localStorage.getItem(USER_ID_KEY);
  if (userId) {
    config.headers['X-User-Id'] = userId;
  }
  return config;
});

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<WorkUser | null>(null);
  const [loading, setLoading] = useState(true);

  const setUser = useCallback((user: WorkUser) => {
    localStorage.setItem(USER_ID_KEY, user.openId);
    localStorage.setItem(USER_INFO_KEY, JSON.stringify(user));
    setCurrentUser(user);
  }, []);

  const fetchCurrentUser = useCallback(async () => {
    if (isDev) {
      setUser(MOCK_CURRENT_USER);
      setLoading(false);
      return;
    }

    // 用缓存快速渲染
    const cached = localStorage.getItem(USER_INFO_KEY);
    if (cached) {
      try { setCurrentUser(JSON.parse(cached)); } catch { /* ignore */ }
    }

    try {
      // 优先从 cookie 取飞书 ID（SSO 登录后设置）
      const feishuId = getFeishuUserIdFromCookie() || localStorage.getItem(USER_ID_KEY) || '';
      if (feishuId) {
        // 用 ID 在用户列表中找到完整信息
        const users = await fetchWorkUsers();
        const matched = users.find(u => u.openId === feishuId);
        if (matched) { setUser(matched); return; }
      }
      // fallback：拉全量列表取第一个（不应发生，仅兜底）
      const users = await fetchWorkUsers();
      if (users.length > 0) setUser(users[0]);
    } catch {
      // 保留缓存用户，不阻断渲染
    } finally {
      setLoading(false);
    }
  }, [setUser]);

  useEffect(() => { fetchCurrentUser(); }, [fetchCurrentUser]);

  return (
    <UserContext.Provider value={{ currentUser, loading }}>
      {children}
    </UserContext.Provider>
  );
};
