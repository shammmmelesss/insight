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

/**
 * 按关键词搜索用户
 * 生产：浏览器直接携带 withCredentials 调 work.learnings.ai（两个子域共享 .learnings.ai cookie）
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
  const list: any[] = res.data?.data?.userList || [];
  return list
    .map((u: any) => ({
      openId: u.feishu_userid || u.userid || u.id,
      name: u.name,
      avatar: u.avatar,
    }))
    .filter((u) => u.openId);
}

