import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { WorkUser } from '@/lib/workUser';

interface UserContextType {
  currentUser: WorkUser | null;
  loading: boolean;
}

const UserContext = createContext<UserContextType>({ currentUser: null, loading: true });

export const useCurrentUser = () => useContext(UserContext);

const MOCK_CURRENT_USER: WorkUser = { openId: 'mock_user_1', name: '张三' };
const USER_ID_KEY = 'currentUserId';
const USER_NAME_KEY = 'currentUserName';
const USER_INFO_KEY = 'currentUserInfo';

const isDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';


// axios 拦截器：每个请求自动带上 X-User-Id 和 X-User-Name
axios.interceptors.request.use((config) => {
  const url = config.url || '';
  if (!url.startsWith('http')) {
    const userId = localStorage.getItem(USER_ID_KEY);
    const userName = localStorage.getItem(USER_NAME_KEY);
    if (userId) config.headers['X-User-Id'] = userId;
    if (userName) config.headers['X-User-Name'] = encodeURIComponent(userName);
  }
  return config;
});

export const UserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<WorkUser | null>(null);
  const [loading, setLoading] = useState(true);

  const setUser = useCallback((user: WorkUser) => {
    localStorage.setItem(USER_ID_KEY, user.openId);
    localStorage.setItem(USER_NAME_KEY, user.name);
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
      const res = await axios.get('/api/me');
      const u = res.data?.data;
      if (u) {
        setUser({
          openId: u.feishu_userid || u.userid || u.id,
          name: u.name,
          avatar: u.avatar,
        });
      }
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
