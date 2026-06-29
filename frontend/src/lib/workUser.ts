import axios from 'axios';

export interface WorkUser {
  openId: string;
  name: string;
  avatar?: string;
}

export const MOCK_USERS: WorkUser[] = [
  { openId: 'mock_user_1', name: '张三' },
  { openId: 'mock_user_2', name: '李四' },
  { openId: 'mock_user_3', name: '王五' },
  { openId: 'mock_user_4', name: '赵六' },
];

export const isDev =
  typeof location !== 'undefined' &&
  (location.hostname === 'localhost' || location.hostname === '127.0.0.1');


/**
 * 按关键词搜索用户
 * 生产：通过后端 /api/lark/work-users 代理（避免 CORS，转发 Cookie 认证）
 * 开发：本地过滤 MOCK 数据
 */
export async function searchWorkUsers(keyword: string): Promise<WorkUser[]> {
  if (!keyword) return [];
  if (isDev) {
    const kw = keyword.toLowerCase();
    return MOCK_USERS.filter(
      (u) => u.name.toLowerCase().includes(kw) || u.openId.toLowerCase().includes(kw),
    );
  }
  const res = await axios.get('/api/lark/work-users', { params: { keyword } });
  const list: any[] = res.data?.data?.userList || [];
  return list
    .map((u: any) => ({
      openId: u.feishu_userid || u.userid || u.id,
      name: u.name,
      avatar: u.avatar,
    }))
    .filter((u) => u.openId);
}

