import type { RenderContext, ChartDatum } from './context';
import { showMessage } from './context';
import { G2_COLORS, LINE_LEGEND_HEIGHT, SLIDER_CONFIG } from './constants';

// 渲染柱状图
export const renderBarChart = (ctx: RenderContext) => {
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

    let cleanedData = chartData.map(item => ({
      ...item,
      [actualYField]: Number(item[actualYField]) || 0,
    })).filter(item => !isNaN(item[actualYField]));

    if (cleanedData.length === 0) {
      showMessage(container, 'Y轴字段无有效数值');
      return;
    }

    // 分组柱状：构建分组值 → 颜色映射，并支持图例反选
    let groupValues: string[] = [];
    let groupColorMap: Record<string, string> = {};
    if (actualGroupField) {
      groupValues = Array.from(new Set(cleanedData.map(d => String(d[actualGroupField] ?? ''))));
      groupValues.forEach((g, i) => { groupColorMap[g] = G2_COLORS[i % G2_COLORS.length]; });
      // 过滤掉被图例隐藏的分组
      cleanedData = cleanedData.filter(d => !hiddenSeriesRef.current.has(String(d[actualGroupField] ?? '')));
    }

    const legendHeight = actualGroupField ? LINE_LEGEND_HEIGHT : undefined;

    createAndRenderG2Chart((chart) => {
      chart.axis('x', xAxisConfig);
      chart.axis('y', {
        title: { text: getFieldLabel(actualYField), style: { fontSize: 12 } },
        labelFormatter: (v: any) => formatValue(v, yFormatLookup[actualYField], true),
      });
      if (dataCount > 50) {
        chart.slider('x', SLIDER_CONFIG);
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
              color: actualGroupField ? groupColorMap[String(d[actualGroupField] ?? '')] : undefined,
            }),
          ],
        });

      if (actualGroupField) {
        bar.encode('color', actualGroupField).scale('color', {
          domain: groupValues,
          range: G2_COLORS,
        });
        chart.legend(false);
      }
    }, legendHeight);

    if (actualGroupField) {
      renderCustomLegend(groupValues.map(g => ({ name: g, color: groupColorMap[g] })));
    }
  } else {
    // 多Y轴：将宽格式数据转换为长格式（跳过被图例隐藏的系列）
    // 有分组时，系列名为「分组值-指标」的笛卡尔积；无分组时仅为指标名
    const uniqueGroups = actualGroupField
      ? [...new Set(chartData.map(item => String(item[actualGroupField] ?? '')))].filter(g => g !== '')
      : [];
    const makeSeriesName = (yField: string, groupValue?: string) =>
      actualGroupField && groupValue !== undefined
        ? `${groupValue}-${getFieldLabel(yField)}`
        : getFieldLabel(yField);

    // 系列名 → 颜色映射（与图例/柱子保持一致）
    const barColorMap: Record<string, string> = {};
    const seriesNames: string[] = [];
    if (actualGroupField) {
      let colorIdx = 0;
      uniqueGroups.forEach(groupValue => {
        actualYFields.forEach(f => {
          const name = makeSeriesName(f, groupValue);
          seriesNames.push(name);
          barColorMap[name] = G2_COLORS[colorIdx % G2_COLORS.length];
          colorIdx++;
        });
      });
    } else {
      actualYFields.forEach((f, i) => {
        const name = makeSeriesName(f);
        seriesNames.push(name);
        barColorMap[name] = G2_COLORS[i % G2_COLORS.length];
      });
    }

    const longData: ChartDatum[] = [];
    chartData.forEach(item => {
      const groupValue = actualGroupField ? String(item[actualGroupField] ?? '') : undefined;
      actualYFields.forEach(yField => {
        const value = Number(item[yField]) || 0;
        const seriesName = makeSeriesName(yField, groupValue);
        if (!isNaN(value) && !hiddenSeriesRef.current.has(seriesName)) {
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
        .interval()
        .data(longData)
        .transform({ type: 'stackY' })
        .encode('x', actualXField)
        .encode('y', '_value')
        .encode('color', '_metric')
        // 固定颜色映射域，避免隐藏部分系列后颜色错位（与图例保持一致）
        .scale('color', {
          domain: seriesNames,
          range: seriesNames.map(name => barColorMap[name]),
        })
        .style({ fillOpacity: 1, lineWidth: 0 })
        .interaction('elementHighlight')
        .tooltip({
          title: (d: any) => String(d[actualXField] ?? ''),
          items: [
            (d: any) => {
              const yField = String(d._yField ?? '');
              return {
                name: String(d._metric ?? ''),
                value: formatValue(d._value, yFormatLookup[yField]),
                color: barColorMap[String(d._metric ?? '')],
              };
            },
          ],
        });

      chart.legend(false);
    }, LINE_LEGEND_HEIGHT);

    renderCustomLegend(seriesNames.map(name => ({ name, color: barColorMap[name] })));
  }
};
