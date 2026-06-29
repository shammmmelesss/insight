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

const WORK_USER_API = 'https://work.learnings.ai/work/v1/user';

function mapWorkUserList(list: any[]): WorkUser[] {
  return list
    .map((u: any) => ({
      openId: u.feishu_userid || u.userid || u.id,
      name: u.name,
      avatar: u.avatar,
    }))
    .filter((u: WorkUser) => u.openId);
}

/**
 * 按关键词搜索用户
 * 生产：直接调 work.learnings.ai（浏览器自动携带该域 Cookie，withCredentials）
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
  const res = await axios.get(WORK_USER_API, { params: { keyword }, withCredentials: true });
  return mapWorkUserList(res.data?.data?.userList || []);
}

/**
 * 拉取全量用户列表，用于 UserContext 识别当前登录用户
 */
export async function fetchWorkUsers(keyword?: string): Promise<WorkUser[]> {
  if (isDev) {
    if (!keyword) return MOCK_USERS;
    const kw = keyword.toLowerCase();
    return MOCK_USERS.filter(
      (u) => u.name.toLowerCase().includes(kw) || u.openId.toLowerCase().includes(kw),
    );
  }
  const params: Record<string, string> = {};
  if (keyword) params.keyword = keyword;
  const res = await axios.get(WORK_USER_API, { params, withCredentials: true });
  return mapWorkUserList(res.data?.data?.userList || []);
}
