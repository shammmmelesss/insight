import { Watermark } from 'antd';
import type { ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { isEmbedMode } from '@/utils/embed';

/** 取邮箱 @ 前的前缀，无邮箱时回退到 username / openId */
function emailPrefix(user: { email?: string; username?: string; openId?: string }): string {
  const raw = user.email || user.username || user.openId || '';
  return raw.includes('@') ? raw.split('@')[0] : raw;
}

/**
 * 全局水印：整个系统覆盖当前登录用户的「名字 + 邮箱前缀」，用于溯源。
 */
export default function GlobalWatermark({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  // 嵌入模式：由宿主系统负责水印，这里不再叠加全局水印
  if (isEmbedMode()) {
    return <>{children}</>;
  }

  const content = user
    ? [user.name, emailPrefix(user)].filter(Boolean).join(' ')
    : undefined;

  return (
    <Watermark
      content={content}
      font={{ fontSize: 14, color: 'rgba(0, 0, 0, 0.08)' }}
      gap={[120, 120]}
      style={{ height: '100vh' }}
    >
      {children}
    </Watermark>
  );
}
