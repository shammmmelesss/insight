import type { RenderContext, ChartDatum } from './context';
import { showMessage } from './context';
import { G2_COLORS, ORANGE_COLORS, LINE_LEGEND_HEIGHT, SLIDER_CONFIG } from './constants';

// 渲染双Y轴图（左柱右线）
export const renderDualAxisChart = (ctx: RenderContext) => {
  const {
    container, chartData, xAxisFields, yAxisFields, y2AxisFields,
    getFieldLabel, formatValue, formatAxisValue, getActualField, buildFormatLookup,
    createAndRenderG2Chart, renderCustomLegend, hiddenSeriesRef,
  } = ctx;

  if (chartData.length === 0) {
    showMessage(container, '暂无数据');
    return;
  }

  const dataFields = Object.keys(chartData[0]);

  let actualXField = '';
  if (Array.isArray(xAxisFields) && xAxisFields.length > 0 && xAxisFields[0]) {
    actualXField = getActualField(xAxisFields[0], dataFields);
  }

  const actualLeftFields = (yAxisFields || [])
    .filter(f => f)
    .map(f => getActualField(f, dataFields));

  const actualRightFields = (y2AxisFields || [])
    .filter(f => f)
    .map(f => getActualField(f, dataFields));

  if (!actualXField || (actualLeftFields.length === 0 && actualRightFields.length === 0)) {
    showMessage(container, '请配置有效的X轴、左Y轴或右Y轴字段');
    return;
  }

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

  // 构建左轴长格式数据（柱状）
  const leftLongData: ChartDatum[] = [];
  if (actualLeftFields.length > 0) {
    chartData.forEach(item => {
      actualLeftFields.forEach(f => {
        const value = Number(item[f]);
        if (!isNaN(value) && !hiddenSeriesRef.current.has(getFieldLabel(f))) {
          leftLongData.push({ ...item, _metricL: getFieldLabel(f), _rawMetricL: f, _valueL: value });
        }
      });
    });
  }

  // 构建右轴长格式数据（折线）
  const rightLongData: ChartDatum[] = [];
  if (actualRightFields.length > 0) {
    chartData.forEach(item => {
      actualRightFields.forEach(f => {
        const value = Number(item[f]);
        if (!isNaN(value) && !hiddenSeriesRef.current.has(getFieldLabel(f))) {
          rightLongData.push({ ...item, _metricR: getFieldLabel(f), _rawMetricR: f, _valueR: value });
        }
      });
    });
  }

  // 构建 tooltip 用的 x→全指标 查找表（以原始字段名为键）
  const xMetricsMap: Record<string, Record<string, number>> = {};
  chartData.forEach(item => {
    const xKey = String(item[actualXField] ?? '');
    if (!xMetricsMap[xKey]) xMetricsMap[xKey] = {};
    [...actualLeftFields, ...actualRightFields].forEach(f => {
      xMetricsMap[xKey][f] = Number(item[f]) || 0;
    });
  });

  const dualFormatLookup = buildFormatLookup([...yAxisFields, ...y2AxisFields].filter(f => f), dataFields);

  // tooltip 标记点颜色映射（与自定义图例保持一致）
  const dualColorMap: Record<string, string> = {};
  actualLeftFields.forEach((f, i) => { dualColorMap[f] = G2_COLORS[i % G2_COLORS.length]; });
  actualRightFields.forEach((f, i) => {
    dualColorMap[f] = actualRightFields.length > 1 ? ORANGE_COLORS[i % ORANGE_COLORS.length] : '#FA8C16';
  });

  createAndRenderG2Chart((chart) => {
    chart.axis('x', xAxisConfig);
    if (dataCount > 50) {
      chart.slider('x', SLIDER_CONFIG);
    }

    if (leftLongData.length > 0) {
      const useStack = actualLeftFields.length > 1;
      const bar = chart
        .interval()
        .data(leftLongData)
        .encode('x', actualXField)
        .encode('y', '_valueL')
        .style({ fillOpacity: 0.85, lineWidth: 0 })
        .interaction('elementHighlight')
        .axis('y', {
          position: 'left',
          title: actualLeftFields.map(f => getFieldLabel(f)).join(' / '),
          labelFormatter: (v: any) => formatAxisValue(v),
        })
        .tooltip({
          title: (d: any) => String(d[actualXField] ?? ''),
          // 展示当前 x 下的全部指标（左轴柱 + 右轴线）
          items: [...actualLeftFields, ...actualRightFields].map(rawField => (d: any) => ({
            name: getFieldLabel(rawField),
            value: formatValue(xMetricsMap[String(d[actualXField] ?? '')]?.[rawField], dualFormatLookup[rawField]),
            color: dualColorMap[rawField],
          })),
        });

      if (actualLeftFields.length > 1) {
        bar.encode('color', '_metricL');
        // 固定颜色映射域，避免隐藏部分系列后颜色错位（与图例保持一致）
        bar.scale('color', {
          domain: actualLeftFields.map(f => getFieldLabel(f)),
          range: G2_COLORS,
        });
        if (useStack) bar.transform({ type: 'stackY' });
      } else if (actualLeftFields.length === 1) {
        bar.style({ fill: G2_COLORS[0] });
      }
    }

    if (rightLongData.length > 0) {
      const line = chart
        .line()
        .data(rightLongData)
        .encode('x', actualXField)
        .encode('y', '_valueR')
        .encode('shape', 'smooth')
        .style({ lineWidth: 2 })
        .scale('y', { independent: true })
        .axis('y', {
          position: 'right',
          title: actualRightFields.map(f => getFieldLabel(f)).join(' / '),
          labelFormatter: (v: any) => formatAxisValue(v),
        });

      // 仅当没有左轴柱时，由折线承载 tooltip（展示全部指标）
      if (leftLongData.length === 0) {
        line.tooltip({
          title: (d: any) => String(d[actualXField] ?? ''),
          items: [...actualLeftFields, ...actualRightFields].map(rawField => (d: any) => ({
            name: getFieldLabel(rawField),
            value: formatValue(xMetricsMap[String(d[actualXField] ?? '')]?.[rawField], dualFormatLookup[rawField]),
            color: dualColorMap[rawField],
          })),
        });
      } else {
        line.tooltip(false);
      }

      if (actualRightFields.length > 1) {
        line.encode('color', '_metricR').scale('color', {
          domain: actualRightFields.map(f => getFieldLabel(f)),
          range: ORANGE_COLORS,
        });
      } else {
        line.style({ stroke: '#FA8C16', lineWidth: 2 });
      }

      chart
        .point()
        .data(rightLongData)
        .encode('x', actualXField)
        .encode('y', '_valueR')
        .encode('shape', 'circle')
        .style({ r: 0 })
        .scale('y', { independent: true })
        .axis('y', false)
        .tooltip(false);
    }

    chart.legend(false);
  }, LINE_LEGEND_HEIGHT);

  // 合并左右轴系列构建统一自定义图例
  const dualLegendItems = [
    ...actualLeftFields.map((f, i) => ({ name: getFieldLabel(f), color: G2_COLORS[i % G2_COLORS.length] })),
    ...actualRightFields.map((f, i) => ({ name: getFieldLabel(f), color: actualRightFields.length > 1 ? ORANGE_COLORS[i % ORANGE_COLORS.length] : '#FA8C16' })),
  ];
  renderCustomLegend(dualLegendItems);
};
