import type { RenderContext, ChartDatum, SeriesItem } from './context';
import { showMessage } from './context';
import { G2_COLORS, LINE_LEGEND_HEIGHT, SLIDER_CONFIG } from './constants';

// 渲染折线图
export const renderLineChart = (ctx: RenderContext) => {
  const {
    container, chartData: rawChartData, xAxisFields, yAxisFields, groupFields,
    getFieldLabel, formatValue, formatAxisValue, getActualField, buildFormatLookup,
    createAndRenderG2Chart, renderCustomLegend, hiddenSeriesRef,
  } = ctx;
  let chartData = rawChartData;

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

  // 处理分组字段：支持多个分组字段，合并为一个复合分组列（值1-值2）
  const actualGroupFields = (Array.isArray(groupFields) ? groupFields : [])
    .filter(f => f)
    .map(f => getActualField(f, dataFields));
  let actualGroupField = '';
  if (actualGroupFields.length === 1) {
    actualGroupField = actualGroupFields[0];
  } else if (actualGroupFields.length > 1) {
    // 多个分组字段：在每行注入合成的复合分组列
    actualGroupField = '_group';
    chartData = chartData.map(item => ({
      ...item,
      _group: actualGroupFields.map(f => String(item[f] ?? '')).join('-'),
    }));
  }

  // 根据数据量决定X轴标签展示策略：少量数据水平展示，大量数据旋转+稀疏
  const dataCount = chartData.length;
  const isDense = dataCount > 20;
  // 大量数据时每隔 N 个只显示一个标签
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

    const baseCleanedData = chartData.map(item => ({
      ...item,
      [actualYField]: Number(item[actualYField]) || 0,
    })).filter(item => !isNaN(item[actualYField]));

    if (baseCleanedData.length === 0) {
      showMessage(container, 'Y轴字段无有效数值');
      return;
    }

    // 计算分组系列信息（用于自定义图例）
    let seriesItems: SeriesItem[] = [];
    let cleanedData = baseCleanedData;
    if (actualGroupField) {
      const uniqueGroups = [...new Set(baseCleanedData.map(item => String(item[actualGroupField] ?? '')))].filter(g => g !== '');
      seriesItems = uniqueGroups.map((name, i) => ({ name, color: G2_COLORS[i % G2_COLORS.length] }));
      if (hiddenSeriesRef.current.size > 0) {
        cleanedData = baseCleanedData.filter(item => !hiddenSeriesRef.current.has(String(item[actualGroupField] ?? '')));
      }
    }

    const hasLegend = actualGroupField && seriesItems.length > 0;

    createAndRenderG2Chart((chart) => {
      chart.axis('x', xAxisConfig);
      chart.axis('y', {
        title: { text: getFieldLabel(actualYField), style: { fontSize: 12 } },
        labelFormatter: (v: any) => formatValue(v, yFormatLookup[actualYField], true),
      });
      if (dataCount > 50) {
        chart.slider('x', SLIDER_CONFIG);
      }

      const area = chart
        .area()
        .data(cleanedData)
        .encode('x', actualXField)
        .encode('y', actualYField)
        .encode('shape', 'smooth')
        .style({ fillOpacity: 0.15 })
        .animate('enter', { type: 'fadeIn' })
        .tooltip(false);

      if (actualGroupField) {
        area.encode('color', actualGroupField);
        area.scale('color', { domain: seriesItems.map(s => s.name), range: seriesItems.map(s => s.color) });
      }

      const line = chart
        .line()
        .data(cleanedData)
        .encode('x', actualXField)
        .encode('y', actualYField)
        .encode('shape', 'smooth')
        .style({ lineWidth: 2 })
        .animate('enter', { type: 'fadeIn' })
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
        line.encode('color', actualGroupField);
        line.scale('color', { domain: seriesItems.map(s => s.name), range: seriesItems.map(s => s.color) });
      }

      chart.legend(false);
    }, hasLegend ? LINE_LEGEND_HEIGHT : 0);

    if (hasLegend) renderCustomLegend(seriesItems);
  } else {
    // 多Y轴：将宽格式数据转换为长格式
    // 有分组时，系列名为「分组值-指标」的笛卡尔积；无分组时仅为指标名
    const uniqueGroups = actualGroupField
      ? [...new Set(chartData.map(item => String(item[actualGroupField] ?? '')))].filter(g => g !== '')
      : [];
    const makeSeriesName = (yField: string, groupValue?: string) =>
      actualGroupField && groupValue !== undefined
        ? `${groupValue}-${getFieldLabel(yField)}`
        : getFieldLabel(yField);

    const multiSeriesItems: SeriesItem[] = [];
    if (actualGroupField) {
      let colorIdx = 0;
      uniqueGroups.forEach(groupValue => {
        actualYFields.forEach(f => {
          multiSeriesItems.push({ name: makeSeriesName(f, groupValue), color: G2_COLORS[colorIdx % G2_COLORS.length] });
          colorIdx++;
        });
      });
    } else {
      actualYFields.forEach((f, i) => {
        multiSeriesItems.push({ name: makeSeriesName(f), color: G2_COLORS[i % G2_COLORS.length] });
      });
    }
    const visibleSeries = new Set(multiSeriesItems.filter(s => !hiddenSeriesRef.current.has(s.name)).map(s => s.name));

    const longData: ChartDatum[] = [];
    chartData.forEach(item => {
      const groupValue = actualGroupField ? String(item[actualGroupField] ?? '') : undefined;
      actualYFields.forEach(yField => {
        const value = Number(item[yField]) || 0;
        const seriesName = makeSeriesName(yField, groupValue);
        if (!isNaN(value) && visibleSeries.has(seriesName)) {
          longData.push({
            ...item,
            _metric: seriesName,
            _yField: yField,
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
    const lineXMetricsMap: Record<string, Record<string, number>> = {};
    chartData.forEach(item => {
      const xKey = String(item[actualXField] ?? '');
      if (!lineXMetricsMap[xKey]) lineXMetricsMap[xKey] = {};
      actualYFields.forEach(yField => {
        lineXMetricsMap[xKey][yField] = Number(item[yField]) || 0;
      });
    });

    createAndRenderG2Chart((chart) => {
      chart.axis('x', xAxisConfig);
      chart.axis('y', {
        title: { text: '值', style: { fontSize: 12 } },
        labelFormatter: (v: any) => formatAxisValue(v),
      });
      if (dataCount > 50) {
        chart.slider('x', SLIDER_CONFIG);
      }

      chart
        .line()
        .data(longData)
        .encode('x', actualXField)
        .encode('y', '_value')
        .encode('color', '_metric')
        .encode('shape', 'smooth')
        .scale('color', { domain: multiSeriesItems.map(s => s.name), range: multiSeriesItems.map(s => s.color) })
        .style({ lineWidth: 2 })
        .animate('enter', { type: 'fadeIn' })
        .interaction('elementHighlight')
        .tooltip({
          title: (d: any) => String(d[actualXField] ?? ''),
          items: [
            (d: any) => {
              const yField = String(d._yField ?? '');
              return {
                name: String(d._metric ?? ''),
                value: formatValue(d._value ?? lineXMetricsMap[String(d[actualXField] ?? '')]?.[yField], yFormatLookup[yField]),
              };
            },
          ],
        });

      chart.legend(false);
    }, LINE_LEGEND_HEIGHT);

    renderCustomLegend(multiSeriesItems);
  }
};
