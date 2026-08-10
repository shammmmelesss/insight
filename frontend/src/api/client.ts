import axios from 'axios';

/**
 * 全局 API 客户端。
 *
 * 说明：历史代码大量直接以 `/api/...` 绝对路径调用全局 axios，因此这里对
 * 全局 axios 实例统一注册请求拦截器（此前分散在 AuthContext 与
 * WorkspaceContext 两处，顺序敏感且难以测试）。本模块必须在应用入口最先导入一次，
 * 保证所有请求都带上正确的鉴权 / 工作空间 header。
 */

let interceptorsInstalled = false;

export function installInterceptors() {
  if (interceptorsInstalled) return;
  interceptorsInstalled = true;

  axios.interceptors.request.use((config) => {
    const url = config.url || '';
    // 外部域名调用不注入内部 header，避免触发 CORS preflight 被拒
    if (url.startsWith('http')) return config;

    const userId = sessionStorage.getItem('current_user_id');
    const userName = sessionStorage.getItem('current_user');
    if (userId) config.headers['X-User-Id'] = userId;
    if (userName) config.headers['X-User-Name'] = encodeURIComponent(userName);

    const wsId = localStorage.getItem('currentWorkspaceId');
    if (wsId) config.headers['X-Workspace-Id'] = wsId;

    return config;
  });
}

// 模块加载即安装，保证在任何组件渲染 / 发起请求之前生效
installInterceptors();

/** 解包后端可能存在的 { data: ... } 信封结构。 */
export function unwrap<T = unknown>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export const api = axios;
export default api;
