import React from 'react';
import DOMPurify from 'dompurify';
import 'react-quill-new/dist/quill.core.css';
import './RichTextView.css';

interface RichTextViewProps {
  html?: string;
  style?: React.CSSProperties;
}

// 判断内容是否为 HTML（富文本），否则按纯文本（历史数据）渲染并保留换行
const looksLikeHtml = (s: string) => /<[a-z][\s\S]*>/i.test(s);

// 看板展示态渲染文本组件内容：富文本经 DOMPurify 净化后渲染，历史纯文本按 pre-wrap 展示
const RichTextView: React.FC<RichTextViewProps> = ({ html, style }) => {
  const content = html || '';
  if (!looksLikeHtml(content)) {
    return (
      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 14, lineHeight: 1.6, ...style }}>
        {content}
      </div>
    );
  }
  const clean = DOMPurify.sanitize(content, { ADD_ATTR: ['target'] });
  return (
    <div
      className="ql-editor insight-rich-text-view"
      style={{ padding: 0, fontSize: 14, ...style }}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
};

export default RichTextView;
