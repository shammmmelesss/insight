import React from 'react';
import { Button, Tooltip } from 'antd';
import { SettingOutlined, DeleteOutlined } from '@ant-design/icons';
import type { FieldConfig } from './types';

interface FieldTagProps {
  field: FieldConfig;
  area: string;
  index: number;
  onSettings: (field: FieldConfig, area: string) => void;
  onRemove: (area: string, originalName: string) => void;
  showAggregation?: boolean;
  onReorderDragStart: (e: React.DragEvent, area: string, index: number) => void;
  insertBefore?: boolean;
  insertAfter?: boolean;
}

// 已配置区域中的单个字段标签（可拖拽排序、设置、移除）
const FieldTag: React.FC<FieldTagProps> = ({
  field, area, index, onSettings, onRemove, showAggregation,
  onReorderDragStart, insertBefore, insertAfter,
}) => {
  const aggLabel = field.config?.aggregation;
  return (
    <div style={{ position: 'relative' }}>
      {insertBefore && (
        <div style={{ height: 2, backgroundColor: '#1677ff', borderRadius: 1, marginBottom: 2 }} />
      )}
      <div
        draggable
        onDragStart={(e) => { e.stopPropagation(); onReorderDragStart(e, area, index); }}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '3px 8px',
          backgroundColor: '#f0f5ff',
          border: '1px solid #adc6ff',
          borderRadius: 4,
          fontSize: 12,
          color: '#2f54eb',
          width: '100%',
          boxSizing: 'border-box',
          cursor: 'grab',
        }}
      >
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {field.displayName || field.originalName}
          {showAggregation && aggLabel && (
            <span style={{ color: '#8c8c8c', marginLeft: 4, fontWeight: 400 }}>· {aggLabel}</span>
          )}
        </span>
        <Tooltip title="字段设置">
          <Button
            size="small"
            type="text"
            icon={<SettingOutlined />}
            style={{ color: '#595959', padding: 0, minWidth: 'auto', height: 'auto', flexShrink: 0 }}
            onClick={(e) => { e.stopPropagation(); onSettings(field, area); }}
          />
        </Tooltip>
        <Tooltip title="移除">
          <Button
            size="small"
            type="text"
            icon={<DeleteOutlined />}
            style={{ color: '#ff4d4f', padding: 0, minWidth: 'auto', height: 'auto', flexShrink: 0 }}
            onClick={(e) => { e.stopPropagation(); onRemove(area, field.originalName); }}
          />
        </Tooltip>
      </div>
      {insertAfter && (
        <div style={{ height: 2, backgroundColor: '#1677ff', borderRadius: 1, marginTop: 2 }} />
      )}
    </div>
  );
};

export default FieldTag;
