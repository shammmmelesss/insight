import React, { useState } from 'react';
import { Button, InputNumber, Calendar, ConfigProvider } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import 'dayjs/locale/zh-cn';
import zhCN from 'antd/locale/zh_CN';
import type { CalendarProps } from 'antd';

dayjs.locale('zh-cn');

export interface DateRangeFilterValue {
  startType: 'dynamic' | 'static';
  startDynamic: number;
  startStatic: Dayjs | null;
  endType: 'dynamic' | 'static';
  endDynamic: number;
  endStatic: Dayjs | null;
  presetId?: string;
}

const toDayjs = (v: Dayjs | string | null | undefined, fallback: Dayjs): Dayjs => {
  if (!v) return fallback;
  if (dayjs.isDayjs(v)) return v;
  const d = dayjs(v as string);
  return d.isValid() ? d : fallback;
};

export function resolveDateRangeValue(value: DateRangeFilterValue): [Dayjs, Dayjs] {
  const start =
    value.startType === 'dynamic'
      ? dayjs().subtract(value.startDynamic, 'day').startOf('day')
      : toDayjs(value.startStatic, dayjs().startOf('day'));
  const end =
    value.endType === 'dynamic'
      ? dayjs().subtract(value.endDynamic, 'day').endOf('day')
      : toDayjs(value.endStatic, dayjs().endOf('day'));
  return [start, end];
}

export function resolvedRangeLabel(value: DateRangeFilterValue): string {
  const [s, e] = resolveDateRangeValue(value);
  // 起止同年时省略结束日期的年份，精简展示
  const end = s.year() === e.year() ? e.format('MM/DD') : e.format('YYYY/MM/DD');
  return `${s.format('YYYY/MM/DD')} ~ ${end}`;
}

interface Props {
  value?: DateRangeFilterValue;
  onChange: (value: DateRangeFilterValue) => void;
  onCancel?: () => void;
}

// Presets grouped in 2-column pairs
const PRESET_ROWS: { label: string; id: string; value: DateRangeFilterValue }[][] = [
  [
    { label: '昨日', id: 'yesterday', value: { startType: 'dynamic', startDynamic: 1, startStatic: null, endType: 'dynamic', endDynamic: 1, endStatic: null, presetId: 'yesterday' } },
    { label: '今日', id: 'today',     value: { startType: 'dynamic', startDynamic: 0, startStatic: null, endType: 'dynamic', endDynamic: 0, endStatic: null, presetId: 'today' } },
  ],
  [
    { label: '上周', id: 'last-week', value: { startType: 'dynamic', startDynamic: 14, startStatic: null, endType: 'dynamic', endDynamic: 8, endStatic: null, presetId: 'last-week' } },
    { label: '本周', id: 'this-week', value: { startType: 'dynamic', startDynamic: 6,  startStatic: null, endType: 'dynamic', endDynamic: 0, endStatic: null, presetId: 'this-week' } },
  ],
  [
    { label: '上月', id: 'last-month', value: { startType: 'dynamic', startDynamic: 60, startStatic: null, endType: 'dynamic', endDynamic: 31, endStatic: null, presetId: 'last-month' } },
    { label: '本月', id: 'this-month', value: { startType: 'dynamic', startDynamic: 29, startStatic: null, endType: 'dynamic', endDynamic: 0,  endStatic: null, presetId: 'this-month' } },
  ],
  [
    { label: '过去7天',  id: 'past-7',  value: { startType: 'dynamic', startDynamic: 7,  startStatic: null, endType: 'dynamic', endDynamic: 1, endStatic: null, presetId: 'past-7' } },
    { label: '最近7天',  id: 'last-7',  value: { startType: 'dynamic', startDynamic: 6,  startStatic: null, endType: 'dynamic', endDynamic: 0, endStatic: null, presetId: 'last-7' } },
  ],
  [
    { label: '过去30天', id: 'past-30', value: { startType: 'dynamic', startDynamic: 30, startStatic: null, endType: 'dynamic', endDynamic: 1, endStatic: null, presetId: 'past-30' } },
    { label: '最近30天', id: 'last-30', value: { startType: 'dynamic', startDynamic: 29, startStatic: null, endType: 'dynamic', endDynamic: 0, endStatic: null, presetId: 'last-30' } },
  ],
  [
    { label: '过去60天', id: 'past-60', value: { startType: 'dynamic', startDynamic: 60, startStatic: null, endType: 'dynamic', endDynamic: 1, endStatic: null, presetId: 'past-60' } },
    { label: '最近60天', id: 'last-60', value: { startType: 'dynamic', startDynamic: 59, startStatic: null, endType: 'dynamic', endDynamic: 0, endStatic: null, presetId: 'last-60' } },
  ],
  [
    { label: '从某日至昨日', id: 'to-yesterday', value: { startType: 'static', startDynamic: 0, startStatic: null, endType: 'dynamic', endDynamic: 1, endStatic: null, presetId: 'to-yesterday' } },
  ],
  [
    { label: '从某日至今日', id: 'to-today', value: { startType: 'static', startDynamic: 0, startStatic: null, endType: 'dynamic', endDynamic: 0, endStatic: null, presetId: 'to-today' } },
  ],
];

const ALL_PRESETS = PRESET_ROWS.flat();
export const DEFAULT_DATE_RANGE_VALUE: DateRangeFilterValue = ALL_PRESETS.find(p => p.id === 'past-7')!.value;
const DEFAULT_VALUE = DEFAULT_DATE_RANGE_VALUE;

export function resolvedPresetName(value: DateRangeFilterValue): string | null {
  if (!value.presetId) return null;
  return ALL_PRESETS.find(p => p.id === value.presetId)?.label ?? null;
}

const CAL_STYLE = `
.drfp-cal .ant-picker-calendar-date-value { display: none !important; }
.drfp-cal .ant-picker-calendar-date-content { height: auto !important; overflow: visible !important; }
.drfp-cal .ant-picker-cell-inner.ant-picker-calendar-date { padding: 1px 0 !important; min-height: 0 !important; background: transparent !important; border: none !important; }
.drfp-cal .ant-picker-content th { font-size: 11px; color: var(--text-secondary); padding: 1px 0; }
.drfp-cal .ant-picker-content td { padding: 0 !important; }
.drfp-cal .ant-picker-panel { background: transparent; }
.drfp-cal .ant-picker-body { padding: 2px 6px !important; }
.drfp-cal .ant-picker-content { width: 100% !important; table-layout: fixed !important; }
.drfp-cal table { width: 100% !important; table-layout: fixed !important; }
`;

const DateRangeFilterPicker: React.FC<Props> = ({ value, onChange, onCancel }) => {
  const [draft, setDraft] = useState<DateRangeFilterValue>(() => value ?? DEFAULT_VALUE);
  const [error, setError] = useState<string | null>(null);

  const update = (patch: Partial<DateRangeFilterValue>) => {
    setError(null);
    setDraft(prev => ({ ...prev, ...patch, presetId: undefined }));
  };

  return (
    <ConfigProvider locale={zhCN}>
      <style>{CAL_STYLE}</style>
      <div style={{ display: 'flex', background: '#fff', borderRadius: 8, overflow: 'hidden', width: 620, maxWidth: 'calc(100vw - 16px)' }}>

        {/* 左侧预设 */}
        <div style={{ width: 128, borderRight: '1px solid var(--border-secondary)', padding: '10px 8px', flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {PRESET_ROWS.map((row, ri) => (
              <div key={ri} style={{ display: 'flex', gap: 3 }}>
                {row.map(p => (
                  <button
                    key={p.id}
                    onClick={() => setDraft(prev => {
                      const v = p.value;
                      const [resolvedStart] = resolveDateRangeValue(prev);
                      return {
                        ...v,
                        startStatic: v.startType === 'static' && v.startStatic == null ? resolvedStart.startOf('day') : v.startStatic,
                      };
                    })}
                    style={{
                      flex: 1,
                      padding: '3px 0',
                      fontSize: 11,
                      border: `1px solid ${p.id === draft.presetId ? 'var(--primary)' : 'var(--border)'}`,
                      borderRadius: 4,
                      cursor: 'pointer',
                      background: p.id === draft.presetId ? 'var(--primary)' : '#fff',
                      color: p.id === draft.presetId ? '#fff' : 'var(--text-secondary)',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.15s',
                    }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* 右侧：两列日历 */}
        <div style={{ flex: 1, padding: '10px 10px', display: 'flex', flexDirection: 'column' }}>

          {/* 预览头 */}
          {(() => {
            const [ps, pe] = resolveDateRangeValue(draft);
            const label = draft.presetId ? ALL_PRESETS.find(p => p.id === draft.presetId)?.label : null;
            return (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                background: '#f5f7ff',
                border: '1px solid #d4e0ff',
                borderRadius: 6,
                padding: '5px 10px',
                marginBottom: 10,
                fontSize: 12,
                color: 'var(--text)',
                minHeight: 28,
              }}>
                {label && (
                  <span style={{ color: 'var(--primary)', fontWeight: 600, marginRight: 4 }}>{label}</span>
                )}
                <span style={{ color: 'var(--primary)', fontWeight: 500 }}>{ps.format('YYYY/MM/DD')}</span>
                <span style={{ color: 'var(--text-secondary)', margin: '0 2px' }}>~</span>
                <span style={{ color: 'var(--primary)', fontWeight: 500 }}>{pe.format('YYYY/MM/DD')}</span>
                <span style={{ color: 'var(--text-secondary)', fontSize: 11 }}>（{pe.diff(ps, 'day') + 1} 天）</span>
              </div>
            );
          })()}

          <div style={{ display: 'flex', gap: 8, flex: 1 }}>
            <SidePanel
              type={draft.startType}
              dynamic={draft.startDynamic}
              staticDate={draft.startStatic}
              onTypeChange={t => update({
                startType: t,
                ...(t === 'static' && draft.startStatic == null
                  ? { startStatic: dayjs().subtract(draft.startDynamic, 'day').startOf('day') }
                  : {}),
                ...(t === 'dynamic' && draft.startStatic != null
                  ? { startDynamic: dayjs().startOf('day').diff(toDayjs(draft.startStatic, dayjs()).startOf('day'), 'day') }
                  : {}),
              })}
              onDynamicChange={n => update({ startDynamic: n })}
              onStaticChange={d => update({ startStatic: d })}
            />
            <div style={{ display: 'flex', alignItems: 'flex-start', paddingTop: 46, color: 'var(--text-tertiary)', fontSize: 14, flexShrink: 0 }}>→</div>
            <SidePanel
              type={draft.endType}
              dynamic={draft.endDynamic}
              staticDate={draft.endStatic}
              onTypeChange={t => update({
                endType: t,
                ...(t === 'static' && draft.endStatic == null
                  ? { endStatic: dayjs().subtract(draft.endDynamic, 'day').startOf('day') }
                  : {}),
                ...(t === 'dynamic' && draft.endStatic != null
                  ? { endDynamic: dayjs().startOf('day').diff(toDayjs(draft.endStatic, dayjs()).startOf('day'), 'day') }
                  : {}),
              })}
              onDynamicChange={n => update({ endDynamic: n })}
              onStaticChange={d => update({ endStatic: d })}
              minStaticDate={draft.startType === 'static' ? (draft.startStatic ?? undefined) : undefined}
            />
          </div>

          <div style={{ borderTop: '1px solid var(--border-secondary)', paddingTop: 10, marginTop: 10 }}>
            {error && <div style={{ color: 'var(--error)', fontSize: 11, marginBottom: 6, textAlign: 'right' }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button size="small" onClick={() => { setError(null); onCancel ? onCancel() : onChange(value ?? DEFAULT_VALUE); }}>取消</Button>
              <Button size="small" type="primary" onClick={() => {
                const [start, end] = resolveDateRangeValue(draft);
                if (end.isBefore(start, 'day')) {
                  setError('结束时间不能早于开始时间');
                  return;
                }
                onChange(draft);
              }}>应用</Button>
            </div>
          </div>
        </div>
      </div>
    </ConfigProvider>
  );
};

interface SidePanelProps {
  type: 'dynamic' | 'static';
  dynamic: number;
  staticDate: Dayjs | null;
  onTypeChange: (t: 'dynamic' | 'static') => void;
  onDynamicChange: (n: number) => void;
  onStaticChange: (d: Dayjs | null) => void;
  minStaticDate?: Dayjs;
}

const SidePanel: React.FC<SidePanelProps> = ({
  type, dynamic, staticDate,
  onTypeChange, onDynamicChange, onStaticChange, minStaticDate,
}) => {
  const selectedDate: Dayjs = type === 'dynamic'
    ? dayjs().subtract(dynamic ?? 0, 'day')
    : toDayjs(staticDate, dayjs());
  const [panelDate, setPanelDate] = useState<Dayjs>(() =>
    dayjs.isDayjs(selectedDate) ? selectedDate : dayjs()
  );

  const cellRender: CalendarProps<Dayjs>['cellRender'] = (date, info) => {
    if (info.type !== 'date') return null;
    const isSelected = date.isSame(selectedDate, 'day');
    const isToday = date.isSame(dayjs(), 'day');
    const isCurrentMonth = date.month() === panelDate.month();
    return (
      <div style={{
        width: 20,
        height: 20,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '50%',
        fontSize: 11,
        background: isSelected ? 'var(--primary)' : 'transparent',
        color: isSelected ? '#fff' : isToday ? 'var(--primary)' : isCurrentMonth ? 'var(--text)' : 'var(--text-tertiary)',
        fontWeight: isToday && !isSelected ? 700 : undefined,
        border: isToday && !isSelected ? '1px solid var(--primary)' : undefined,
      }}>
        {date.date()}
      </div>
    );
  };

  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {/* 动态/静态 toggle */}
      <div style={{ display: 'inline-flex', border: '1px solid #e0e0e0', borderRadius: 5, overflow: 'hidden', marginBottom: 6 }}>
        {(['dynamic', 'static'] as const).map(t => (
          <button
            key={t}
            onClick={() => onTypeChange(t)}
            style={{
              padding: '2px 10px',
              fontSize: 11,
              border: 'none',
              cursor: 'pointer',
              background: type === t ? 'var(--primary)' : '#fff',
              color: type === t ? '#fff' : 'var(--text-secondary)',
              transition: 'all 0.15s',
              lineHeight: '18px',
            }}
          >
            {t === 'dynamic' ? '动态时间' : '静态时间'}
          </button>
        ))}
      </div>

      {/* N 天前输入 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        {type === 'dynamic' ? (
          <>
            <InputNumber
              size="small"
              min={0}
              value={dynamic}
              onChange={v => {
                const n = v ?? 0;
                onDynamicChange(n);
                setPanelDate(dayjs().subtract(n, 'day'));
              }}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>天前</span>
          </>
        ) : (
          <div style={{ flex: 1, height: 24 }} />
        )}
      </div>

      {/* 内联日历 */}
      <div className="drfp-cal" style={{ border: '1px solid var(--border-secondary)', borderRadius: 6, overflow: 'hidden' }}>
        <Calendar
          fullscreen={false}
          value={panelDate}
          onSelect={type === 'static' ? (d) => {
            if (minStaticDate && d.isBefore(minStaticDate, 'day')) return;
            onStaticChange(d);
            setPanelDate(d);
          } : undefined}
          onPanelChange={(d) => setPanelDate(d)}
          cellRender={cellRender}
          disabledDate={minStaticDate ? (d) => d.isBefore(minStaticDate, 'day') : undefined}
          style={{ pointerEvents: type === 'dynamic' ? 'none' : undefined, opacity: type === 'dynamic' ? 0.7 : 1 }}
          headerRender={({ value: hv, onChange: hOnChange }) => (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', borderBottom: '1px solid var(--border-secondary)' }}>
              <button
                onClick={() => { const d = hv.subtract(1, 'month'); hOnChange(d); setPanelDate(d); }}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-secondary)', padding: '0 2px', lineHeight: 1 }}
              >‹</button>
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>
                {hv.format('YYYY年M月')}
              </span>
              <button
                onClick={() => { const d = hv.add(1, 'month'); hOnChange(d); setPanelDate(d); }}
                style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-secondary)', padding: '0 2px', lineHeight: 1 }}
              >›</button>
            </div>
          )}
        />
      </div>
    </div>
  );
};

export default DateRangeFilterPicker;
