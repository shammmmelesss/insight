import React, { useState } from 'react';
import { Button, Popover } from 'antd';
import { CalendarOutlined as CalendarIcon } from '@ant-design/icons';
import DateRangeFilterPicker, { DateRangeFilterValue, resolvedRangeLabel } from '../../components/DateRangeFilterPicker/DateRangeFilterPicker';

// 字段设置弹窗内的日期区间默认值选择触发器
const ChartDateRangePickerTrigger: React.FC<{ value: DateRangeFilterValue; onChange: (val: DateRangeFilterValue) => void }> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomLeft"
      overlayInnerStyle={{ padding: 0 }}
      content={
        <DateRangeFilterPicker
          value={value}
          onChange={(val) => { onChange(val); setOpen(false); }}
          onCancel={() => setOpen(false)}
        />
      }
    >
      <Button icon={<CalendarIcon />} style={{ width: '100%', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {resolvedRangeLabel(value)}
      </Button>
    </Popover>
  );
};

export default ChartDateRangePickerTrigger;
