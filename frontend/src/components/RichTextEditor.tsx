import React from 'react';
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import './RichTextEditor.css';

interface RichTextEditorProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

// 富文本编辑器工具栏配置
const modules = {
  toolbar: [
    [{ header: [1, 2, 3, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    [{ color: [] }, { background: [] }],
    [{ list: 'ordered' }, { list: 'bullet' }],
    [{ align: [] }],
    ['link'],
    ['clean'],
  ],
};

const formats = [
  'header',
  'bold', 'italic', 'underline', 'strike',
  'color', 'background',
  'list',
  'align',
  'link',
];

// 看板上的文本组件富文本编辑器，内容以 HTML 字符串形式存于布局项的 text 字段
const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, placeholder }) => {
  return (
    <div className="insight-rich-text-editor" onMouseDown={e => e.stopPropagation()}>
      <ReactQuill
        theme="snow"
        value={value || ''}
        onChange={onChange}
        placeholder={placeholder}
        modules={modules}
        formats={formats}
      />
    </div>
  );
};

export default RichTextEditor;
