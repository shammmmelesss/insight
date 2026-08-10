import React from 'react';
import { Modal, Button, Input, Select, Radio, Switch } from 'antd';
import { DateRangeFilterValue, DEFAULT_DATE_RANGE_VALUE } from '../../components/DateRangeFilterPicker/DateRangeFilterPicker';
import type { ChartType } from '@shared/api.interface';
import type { FieldConfig, TempFieldConfig } from './types';
import ChartDateRangePickerTrigger from './DateRangePickerTrigger';

const { Option } = Select;

interface FieldSettingsModalProps {
  open: boolean;
  currentField: (FieldConfig & { area?: string }) | null;
  tempFieldConfig: TempFieldConfig;
  setTempFieldConfig: React.Dispatch<React.SetStateAction<TempFieldConfig>>;
  chartType: ChartType;
  filterFieldOptions: Record<string, string[]>;
  selectedDataset: string;
  onCancel: () => void;
  onSave: () => void;
}

// 单字段设置弹窗（聚合方式 / 数据格式 / 排序 / 筛选器类型与默认值）
const FieldSettingsModal: React.FC<FieldSettingsModalProps> = ({
  open, currentField, tempFieldConfig, setTempFieldConfig, chartType,
  filterFieldOptions, selectedDataset, onCancel, onSave,
}) => {
  const showAggregation = currentField && (
    currentField.type !== 'dimension' ||
    currentField.area === 'measure' ||
    currentField.area === 'yAxis' ||
    currentField.area === 'y2Axis' ||
    currentField.area === 'indicator'
  );

  const showDataFormat = currentField && (
    (chartType === 'crossTable' && currentField.area === 'measure') ||
    ((chartType === 'bar' || chartType === 'line') && currentField.area === 'yAxis') ||
    (chartType === 'dualAxis' && (currentField.area === 'yAxis' || currentField.area === 'y2Axis')) ||
    (chartType === 'pie' && currentField.area === 'measure') ||
    (chartType === 'indicator' && currentField.area === 'indicator')
  );

  return (
    <Modal
      title="字段设置"
      open={open}
      onCancel={onCancel}
      footer={null}
      width={480}
    >
      {currentField && (
        <div style={{ paddingTop: 8 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>字段名称</div>
            <Input value={currentField.displayName || currentField.originalName} disabled />
          </div>

          {currentField.area === 'filter' ? (
            <>
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>筛选器类型</div>
                <Radio.Group
                  value={tempFieldConfig.filterType || 'multiple'}
                  onChange={(e) => setTempFieldConfig(p => ({ ...p, filterType: e.target.value, filterDefault: e.target.value === 'dateRange' ? DEFAULT_DATE_RANGE_VALUE : [] }))}
                >
                  <Radio value="multiple">多选</Radio>
                  <Radio value="single">单选</Radio>
                  <Radio value="dateRange">日期区间</Radio>
                </Radio.Group>
              </div>

              {tempFieldConfig.filterType !== 'dateRange' && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>排除模式</div>
                  <Switch
                    checked={!!tempFieldConfig.filterExclude}
                    onChange={(checked) => setTempFieldConfig(p => ({ ...p, filterExclude: checked }))}
                  />
                  <span style={{ marginLeft: 8, color: '#8c8c8c', fontSize: 12 }}>开启后仅排除所选值（NOT IN）</span>
                </div>
              )}

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>筛选默认值</div>
                {tempFieldConfig.filterType === 'dateRange' ? (
                  <ChartDateRangePickerTrigger
                    value={(tempFieldConfig.filterDefault && typeof tempFieldConfig.filterDefault === 'object' && 'startType' in tempFieldConfig.filterDefault)
                      ? tempFieldConfig.filterDefault as DateRangeFilterValue
                      : DEFAULT_DATE_RANGE_VALUE}
                    onChange={(val) => setTempFieldConfig(p => ({ ...p, filterDefault: val }))}
                  />
                ) : (
                  <Select
                    style={{ width: '100%' }}
                    mode={tempFieldConfig.filterType === 'single' ? undefined : 'multiple'}
                    value={tempFieldConfig.filterDefault}
                    onChange={(v) => setTempFieldConfig(p => ({ ...p, filterDefault: v }))}
                    allowClear
                    placeholder="请选择默认值"
                  >
                    {(filterFieldOptions[`${selectedDataset}:${currentField.originalName}`] || []).map((val: string) => (
                      <Option key={String(val)} value={String(val)}>{String(val)}</Option>
                    ))}
                  </Select>
                )}
              </div>
            </>
          ) : (
            <>
              {showAggregation && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>聚合方式</div>
                  <Select
                    value={tempFieldConfig.aggregation}
                    style={{ width: '100%' }}
                    onChange={(v) => setTempFieldConfig(p => ({ ...p, aggregation: v }))}
                  >
                    <Option value="求和">求和</Option>
                    <Option value="平均值">平均值</Option>
                    <Option value="最大值">最大值</Option>
                    <Option value="最小值">最小值</Option>
                    <Option value="计数">计数</Option>
                    <Option value="去重计数">去重计数</Option>
                  </Select>
                </div>
              )}

              {showDataFormat && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>数据格式</div>
                  <Select
                    value={tempFieldConfig.dataFormat}
                    style={{ width: '100%' }}
                    onChange={(v) => setTempFieldConfig(p => ({ ...p, dataFormat: v }))}
                  >
                    <Option value="原始值">原始值</Option>
                    <Option value="整数">整数</Option>
                    <Option value="1位小数">1位小数</Option>
                    <Option value="2位小数">2位小数</Option>
                    <Option value="百分比">百分比</Option>
                    <Option value="千分比">千分比</Option>
                  </Select>
                </div>
              )}

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>排序</div>
                <Select
                  value={tempFieldConfig.sort}
                  style={{ width: '100%' }}
                  onChange={(v) => setTempFieldConfig(p => ({ ...p, sort: v }))}
                >
                  <Option value="升序">升序</Option>
                  <Option value="降序">降序</Option>
                </Select>
              </div>
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
            <Button onClick={onCancel}>取消</Button>
            <Button type="primary" onClick={onSave}>确定</Button>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default FieldSettingsModal;
