import { Modal } from 'antd';
import { getCurrentUserId, getCurrentUserName } from './currentUser';

/** 敏感数据下载警示语，弹窗与 CSV 末尾复用 */
export const SENSITIVE_DOWNLOAD_WARNING =
  '本次下载包含业务敏感数据，仅限工作使用，严禁转发、外泄、泄露给无关人员。违规将追究责任，包括纪律处分、解除劳动合同，情节严重将追究法律责任。';

/** 下载前弹出确认框，用户点击「确认下载」返回 true，取消返回 false */
export function confirmSensitiveDownload(): Promise<boolean> {
  return new Promise((resolve) => {
    Modal.confirm({
      title: '数据下载确认',
      content: SENSITIVE_DOWNLOAD_WARNING,
      okText: '确认下载',
      cancelText: '取消',
      okButtonProps: { danger: true },
      width: 480,
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}

/** 生成本地时间字符串 YYYY-MM-DD HH:mm */
function formatNow(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 在 CSV 文本末尾追加溯源行 + 警示语 */
export function appendWatermark(csv: string): string {
  const name = getCurrentUserName() || '未知用户';
  const id = getCurrentUserId();
  const who = id ? `${name}(${id})` : name;
  const trace = `# 下载人: ${who}  时间: ${formatNow()}  仅供内部使用`;
  return `${csv}\n${trace}\n# ${SENSITIVE_DOWNLOAD_WARNING}`;
}

/**
 * 敏感 CSV 下载统一入口：先弹确认框，确认后追加溯源水印并触发下载。
 * @param csv   已拼好的 CSV 正文（不含 BOM）
 * @param fileName 文件名（不含 .csv 后缀）
 */
export async function downloadSensitiveCsv(csv: string, fileName: string): Promise<void> {
  const ok = await confirmSensitiveDownload();
  if (!ok) return;
  const blob = new Blob([`﻿${appendWatermark(csv)}`], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.download = `${fileName}.csv`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}
