import type { RenderContext, ChartDatum } from './context';
import { showMessage } from './context';

// 渲染饼图
export const renderPieChart = (ctx: RenderContext) => {
  const {
    container, chartData, measureFields, groupFields,
    formatValue, getActualField, buildFormatLookup, createAndRenderG2Chart,
  } = ctx;

  if (chartData.length === 0) {
    showMessage(container, '暂无数据');
    return;
  }

  // 获取数据中的实际字段名
  const dataFields = Object.keys(chartData[0]);

  // 处理度量字段 - 安全检查
  let actualMeasureField = '';
  if (Array.isArray(measureFields) && measureFields.length > 0 && measureFields[0]) {
    actualMeasureField = getActualField(measureFields[0], dataFields);
  }

  // 处理分组字段 - 安全检查
  let actualGroupField = '';
  if (Array.isArray(groupFields) && groupFields.length > 0 && groupFields[0]) {
    actualGroupField = getActualField(groupFields[0], dataFields);
  }

  // 校验核心字段是否存在
  if (!actualMeasureField || !actualGroupField) {
    showMessage(container, '请配置有效的度量字段和分组字段');
    return;
  }

  // 数据清洗函数，确保度量值为数值类型
  const cleanPieChartData = (data: ChartDatum[], measureField: string) =>
    data.map(item => ({
      ...item,
      [measureField]: Number(item[measureField]) || 0, // 非数值转0，避免渲染异常
    })).filter(item => !isNaN(item[measureField]) && item[measureField] > 0); // 过滤NaN和非正值数据

  const cleanedData = cleanPieChartData(chartData, actualMeasureField);

  if (cleanedData.length === 0) {
    showMessage(container, '度量字段无有效数值');
    return;
  }

  const measureFormatLookup = buildFormatLookup(measureFields, dataFields);

  createAndRenderG2Chart((chart) => {
    chart.coordinate({ type: 'theta', outerRadius: 0.8 });

    chart
      .interval()
      .data(cleanedData)
      .transform({ type: 'stackY' })
      .encode('y', actualMeasureField)
      .encode('color', actualGroupField)
      .legend('color', { position: 'bottom', layout: { justifyContent: 'center' } })
      .label({
        position: 'outside',
        text: (d: any) => {
          const total = cleanedData.reduce((sum, item) => sum + (item[actualMeasureField] || 0), 0);
          const value = d[actualMeasureField] || 0;
          const percentage = ((value / total) * 100).toFixed(0);
          return `${d[actualGroupField]}: ${percentage}%`;
        },
      })
      .tooltip((d: any) => {
        const total = cleanedData.reduce((sum, item) => sum + (item[actualMeasureField] || 0), 0);
        const value = d[actualMeasureField] || 0;
        const percentage = ((value / total) * 100).toFixed(2);
        return {
          name: d[actualGroupField],
          value: formatValue(value, measureFormatLookup[actualMeasureField]),
          percentage: `${percentage}%`,
        };
      });
  });
};
