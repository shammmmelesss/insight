import React, { useEffect, useRef } from 'react';

// 图表类型
type ChartType = 'crossTable' | 'bar' | 'line' | 'pie' | 'indicator' | 'dualAxis';
import {
  S2Options,
  PivotSheet,
} from '@antv/s2';
import { Chart } from '@antv/g2';

interface ChartRendererProps {
  chartType: ChartType;
  chartData?: any[];
  rowFields?: string[];
  colFields?: string[];
  measureFields?: string[];
  xAxisFields?: string[];
  yAxisFields?: string[];
  y2AxisFields?: string[];
  groupFields?: string[];
  indicatorFields?: string[];
  containerHeight?: number;
  fieldFormats?: Record<string, string>;
  fieldLabelMap?: Record<string, string>;
}

const ChartRenderer: React.FC<ChartRendererProps> = ({
  chartType,
  chartData = [],
  rowFields = [],
  colFields = [],
  measureFields = [],
  xAxisFields = [],
  yAxisFields = [],
  y2AxisFields = [],
  groupFields = [],
  indicatorFields = [],
  containerHeight,
  fieldFormats = {},
  fieldLabelMap = {},
}) => {
  const getFieldLabel = (key: string): string => fieldLabelMap[key] || key;
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<PivotSheet | Chart | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const lastWidthRef = useRef<number>(0);

  // 获取数据中的实际字段名（支持聚合后的字段名，如 col3_计数, col3_求和 等）
  const getActualField = (field: string, dataFields: string[]): string => {
    // 优先精确匹配（支持完整聚合别名如 amount_求和）
    const exactMatch = dataFields.find(f => f === field);
    if (exactMatch) return exactMatch;
    // 回退到前缀匹配（兼容原始字段名的单聚合场景）
    const prefixMatch = dataFields.find(f => f.startsWith(`${field}_`));
    return prefixMatch || field;
  };

  // 获取多个数据中的实际字段名
  const getActualFields = (fields: string[], dataFields: string[]): string[] => {
    return fields.map(field => getActualField(field, dataFields));
  };

  // 根据数据格式设置格式化数值
  const formatValue = (value: any, format?: string): string => {
    const num = Number(value);
    if (isNaN(num)) return String(value ?? '');
    switch (format) {
      case '百分比': return num.toFixed(2) + '%';
      case '千分比': return num.toFixed(2) + '‰';
      case '小数': return num.toFixed(2);
      case '整数': return Math.round(num).toLocaleString();
      default: return num.toLocaleString();
    }
  };

  // 构建 实际字段名 → 数据格式 的映射表
  const buildFormatLookup = (propFields: string[], dataFields: string[]): Record<string, string> => {
    const map: Record<string, string> = {};
    propFields.filter(f => f).forEach(f => {
      if (fieldFormats[f]) {
        map[getActualField(f, dataFields)] = fieldFormats[f];
      }
    });
    return map;
  };

  // 创建并渲染G2图表的公共函数
  const createAndRenderG2Chart = (chartConfig: (chart: Chart) => void) => {
    if (!chartRef.current) return;

    let defaultHeight = 300;
    if (chartType === 'indicator') {
      defaultHeight = 120;
    }

    chartRef.current.style.height = containerHeight ? `${containerHeight}px` : '100%';
    const detectedHeight = containerHeight || chartRef.current.clientHeight;
    const actualHeight = detectedHeight > 80 ? detectedHeight : defaultHeight;
    chartRef.current.style.height = `${actualHeight}px`;

    const chart = new Chart({
      container: chartRef.current,
      autoFit: true,
      height: actualHeight,
      insetTop: 10,
      insetBottom: 10,
    });

    chartConfig(chart);
    chart.render();
    chartInstanceRef.current = chart;
  };

  // 渲染图表的公共函数
  const renderChart = () => {
    if (!chartRef.current) return;

    // 清除之前的图表实例
    if (chartInstanceRef.current) {
      try {
        if (typeof chartInstanceRef.current.destroy === 'function') {
          chartInstanceRef.current.destroy();
        }
      } catch (error) {
        console.error('Failed to destroy chart instance:', error);
      }
      chartInstanceRef.current = null;
    }

    // 根据图表类型渲染不同的图表
    try {
      // 清理之前的内容
      chartRef.current.innerHTML = '';
      
      // 直接根据图表类型调用对应的渲染函数
      if (chartType === 'crossTable') {
        renderCrossTable();
      } else if (chartType === 'bar') {
        renderBarChart();
      } else if (chartType === 'line') {
        renderLineChart();
      } else if (chartType === 'pie') {
        renderPieChart();
      } else if (chartType === 'indicator') {
        renderIndicatorCard();
      } else if (chartType === 'dualAxis') {
        renderDualAxisChart();
      } else {
        renderDefault();
      }
    } catch (error) {
      console.error('Failed to render chart:', error);
      renderDefault();
    }
  };

  useEffect(() => {
    renderChart();
    if (chartRef.current) {
      lastWidthRef.current = chartRef.current.clientWidth;
    }

    // 添加 ResizeObserver 监听容器大小变化，仅在宽度变化时重新渲染
    if (chartRef.current) {
      resizeObserverRef.current = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const newWidth = entry.contentRect.width;
        if (Math.abs(newWidth - lastWidthRef.current) > 1) {
          lastWidthRef.current = newWidth;
          renderChart();
        }
      });
      resizeObserverRef.current.observe(chartRef.current);
    }

    // 清理函数
    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      if (chartInstanceRef.current) {
        if (typeof chartInstanceRef.current.destroy === 'function') {
          chartInstanceRef.current.destroy();
        }
        chartInstanceRef.current = null;
      }
    };
  }, [chartType, chartData, rowFields, colFields, measureFields, xAxisFields, yAxisFields, y2AxisFields, groupFields, indicatorFields, fieldFormats]);

  // 渲染交叉表
  const renderCrossTable = () => {
    if (!chartRef.current || chartData.length === 0) return;

    // 获取数据中的实际字段名
    const dataFields = chartData.length > 0 ? Object.keys(chartData[0]) : [];
    
    // 处理度量字段，使用数据中的实际字段名（可能是聚合后的字段名）
    const actualMeasureFields = getActualFields(measureFields, dataFields);

    const measureFormatLookup = buildFormatLookup(measureFields, dataFields);
    const s2DataConfig = {
      fields: {
        rows: rowFields,
        columns: colFields,
        values: actualMeasureFields,
      },
      meta: [
        ...rowFields.map(field => ({ field, name: getFieldLabel(field) })),
        ...colFields.map(field => ({ field, name: getFieldLabel(field) })),
        ...actualMeasureFields.map(field => ({
          field,
          name: getFieldLabel(field),
          formatter: (v: any) => formatValue(v, measureFormatLookup[field]),
        })),
      ],
      data: chartData,
    };

    chartRef.current.style.height = containerHeight ? `${containerHeight}px` : '100%';
    const detectedHeight = containerHeight || chartRef.current.clientHeight;
    const crossTableHeight = detectedHeight > 80 ? detectedHeight : 300;
    chartRef.current.style.height = `${crossTableHeight}px`;

    const s2Options: S2Options = {
      width: chartRef.current.clientWidth,
      height: crossTableHeight,
      interaction: {
        hoverHighlight: true,
      },
      seriesNumber: { enable: false },
      pagination: {
        current: 1,
        pageSize: 10,
      },
    };

    chartInstanceRef.current = new PivotSheet(chartRef.current, s2DataConfig, s2Options);
    chartInstanceRef.current.render();
  };

  // 渲染柱状图
  const renderBarChart = () => {
    if (chartData.length === 0) {
      if (chartRef.current) {
        chartRef.current.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">暂无数据</div>';
      }
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
      if (chartRef.current) {
        chartRef.current.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">请配置有效的X/Y轴字段</div>';
      }
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
          labelTransform: 'rotate(-20)',
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
        if (chartRef.current) {
          chartRef.current.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">Y轴字段无有效数值</div>';
        }
        return;
      }

      createAndRenderG2Chart((chart) => {
        chart.axis('x', xAxisConfig);
        chart.axis(actualYField, {
          title: { text: getFieldLabel(actualYField), style: { fontSize: 12 } },
          label: { style: { fontSize: 11 }, formatter: (v: any) => formatValue(v, yFormatLookup[actualYField]) },
        });

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
      const longData: any[] = [];
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
        if (chartRef.current) {
          chartRef.current.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">Y轴字段无有效数值</div>';
        }
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
        chart.axis('_value', {
          title: { text: '值', style: { fontSize: 12 } },
          label: { style: { fontSize: 11 }, formatter: (v: any) => Number(v).toLocaleString() },
        });

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
            items: actualYFields.map(yField => (d: any) => ({
              name: getFieldLabel(yField),
              value: formatValue(xMetricsMap[String(d[actualXField] ?? '')]?.[yField], yFormatLookup[yField]),
            })),
          });

        chart.legend('color', { position: 'bottom', layout: { justifyContent: 'center' } });
      });
    }
  };

  // 渲染折线图
  const renderLineChart = () => {
    if (chartData.length === 0) {
      if (chartRef.current) {
        chartRef.current.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">暂无数据</div>';
      }
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
      if (chartRef.current) {
        chartRef.current.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">请配置有效的X/Y轴字段</div>';
      }
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
    // 大量数据时每隔 N 个只显示一个标签
    const labelStep = isDense ? Math.ceil(dataCount / 20) : 1;
    const xAxisConfig = isDense
      ? {
          labelTransform: 'rotate(-20)',
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
        if (chartRef.current) {
          chartRef.current.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">Y轴字段无有效数值</div>';
        }
        return;
      }

      createAndRenderG2Chart((chart) => {
        chart.axis('x', xAxisConfig);
        chart.axis(actualYField, {
          title: { text: getFieldLabel(actualYField), style: { fontSize: 12 } },
          label: { style: { fontSize: 11 }, formatter: (v: any) => formatValue(v, yFormatLookup[actualYField]) },
        });

        const area = chart
          .area()
          .data(cleanedData)
          .encode('x', actualXField)
          .encode('y', actualYField)
          .encode('shape', 'smooth')
          .style({ fillOpacity: 0.15 })
          .tooltip(false);

        if (actualGroupField) {
          area.encode('color', actualGroupField);
        }

        const line = chart
          .line()
          .data(cleanedData)
          .encode('x', actualXField)
          .encode('y', actualYField)
          .encode('shape', 'smooth')
          .style({ lineWidth: 2 })
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
        }

        chart.legend('color', { position: 'bottom', layout: { justifyContent: 'center' } });
      });
    } else {
      // 多Y轴：将宽格式数据转换为长格式
      const longData: any[] = [];
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
        if (chartRef.current) {
          chartRef.current.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">Y轴字段无有效数值</div>';
        }
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
        chart.axis('_value', {
          title: { text: '值', style: { fontSize: 12 } },
          label: { style: { fontSize: 11 }, formatter: (v: any) => Number(v).toLocaleString() },
        });

        chart
          .line()
          .data(longData)
          .encode('x', actualXField)
          .encode('y', '_value')
          .encode('color', '_metric')
          .encode('shape', 'smooth')
          .style({ lineWidth: 2 })
          .interaction('elementHighlight')
          .tooltip({
            title: (d: any) => String(d[actualXField] ?? ''),
            items: actualYFields.map(yField => (d: any) => ({
              name: getFieldLabel(yField),
              value: formatValue(lineXMetricsMap[String(d[actualXField] ?? '')]?.[yField], yFormatLookup[yField]),
            })),
          });

        chart.legend('color', { position: 'bottom', layout: { justifyContent: 'center' } });
      });
    }
  };

  // 渲染双Y轴图（左柱右线）
  const renderDualAxisChart = () => {
    if (chartData.length === 0) {
      if (chartRef.current) {
        chartRef.current.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">暂无数据</div>';
      }
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
      if (chartRef.current) {
        chartRef.current.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">请配置有效的X轴、左Y轴或右Y轴字段</div>';
      }
      return;
    }

    const dataCount = chartData.length;
    const isDense = dataCount > 20;
    const labelStep = isDense ? Math.ceil(dataCount / 20) : 1;
    const xAxisConfig = isDense
      ? {
          labelTransform: 'rotate(-20)',
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
    const leftLongData: any[] = [];
    if (actualLeftFields.length > 0) {
      chartData.forEach(item => {
        actualLeftFields.forEach(f => {
          const value = Number(item[f]);
          if (!isNaN(value)) {
            leftLongData.push({ ...item, _metricL: getFieldLabel(f), _rawMetricL: f, _valueL: value });
          }
        });
      });
    }

    // 构建右轴长格式数据（折线）
    const rightLongData: any[] = [];
    if (actualRightFields.length > 0) {
      chartData.forEach(item => {
        actualRightFields.forEach(f => {
          const value = Number(item[f]);
          if (!isNaN(value)) {
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

    const allMetrics = [...actualLeftFields, ...actualRightFields];
    const dualFormatLookup = buildFormatLookup([...yAxisFields, ...y2AxisFields].filter(f => f), dataFields);

    createAndRenderG2Chart((chart) => {
      chart.axis('x', xAxisConfig);

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
            label: { style: { fontSize: 11 }, formatter: (v: any) => Number(v).toLocaleString() },
          })
          .tooltip({
            title: (d: any) => String(d[actualXField] ?? ''),
            items: allMetrics.map(m => (d: any) => ({
              name: getFieldLabel(m),
              value: formatValue(xMetricsMap[String(d[actualXField] ?? '')]?.[m], dualFormatLookup[m]),
            })),
          });

        if (actualLeftFields.length > 1) {
          bar.encode('color', '_metricL');
          if (useStack) bar.transform({ type: 'stackY' });
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
            label: { style: { fontSize: 11 }, formatter: (v: any) => Number(v).toLocaleString() },
          })
          .tooltip(false);

        if (actualRightFields.length > 1) {
          line.encode('color', '_metricR');
        }

        chart
          .point()
          .data(rightLongData)
          .encode('x', actualXField)
          .encode('y', '_valueR')
          .encode('shape', 'circle')
          .style({ r: 3, fill: 'white', stroke: 'currentColor', lineWidth: 1.5 })
          .scale('y', { independent: true })
          .axis('y', false)
          .tooltip(false);
      }

      chart.legend('color', { position: 'bottom', layout: { justifyContent: 'center' } });
    });
  };

  // 渲染饼图
  const renderPieChart = () => {
    if (chartData.length === 0) {
      if (chartRef.current) {
        chartRef.current.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">暂无数据</div>';
      }
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
      if (chartRef.current) {
        chartRef.current.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">请配置有效的度量字段和分组字段</div>';
      }
      return;
    }
    
    // 数据清洗函数，确保度量值为数值类型
    const cleanPieChartData = (data: any[], measureField: string) => {
      return data.map(item => ({
        ...item,
        [measureField]: Number(item[measureField]) || 0, // 非数值转0，避免渲染异常
      })).filter(item => !isNaN(item[measureField]) && item[measureField] > 0); // 过滤NaN和非正值数据
    };
    
    const cleanedData = cleanPieChartData(chartData, actualMeasureField);
    
    if (cleanedData.length === 0) {
      if (chartRef.current) {
        chartRef.current.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">度量字段无有效数值</div>';
      }
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

  // 渲染指标卡
  const renderIndicatorCard = () => {
    if (!chartRef.current) return;

    if (chartData.length === 0 || indicatorFields.length === 0) {
      chartRef.current.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">暂无数据</div>';
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
      chartRef.current.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">请配置有效的指标字段</div>';
      return;
    }

    const cardHTML = cards.map(({ label, actualField }) => {
      const value = row[actualField];
      const display = value === null || value === undefined ? '-' : formatValue(value, indicatorFormatLookup[actualField]);
      return `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
          min-width:120px;padding:16px 24px;background:#f0f5ff;border-radius:8px;">
          <div style="font-size:13px;color:#8c8c8c;margin-bottom:8px;text-align:center;">${label}</div>
          <div style="font-size:32px;font-weight:700;color:#165DFF;line-height:1.2;">${display}</div>
        </div>`;
    }).join('');

    chartRef.current.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:16px;align-items:center;
        justify-content:center;width:100%;height:100%;padding:16px;box-sizing:border-box;">
        ${cardHTML}
      </div>`;
  };

  // 渲染默认内容
  const renderDefault = () => {
    if (!chartRef.current) return;
    chartRef.current.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #999;">请先选择数据集</div>';
  };

  return (
    <div
      ref={chartRef}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
      }}
    />
  );
};

export default ChartRenderer;
