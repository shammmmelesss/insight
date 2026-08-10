import api, { unwrap } from '@/api/client';

export interface UserInfo {
  openId: string;
  name: string;
  username?: string;
  avatar?: string;
}

const isDev =
  typeof location !== 'undefined' &&
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1');

export const MOCK_USER: UserInfo = { openId: 'mock_user_1', name: '张三' };

export async function getUserInfo(): Promise<UserInfo> {
  if (isDev) return MOCK_USER;
  const res = await api.get('/api/me');
  const u = unwrap<Record<string, string>>(res.data);
  if (!u) throw new Error('No user data');
  return {
    openId: u.feishu_userid || u.userid || u.id || '',
    name: u.name || u.username || '',
    username: u.username,
    avatar: u.avatar,
  };
}
