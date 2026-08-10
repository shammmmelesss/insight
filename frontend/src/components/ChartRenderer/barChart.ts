import type { RenderContext, ChartDatum } from './context';
import { showMessage } from './context';

// 渲染柱状图
export const renderBarChart = (ctx: RenderContext) => {
  const {
    container, chartData, xAxisFields, yAxisFields, groupFields,
    getFieldLabel, formatValue, formatAxisValue, getActualField, buildFormatLookup,
    createAndRenderG2Chart,
  } = ctx;

  if (chartData.length === 0) {
    showMessage(container, '暂无数据');
    return;
  }

  const dataFields = Object.keys(chartData[0]);

  // 处理X轴字段
  let actualXField = '';
  if (Array.isArray(xAxisFields) && xAxisFields.length > 0 && xAxisFields[0]) {
    actualXField = getActualField(xAxisFields[0], dataFields);
  }

  // 获取所有Y轴字段的实际字段名
  const actualYFields = (yAxisFields || [])
    .filter(f => f)
    .map(f => getActualField(f, dataFields));

  if (!actualXField || actualYFields.length === 0) {
    showMessage(container, '请配置有效的X/Y轴字段');
    return;
  }

  // 处理分组字段
  let actualGroupField = '';
  if (Array.isArray(groupFields) && groupFields.length > 0 && groupFields[0]) {
    actualGroupField = getActualField(groupFields[0], dataFields);
  }

  // 根据数据量决定X轴标签展示策略：少量数据水平展示，大量数据旋转+稀疏
  const dataCount = chartData.length;
  const isDense = dataCount > 20;
  const labelStep = isDense ? Math.ceil(dataCount / 20) : 1;
  const xAxisConfig = isDense
    ? {
        labelTransform: 'rotate(0)',
        label: { style: { fontSize: 11, textAnchor: 'end' } },
        tickFilter: (_: any, i: number) => i % labelStep === 0,
        tick: false,
        title: false,
      }
    : {
        labelTransform: 'rotate(0)',
        label: { style: { fontSize: 11, textAnchor: 'middle' } },
        tick: false,
        title: false,
      };

  const yFormatLookup = buildFormatLookup(yAxisFields.filter(f => f), dataFields);

  if (actualYFields.length === 1) {
    // 单Y轴：保持原有逻辑
    const actualYField = actualYFields[0];

    const cleanedData = chartData.map(item => ({
      ...item,
      [actualYField]: Number(item[actualYField]) || 0,
    })).filter(item => !isNaN(item[actualYField]));

    if (cleanedData.length === 0) {
      showMessage(container, 'Y轴字段无有效数值');
      return;
    }

    createAndRenderG2Chart((chart) => {
      chart.axis('x', xAxisConfig);
      chart.axis('y', {
        title: { text: getFieldLabel(actualYField), style: { fontSize: 12 } },
        labelFormatter: (v: any) => formatValue(v, yFormatLookup[actualYField], true),
      });
      if (dataCount > 50) {
        chart.slider('x', { values: [0, 1], style: { trackSize: 6, handleIconSize: 4 }, showLabelOnInteraction: true });
      }

      const bar = chart
        .interval()
        .data(cleanedData)
        .encode('x', actualXField)
        .encode('y', actualYField)
        .style({ fillOpacity: 1, lineWidth: 0 })
        .interaction('elementHighlight')
        .tooltip({
          title: (d: any) => String(d[actualXField] ?? ''),
          items: [
            (d: any) => ({
              name: actualGroupField ? String(d[actualGroupField] ?? getFieldLabel(actualYField)) : getFieldLabel(actualYField),
              value: formatValue(d[actualYField], yFormatLookup[actualYField]),
            }),
          ],
        });

      if (actualGroupField) {
        bar.encode('color', actualGroupField);
        chart.legend('color', { position: 'bottom', layout: { justifyContent: 'center' } });
      }
    });
  } else {
    // 多Y轴：将宽格式数据转换为长格式
    const longData: ChartDatum[] = [];
    chartData.forEach(item => {
      actualYFields.forEach(yField => {
        const value = Number(item[yField]) || 0;
        if (!isNaN(value)) {
          longData.push({
            ...item,
            _metric: getFieldLabel(yField),
            _value: value,
          });
        }
      });
    });

    if (longData.length === 0) {
      showMessage(container, 'Y轴字段无有效数值');
      return;
    }

    // 构建 X 值 → 各指标值的查找表（以原始字段名为键）
    const xMetricsMap: Record<string, Record<string, number>> = {};
    chartData.forEach(item => {
      const xKey = String(item[actualXField] ?? '');
      if (!xMetricsMap[xKey]) xMetricsMap[xKey] = {};
      actualYFields.forEach(yField => {
        xMetricsMap[xKey][yField] = Number(item[yField]) || 0;
      });
    });

    createAndRenderG2Chart((chart) => {
      chart.axis('x', xAxisConfig);
      chart.axis('y', {
        title: { text: '值', style: { fontSize: 12 } },
        labelFormatter: (v: any) => formatAxisValue(v),
      });
      if (dataCount > 50) {
        chart.slider('x', { values: [0, 1], style: { trackSize: 6, handleIconSize: 4 }, showLabelOnInteraction: true });
      }

      chart
        .interval()
        .data(longData)
        .transform({ type: 'stackY' })
        .encode('x', actualXField)
        .encode('y', '_value')
        .encode('color', '_metric')
        .style({ fillOpacity: 1, lineWidth: 0 })
        .interaction('elementHighlight')
        .tooltip({
          title: (d: any) => String(d[actualXField] ?? ''),
          items: [
            (d: any) => {
              const metric = String(d._metric ?? '');
              const yField = actualYFields.find(f => getFieldLabel(f) === metric) ?? '';
              return {
                name: metric,
                value: formatValue(xMetricsMap[String(d[actualXField] ?? '')]?.[yField], yFormatLookup[yField]),
              };
            },
          ],
        });

      chart.legend('color', { position: 'bottom', layout: { justifyContent: 'center' } });
    });
  }
};
