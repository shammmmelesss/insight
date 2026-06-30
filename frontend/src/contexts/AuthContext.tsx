import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import axios from 'axios';
import { getUserInfo } from '@/api/auth';
import type { UserInfo } from '@/api/auth';

// ─── Auth Context ───────────────────────────────────

export interface AuthContextType {
  user: UserInfo | null;
  isAuthenticated: boolean;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

// ─── Axios 拦截器（全局注册一次）──────────────────────

axios.interceptors.request.use((config) => {
  const url = config.url || '';
  if (!url.startsWith('http')) {
    const userId = sessionStorage.getItem('current_user_id');
    const userName = sessionStorage.getItem('current_user');
    if (userId) config.headers['X-User-Id'] = userId;
    if (userName) config.headers['X-User-Name'] = encodeURIComponent(userName);
  }
  return config;
});

// ─── Provider ───────────────────────────────────────

const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const logout = useCallback(() => {
    sessionStorage.removeItem('current_user');
    sessionStorage.removeItem('current_user_id');
    setUser(null);
  }, []);

  // SSO 模式：进入系统即拉取用户信息，cookie 缺失时由网关自动跳转
  useEffect(() => {
    getUserInfo()
      .then((info) => {
        setUser(info);
        sessionStorage.setItem('current_user', info.name ?? info.username ?? '');
        sessionStorage.setItem('current_user_id', info.openId);
      })
      .catch(() => {
        // 保留现有 session 数据，不阻断渲染
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;
