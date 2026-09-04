import type { RenderContext } from './context';
import { showMessage } from './context';

// 渲染指标卡
export const renderIndicatorCard = (ctx: RenderContext) => {
  const {
    container, chartData, indicatorFields,
    getFieldLabel, formatValue, getActualField, buildFormatLookup,
  } = ctx;

  if (chartData.length === 0 || indicatorFields.length === 0) {
    showMessage(container, '暂无数据');
    return;
  }

  const dataFields = Object.keys(chartData[0]);
  const row = chartData[0];
  const indicatorFormatLookup = buildFormatLookup(indicatorFields, dataFields);

  const cards = indicatorFields
    .map(field => {
      const actualField = getActualField(field, dataFields);
      return { label: getFieldLabel(actualField) || getFieldLabel(field), actualField };
    })
    .filter(({ actualField }) => actualField && actualField in row);

  if (cards.length === 0) {
    showMessage(container, '请配置有效的指标字段');
    return;
  }

  const cardHTML = cards.map(({ label, actualField }) => {
    const value = row[actualField];
    const display = value === null || value === undefined ? '-' : formatValue(value, indicatorFormatLookup[actualField]);
    return `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
        min-width:120px;padding:16px 24px;background:#f0f5ff;border-radius:8px;">
        <div style="font-size:13px;color:#6B7280;margin-bottom:8px;text-align:center;">${label}</div>
        <div style="font-size:32px;font-weight:700;color:#2563EB;line-height:1.2;">${display}</div>
      </div>`;
  }).join('');

  container.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:center;
      justify-content:center;width:100%;height:100%;padding:16px;box-sizing:border-box;">
      ${cardHTML}
    </div>`;
};
