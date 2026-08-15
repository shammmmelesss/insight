// 当前登录用户工具：与 api/client.ts 的请求头保持一致，均取自 sessionStorage
export function getCurrentUserId(): string {
  return sessionStorage.getItem('current_user_id') || '';
}

export function getCurrentUserName(): string {
  return sessionStorage.getItem('current_user') || '';
}

// canModifyRecord 判断当前用户是否可以修改/删除某条记录
// 规则：createdBy 为空（历史数据无归属）时放开；否则必须是创建人本人。
// 兼容历史上以「用户名」存储 createdBy 的数据。
export function canModifyRecord(createdBy?: string): boolean {
  if (!createdBy) return true;
  const uid = getCurrentUserId();
  const uname = getCurrentUserName();
  return createdBy === uid || (!!uname && createdBy === uname);
}

// displayCreator 优先展示姓名，回退到旧数据中的 createdBy 原始值
export function displayCreator(name?: string, raw?: string): string {
  return name || raw || '-';
}
