import React from 'react';
import { Modal, Select } from 'antd';
import type { FieldConfig, AreaFieldEdit } from './types';

interface AreaSettingsModalProps {
  open: boolean;
  areaKey: string;
  areaFields: FieldConfig[];
  tempAreaFieldEdits: Record<string, AreaFieldEdit>;
  setTempAreaFieldEdits: React.Dispatch<React.SetStateAction<Record<string, AreaFieldEdit>>>;
  selectedAreaRows: Set<string>;
  setSelectedAreaRows: React.Dispatch<React.SetStateAction<Set<string>>>;
  updateAreaFieldConfig: (name: string, configPatch: Partial<NonNullable<FieldConfig['config']>>) => void;
  onCancel: () => void;
  onOk: () => void;
}

const thStyle: React.CSSProperties = { padding: '8px 10px', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', textAlign: 'left', borderBottom: '1px solid var(--border-secondary)', backgroundColor: '#F8FAFC', whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'middle', borderBottom: '1px solid var(--border-secondary)' };

// 区域字段批量设置弹窗（勾选多行后统一设置聚合/格式/排序/筛选器类型）
const AreaSettingsModal: React.FC<AreaSettingsModalProps> = ({
  open, areaKey, areaFields, tempAreaFieldEdits, setTempAreaFieldEdits,
  selectedAreaRows, setSelectedAreaRows, updateAreaFieldConfig, onCancel, onOk,
}) => {
  const isFilter = areaKey === 'filter';
  const isMeasureArea = ['measure', 'yAxis', 'y2Axis', 'indicator'].includes(areaKey);
  const allChecked = areaFields.every(f => selectedAreaRows.has(f.originalName));
  const someChecked = areaFields.some(f => selectedAreaRows.has(f.originalName));

  const applyToSelected = (configPatch: Partial<NonNullable<FieldConfig['config']>>) => {
    setTempAreaFieldEdits(prev => {
      const next = { ...prev };
      selectedAreaRows.forEach(name => {
        next[name] = { ...next[name], config: { ...next[name]?.config, ...configPatch } };
      });
      return next;
    });
  };

  return (
    <Modal
      title="批量字段设置"
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      okText="确定"
      cancelText="取消"
      width={620}
      styles={{ body: { padding: '12px 0 0' } }}
    >
      {someChecked && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', backgroundColor: 'var(--primary-bg)', borderBottom: '1px solid #BFDBFE', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 500, marginRight: 4 }}>
            已选 {selectedAreaRows.size} 项，设置：
          </span>
          {isMeasureArea && (
            <>
              <Select
                size="small"
                placeholder="聚合方式"
                style={{ width: 110 }}
                onChange={v => applyToSelected({ aggregation: v })}
                options={[
                  { label: '求和', value: '求和' },
                  { label: '平均值', value: '平均值' },
                  { label: '最大值', value: '最大值' },
                  { label: '最小值', value: '最小值' },
                  { label: '计数', value: '计数' },
                  { label: '去重计数', value: '去重计数' },
                ]}
              />
              <Select
                size="small"
                placeholder="数据格式"
                style={{ width: 110 }}
                onChange={v => applyToSelected({ dataFormat: v })}
                options={[
                  { label: '原始值', value: '原始值' },
                  { label: '整数', value: '整数' },
                  { label: '1位小数', value: '1位小数' },
                  { label: '2位小数', value: '2位小数' },
                  { label: '百分比', value: '百分比' },
                  { label: '自定义', value: '自定义' },
                ]}
              />
            </>
          )}
          {!isFilter && (
            <Select
              size="small"
              placeholder="排序"
              style={{ width: 90 }}
              onChange={v => applyToSelected({ sort: v })}
              options={[
                { label: '升序', value: '升序' },
                { label: '降序', value: '降序' },
              ]}
            />
          )}
          {isFilter && (
            <Select
              size="small"
              placeholder="筛选器类型"
              style={{ width: 120 }}
              onChange={v => applyToSelected({ filterType: v, filterDefault: [] })}
              options={[
                { label: '多选', value: 'multiple' },
                { label: '单选', value: 'single' },
                { label: '日期区间', value: 'dateRange' },
              ]}
            />
          )}
        </div>
      )}
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: 36 }} />
          <col style={{ width: 120 }} />
          {isMeasureArea && <col style={{ width: 120 }} />}
          {isMeasureArea && <col style={{ width: 140 }} />}
          {!isFilter && <col style={{ width: 110 }} />}
          {isFilter && <col style={{ width: 140 }} />}
        </colgroup>
        <thead>
          <tr>
            <th style={thStyle}>
              <input
                type="checkbox"
                checked={allChecked}
                ref={el => { if (el) el.indeterminate = !allChecked && someChecked; }}
                onChange={() => {
                  if (allChecked) setSelectedAreaRows(new Set());
                  else setSelectedAreaRows(new Set(areaFields.map(f => f.originalName)));
                }}
              />
            </th>
            <th style={thStyle}>字段名称</th>
            {isMeasureArea && <th style={thStyle}>聚合方式</th>}
            {isMeasureArea && <th style={thStyle}>数据格式</th>}
            {!isFilter && <th style={thStyle}>排序</th>}
            {isFilter && <th style={thStyle}>筛选器类型</th>}
          </tr>
        </thead>
        <tbody>
          {areaFields.map(field => {
            const edit = tempAreaFieldEdits[field.originalName] || {};
            const cfg = edit.config || {};
            const checked = selectedAreaRows.has(field.originalName);
            return (
              <tr key={field.originalName} style={{ backgroundColor: checked ? '#fff' : '#F8FAFC' }}>
                <td style={tdStyle}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => setSelectedAreaRows(prev => {
                      const next = new Set(prev);
                      if (next.has(field.originalName)) next.delete(field.originalName);
                      else next.add(field.originalName);
                      return next;
                    })}
                  />
                </td>
                <td style={{ ...tdStyle, fontSize: 12, color: 'var(--text-secondary)' }}>{field.displayName || field.originalName}</td>
                {isMeasureArea && (
                  <td style={tdStyle}>
                    <Select
                      size="small"
                      style={{ width: '100%' }}
                      value={cfg.aggregation || '计数'}
                      onChange={v => updateAreaFieldConfig(field.originalName, { aggregation: v })}
                      options={[
                        { label: '求和', value: '求和' },
                        { label: '平均值', value: '平均值' },
                        { label: '最大值', value: '最大值' },
                        { label: '最小值', value: '最小值' },
                        { label: '计数', value: '计数' },
                        { label: '去重计数', value: '去重计数' },
                      ]}
                    />
                  </td>
                )}
                {isMeasureArea && (
                  <td style={tdStyle}>
                    <Select
                      size="small"
                      style={{ width: '100%' }}
                      value={cfg.dataFormat || '原始值'}
                      onChange={v => updateAreaFieldConfig(field.originalName, { dataFormat: v })}
                      options={[
                        { label: '原始值', value: '原始值' },
                        { label: '整数', value: '整数' },
                        { label: '1位小数', value: '1位小数' },
                        { label: '2位小数', value: '2位小数' },
                        { label: '百分比', value: '百分比' },
                        // { label: '自定义', value: '自定义' },
                      ]}
                    />
                  </td>
                )}
                {!isFilter && (
                  <td style={tdStyle}>
                    <Select
                      size="small"
                      style={{ width: '100%' }}
                      value={cfg.sort || '升序'}
                      onChange={v => updateAreaFieldConfig(field.originalName, { sort: v })}
                      options={[
                        { label: '升序', value: '升序' },
                        { label: '降序', value: '降序' },
                      ]}
                    />
                  </td>
                )}
                {isFilter && (
                  <td style={tdStyle}>
                    <Select
                      size="small"
                      style={{ width: '100%' }}
                      value={cfg.filterType || 'multiple'}
                      onChange={v => updateAreaFieldConfig(field.originalName, { filterType: v, filterDefault: [] })}
                      options={[
                        { label: '多选', value: 'multiple' },
                        { label: '单选', value: 'single' },
                        { label: '日期区间', value: 'dateRange' },
                      ]}
                    />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Modal>
  );
};

export default AreaSettingsModal;
