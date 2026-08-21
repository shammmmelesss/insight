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
  const name = getCurrentUserName();
  const id = getCurrentUserId();
  // 拿不到当前用户（如跨源嵌入模式）时下载人留空，不再写死"未知用户"
  let who = '';
  if (name && id) who = `${name}(${id})`;
  else if (name) who = name;
  else if (id) who = id;
  const trace = `# 下载人: ${who}  时间: ${formatNow()}  仅供内部使用`;
  return `${csv}\n${trace}\n# ${SENSITIVE_DOWNLOAD_WARNING}`;
}

/** 追加水印、生成 blob 并触发浏览器下载。必须在用户手势的同步栈内调用。 */
function triggerCsvDownload(csv: string, fileName: string): void {
  const blob = new Blob([`﻿${appendWatermark(csv)}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileName}.csv`;
  link.rel = 'noopener';
  // 挂到 DOM 再点击：部分浏览器（尤其 iframe 内）要求 <a> 在文档树中才响应下载
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // 延后回收，避免点击尚未完成就吊销 blob URL
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 敏感 CSV 下载统一入口：先弹确认框，确认后追加溯源水印并触发下载。
 *
 * 关键：下载在弹窗的 onOk 回调里**同步**触发，而非 await 之后。跨源 iframe 嵌入时，
 * 浏览器要求程序化下载处于用户手势的同步执行栈内，否则会静默丢弃（无任何报错）——
 * 之前 `await confirm` 后再 click 正是踩了这个坑。
 * @param csv   已拼好的 CSV 正文（不含 BOM）
 * @param fileName 文件名（不含 .csv 后缀）
 */
export function downloadSensitiveCsv(csv: string, fileName: string): Promise<void> {
  return new Promise((resolve) => {
    Modal.confirm({
      title: '数据下载确认',
      content: SENSITIVE_DOWNLOAD_WARNING,
      okText: '确认下载',
      cancelText: '取消',
      okButtonProps: { danger: true },
      width: 480,
      onOk: () => {
        triggerCsvDownload(csv, fileName);
        resolve();
      },
      onCancel: () => resolve(),
    });
  });
}
