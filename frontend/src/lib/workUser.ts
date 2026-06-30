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

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分钟

let allUsersCache: WorkUser[] | null = null;
let cacheExpireAt = 0;
let fetchPromise: Promise<WorkUser[]> | null = null;

/** 拉取全量用户列表（5 分钟 TTL 缓存） */
export async function fetchAllWorkUsers(): Promise<WorkUser[]> {
  if (allUsersCache && Date.now() < cacheExpireAt) return allUsersCache;
  if (isDev) {
    allUsersCache = MOCK_USERS;
    cacheExpireAt = Date.now() + CACHE_TTL_MS;
    return MOCK_USERS;
  }
  if (!fetchPromise) {
    fetchPromise = axios
      .get(WORK_USER_API, { withCredentials: true })
      .then((res) => {
        const list: any[] = res.data?.data?.userList || [];
        const users = list
          .map((u: any) => ({
            openId: u.feishu_userid || u.userid || u.id,
            name: u.name,
            avatar: u.avatar,
          }))
          .filter((u) => u.openId && u.name);
        allUsersCache = users;
        cacheExpireAt = Date.now() + CACHE_TTL_MS;
        return users;
      })
      .catch(() => {
        fetchPromise = null;
        return [];
      })
      .finally(() => {
        fetchPromise = null;
      });
  }
  return fetchPromise;
}

/** 本地按关键词过滤用户 */
export async function searchWorkUsers(keyword: string): Promise<WorkUser[]> {
  const all = await fetchAllWorkUsers();
  if (!keyword) return all;
  const kw = keyword.toLowerCase();
  return all.filter(
    (u) => u.name.toLowerCase().includes(kw) || u.openId.toLowerCase().includes(kw),
  );
}

