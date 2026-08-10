import React, { useState } from 'react';
import { Button } from 'antd';
import { DragOutlined } from '@ant-design/icons';
import type { FieldConfig } from './types';
import FieldTag from './FieldTag';

interface DropZoneProps {
  areaKey: string;
  label: string;
  fields: FieldConfig[];
  isOver: boolean;
  showAggregation?: boolean;
  onDragEnter: (e: React.DragEvent, area: string) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, area: string) => void;
  onSettings: (field: FieldConfig, area: string) => void;
  onAreaSettings?: (area: string) => void;
  onRemove: (area: string, originalName: string) => void;
  onReorder: (area: string, fromIndex: number, toIndex: number) => void;
}

// 单个字段拖放区域：支持从字段列表拖入、区域内拖拽重排序、批量设置
const DropZone: React.FC<DropZoneProps> = ({
  areaKey, label, fields, isOver, showAggregation,
  onDragEnter, onDragOver, onDragLeave, onDrop, onSettings, onAreaSettings, onRemove, onReorder,
}) => {
  const [reorderFromIndex, setReorderFromIndex] = useState<number | null>(null);
  const [insertIndex, setInsertIndex] = useState<number | null>(null);

  const handleReorderDragStart = (e: React.DragEvent, area: string, index: number) => {
    e.dataTransfer.setData('application/insight-reorder', JSON.stringify({ area, index }));
    e.dataTransfer.effectAllowed = 'move';
    setReorderFromIndex(index);
  };

  const handleItemDragOver = (e: React.DragEvent, index: number) => {
    if (reorderFromIndex === null) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    setInsertIndex(e.clientY < mid ? index : index + 1);
  };

  const handleZoneDrop = (e: React.DragEvent) => {
    const reorderData = e.dataTransfer.getData('application/insight-reorder');
    if (reorderData) {
      e.preventDefault();
      e.stopPropagation();
      const { area, index: fromIndex } = JSON.parse(reorderData);
      if (area === areaKey && insertIndex !== null && insertIndex !== fromIndex && insertIndex !== fromIndex + 1) {
        onReorder(areaKey, fromIndex, insertIndex);
      }
      setReorderFromIndex(null);
      setInsertIndex(null);
      return;
    }
    setReorderFromIndex(null);
    setInsertIndex(null);
    onDrop(e, areaKey);
  };

  const handleZoneDragLeave = (e: React.DragEvent) => {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      setReorderFromIndex(null);
      setInsertIndex(null);
      onDragLeave();
    }
  };

  const isReordering = reorderFromIndex !== null;

  return (
    <div
      style={{
        marginBottom: 10,
        border: '1px solid #f0f0f0',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '6px 10px',
          backgroundColor: '#fafafa',
          borderBottom: '1px solid #f0f0f0',
        }}
      >
        <span style={{ fontSize: 12, fontWeight: 500, color: '#595959', flex: 1 }}>{label}</span>
        {fields.length > 0 && onAreaSettings && (
          <Button
            size="small"
            type="link"
            style={{ fontSize: 12, padding: '0 4px', height: 'auto', color: '#1677ff' }}
            onClick={() => onAreaSettings(areaKey)}
          >
            设置
          </Button>
        )}
      </div>
      <div
        style={{
          minHeight: 44,
          padding: '8px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          border: isOver && !isReordering ? '2px dashed #4096ff' : '2px solid transparent',
          backgroundColor: isOver && !isReordering ? '#e6f4ff' : 'transparent',
          borderRadius: 4,
          transition: 'all 0.15s',
        }}
        onDragEnter={(e) => { if (!isReordering) onDragEnter(e, areaKey); }}
        onDragOver={(e) => { if (!isReordering) onDragOver(e); else e.preventDefault(); }}
        onDragLeave={handleZoneDragLeave}
        onDrop={handleZoneDrop}
      >
        {fields.length > 0 ? (
          fields.map((field, idx) => (
            <div
              key={field.originalName}
              onDragOver={(e) => handleItemDragOver(e, idx)}
            >
              <FieldTag
                field={field}
                area={areaKey}
                index={idx}
                onSettings={onSettings}
                onRemove={onRemove}
                showAggregation={showAggregation}
                onReorderDragStart={handleReorderDragStart}
                insertBefore={insertIndex === idx && reorderFromIndex !== null && reorderFromIndex !== idx}
                insertAfter={insertIndex === idx + 1 && reorderFromIndex !== null && reorderFromIndex !== idx}
              />
            </div>
          ))
        ) : (
          <div
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              color: '#bfbfbf',
              fontSize: 12,
              userSelect: 'none',
            }}
          >
            <DragOutlined style={{ fontSize: 12 }} />
            <span>拖入字段</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default DropZone;
