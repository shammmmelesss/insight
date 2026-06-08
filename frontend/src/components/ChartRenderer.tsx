import React, { useEffect, useRef } from 'react';

// 图表类型
type ChartType = 'crossTable' | 'bar' | 'line' | 'pie' | 'indicator' | 'dualAxis';

const G2_COLORS = ['#1783FF', '#00C9C9', '#F0884D', '#D580FF', '#7863FF', '#60C42D', '#BD8F24', '#FF80CA', '#2491B3', '#17C76F'];
const LINE_LEGEND_HEIGHT = 36;
import {
  S2Options,
  PivotSheet,
  S2Event,
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
  const hiddenSeriesRef = useRef<Set<string>>(new Set());
  const crossTableSortParamsRef = useRef<any[]>([]);
  const legendContainerRef = useRef<HTMLDivElement>(null);
  const renderChartCallbackRef = useRef<() => void>(() => {});

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

  // 将大数字缩写为 k/w 形式用于 y 轴标签
  const formatAxisValue = (value: any): string => {
    const num = Number(value);
    if (isNaN(num)) return String(value ?? '');
    const abs = Math.abs(num);
    if (abs >= 100_000_000) return (num / 100_000_000).toFixed(abs % 100_000_000 === 0 ? 0 : 1) + '亿';
    if (abs >= 10_000) return (num / 10_000).toFixed(abs % 10_000 === 0 ? 0 : 1) + 'w';
    if (abs >= 1_000) return (num / 1_000).toFixed(abs % 1_000 === 0 ? 0 : 1) + 'k';
    return num.toLocaleString();
  };

  // 根据数据格式设置格式化数值，axis=true 时无特殊格式则用缩写
  const formatValue = (value: any, format?: string, axis = false): string => {
    const num = Number(value);
    if (isNaN(num)) return String(value ?? '');
    switch (format) {
      case '百分比': return (num * 100).toFixed(2) + '%';
      case '千分比': return (num*1000).toFixed(2) + '‰';
      case '小数': return num.toFixed(2);
      case '1位小数': return num.toFixed(1);
      case '2位小数': return num.toFixed(2);
      case '整数': return Math.round(num).toLocaleString();
      default: return axis ? formatAxisValue(num) : num.toLocaleString();
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
  const createAndRenderG2Chart = (chartConfig: (chart: Chart) => void, legendHeight = 0) => {
    if (!chartRef.current) return;

    let defaultHeight = 300;
    if (chartType === 'indicator') {
      defaultHeight = 120;
    }

    const adjustedContainerHeight = containerHeight ? containerHeight - legendHeight : undefined;
    chartRef.current.style.height = adjustedContainerHeight ? `${adjustedContainerHeight}px` : '100%';
    const detectedHeight = adjustedContainerHeight || Math.max(chartRef.current.clientHeight - legendHeight, 0);
    const actualHeight = detectedHeight > 80 ? detectedHeight : defaultHeight;
    chartRef.current.style.height = `${actualHeight}px`;

    const chart = new Chart({
      container: chartRef.current,
      autoFit: true,
      height: actualHeight,
      insetTop: 10,
      insetBottom: 10,
    });

    chart.interaction('tooltip', { enterable: true });
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
      if (legendContainerRef.current) legendContainerRef.current.innerHTML = '';
      
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
    hiddenSeriesRef.current = new Set();
    crossTableSortParamsRef.current = [];
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
      sortParams: crossTableSortParamsRef.current,
    };

    const detectedHeight = containerHeight || chartRef.current.clientHeight;
    const crossTableHeight = detectedHeight > 80 ? detectedHeight : 300;
    chartRef.current.style.height = `${crossTableHeight}px`;
    chartRef.current.style.overflow = 'hidden';

    const s2Options: S2Options = {
      width: chartRef.current.clientWidth,
      height: crossTableHeight,
      interaction: {
        hoverHighlight: true,
      },
      seriesNumber: { enable: false },
      tooltip: {
        enable: true,
        render: (_s2Inst: any): any => ({
          show(opts: any) {
            const operator = opts?.options?.operator;
            if (!operator?.menu?.items?.length) return;
            // 移除旧菜单
            document.querySelectorAll('.s2-sort-menu').forEach(el => el.remove());
            const menu = document.createElement('div');
            menu.className = 's2-sort-menu';
            Object.assign(menu.style, {
              position: 'fixed', zIndex: '9999', background: '#fff',
              boxShadow: '0 2px 8px rgba(0,0,0,.15)', borderRadius: '6px',
              padding: '4px 0', minWidth: '100px',
              left: `${opts.position.x}px`, top: `${opts.position.y}px`,
            });
            operator.menu.items.forEach((item: any) => {
              const row = document.createElement('div');
              row.textContent = item.label;
              Object.assign(row.style, {
                padding: '7px 16px', cursor: 'pointer', fontSize: '14px', color: '#000',
              });
              row.onmouseenter = () => { row.style.background = '#f5f5f5'; };
              row.onmouseleave = () => { row.style.background = ''; };
              row.onclick = () => {
                operator.menu.onClick({ key: item.key });
                menu.remove();
              };
              menu.appendChild(row);
            });
            document.body.appendChild(menu);
            // 点击外部关闭
            const close = (e: MouseEvent) => {
              if (!menu.contains(e.target as Node)) { menu.remove(); document.removeEventListener('click', close, true); }
            };
            setTimeout(() => document.addEventListener('click', close, true), 0);
          },
          hide() { document.querySelectorAll('.s2-sort-menu').forEach(el => el.remove()); },
          destroy() { document.querySelectorAll('.s2-sort-menu').forEach(el => el.remove()); },
        }),
      },
      headerActionIcons: [
        {
          icons: ['SortDown'],
          belongsCell: 'colCell',
          defaultHide: true,
          displayCondition: (meta: any) => !meta.isTotals,
          onClick: ({ event, meta }: any) => {
            s2Instance.handleGroupSort(event, meta);
          },
        },
        {
          icons: ['SortDown'],
          belongsCell: 'rowCell',
          defaultHide: true,
          displayCondition: (meta: any) => !meta.isTotals,
          onClick: ({ event, meta }: any) => {
            s2Instance.handleGroupSort(event, meta);
          },
        },
      ],
    };

    let s2Instance: PivotSheet;
    const s2 = new PivotSheet(chartRef.current, s2DataConfig, s2Options);
    s2Instance = s2;
    s2.on(S2Event.RANGE_SORT, (params) => {
      crossTableSortParamsRef.current = params;
      s2.setDataCfg({ ...s2DataConfig, sortParams: params });
      s2.render(false);
    });
    chartInstanceRef.current = s2;
    s2.render();
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
        if (chartRef.current) {
          chartRef.current.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">Y轴字段无有效数值</div>';
        }
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
        if (chartRef.current) {
          chartRef.current.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">Y轴字段无有效数值</div>';
        }
        return;
      }

      // 计算分组系列信息（用于自定义图例）
      let seriesItems: Array<{ name: string; color: string }> = [];
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
          chart.slider('x', { values: [0, 1], style: { trackSize: 6, handleIconSize: 4 }, showLabelOnInteraction: true });
        }

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
          area.scale('color', { range: G2_COLORS });
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
          line.scale('color', { range: G2_COLORS });
        }

        chart.legend(false);
      }, hasLegend ? LINE_LEGEND_HEIGHT : 0);

      if (hasLegend) renderCustomLegend(seriesItems);
    } else {
      // 多Y轴：将宽格式数据转换为长格式
      const multiSeriesItems = actualYFields.map((f, i) => ({ name: getFieldLabel(f), color: G2_COLORS[i % G2_COLORS.length] }));
      const visibleMetrics = new Set(multiSeriesItems.filter(s => !hiddenSeriesRef.current.has(s.name)).map(s => s.name));

      const longData: any[] = [];
      chartData.forEach(item => {
        actualYFields.forEach(yField => {
          const value = Number(item[yField]) || 0;
          if (!isNaN(value) && visibleMetrics.has(getFieldLabel(yField))) {
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
        chart.axis('y', {
          title: { text: '值', style: { fontSize: 12 } },
          labelFormatter: (v: any) => formatAxisValue(v),
        });
        if (dataCount > 50) {
          chart.slider('x', { values: [0, 1], style: { trackSize: 6, handleIconSize: 4 }, showLabelOnInteraction: true });
        }

        chart
          .line()
          .data(longData)
          .encode('x', actualXField)
          .encode('y', '_value')
          .encode('color', '_metric')
          .encode('shape', 'smooth')
          .scale('color', { range: G2_COLORS })
          .style({ lineWidth: 2 })
          .interaction('elementHighlight')
          .tooltip({
            title: (d: any) => String(d[actualXField] ?? ''),
            items: [
              (d: any) => {
                const metric = String(d._metric ?? '');
                const yField = actualYFields.find(f => getFieldLabel(f) === metric) ?? '';
                return {
                  name: metric,
                  value: formatValue(lineXMetricsMap[String(d[actualXField] ?? '')]?.[yField], yFormatLookup[yField]),
                };
              },
            ],
          });

        chart.legend(false);
      }, LINE_LEGEND_HEIGHT);

      renderCustomLegend(multiSeriesItems);
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
    const leftLongData: any[] = [];
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
    const rightLongData: any[] = [];
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

    createAndRenderG2Chart((chart) => {
      chart.axis('x', xAxisConfig);
      if (dataCount > 50) {
        chart.slider('x', { values: [0, 1], style: { trackSize: 6, handleIconSize: 4 }, showLabelOnInteraction: true });
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
            items: [
              (d: any) => {
                const rawField = String(d._rawMetricL ?? '');
                return {
                  name: getFieldLabel(rawField),
                  value: formatValue(xMetricsMap[String(d[actualXField] ?? '')]?.[rawField], dualFormatLookup[rawField]),
                };
              },
            ],
          });

        if (actualLeftFields.length > 1) {
          bar.encode('color', '_metricL');
          if (useStack) bar.transform({ type: 'stackY' });
        }
      }

      if (rightLongData.length > 0) {
        const orangeColors = ['#FA8C16', '#F5222D', '#FADB14', '#52C41A', '#722ED1', '#13C2C2'];
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
          })
          .tooltip(false);

        if (actualRightFields.length > 1) {
          line.encode('color', '_metricR').scale('color', { range: orangeColors });
        } else {
          line.style({ stroke: '#FA8C16' });
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
    const orangeColors = ['#FA8C16', '#F5222D', '#FADB14', '#52C41A', '#722ED1', '#13C2C2'];
    const dualLegendItems = [
      ...actualLeftFields.map((f, i) => ({ name: getFieldLabel(f), color: G2_COLORS[i % G2_COLORS.length] })),
      ...actualRightFields.map((f, i) => ({ name: getFieldLabel(f), color: actualRightFields.length > 1 ? orangeColors[i % orangeColors.length] : '#FA8C16' })),
    ];
    renderCustomLegend(dualLegendItems);
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

  // 折线图自定义图例（含反选 icon）
  const renderCustomLegend = (series: Array<{ name: string; color: string }>) => {
    if (!legendContainerRef.current || series.length === 0) return;
    const allNames = series.map(s => s.name);
    const container = legendContainerRef.current;
    container.innerHTML = '';
    container.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:12px;padding:4px 12px;';

    series.forEach(({ name, color }) => {
      const isHidden = hiddenSeriesRef.current.has(name);
      const isSolo = !isHidden && hiddenSeriesRef.current.size > 0;

      const item = document.createElement('div');
      item.style.cssText = `display:flex;align-items:center;gap:4px;cursor:pointer;opacity:${isHidden ? 0.35 : 1};user-select:none;transition:opacity 0.15s;`;

      const dot = document.createElement('span');
      dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;`;

      const label = document.createElement('span');
      label.style.cssText = 'font-size:12px;color:#595959;';
      label.textContent = name;

      const soloBtn = document.createElement('span');
      soloBtn.title = '仅显示此项';
      soloBtn.style.cssText = `display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;cursor:pointer;color:${isSolo ? '#1783FF' : '#bfbfbf'};transition:color 0.15s;flex-shrink:0;`;
      soloBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.5"/><circle cx="6" cy="6" r="2" fill="currentColor"/></svg>`;

      soloBtn.addEventListener('mouseenter', () => { soloBtn.style.color = '#1783FF'; });
      soloBtn.addEventListener('mouseleave', () => { soloBtn.style.color = (hiddenSeriesRef.current.size > 0 && !hiddenSeriesRef.current.has(name)) ? '#1783FF' : '#bfbfbf'; });

      soloBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const hidden = hiddenSeriesRef.current;
        if (hidden.size === allNames.length - 1 && !hidden.has(name)) {
          hiddenSeriesRef.current = new Set();
        } else {
          hiddenSeriesRef.current = new Set(allNames.filter(n => n !== name));
        }
        renderChartCallbackRef.current();
      });

      item.addEventListener('click', () => {
        const hidden = hiddenSeriesRef.current;
        const newHidden = new Set(hidden);
        if (newHidden.has(name)) {
          newHidden.delete(name);
        } else {
          if (allNames.filter(n => !hidden.has(n)).length <= 1) return;
          newHidden.add(name);
        }
        hiddenSeriesRef.current = newHidden;
        renderChartCallbackRef.current();
      });

      item.appendChild(dot);
      item.appendChild(label);
      item.appendChild(soloBtn);
      container.appendChild(item);
    });
  };

  // 渲染默认内容
  const renderDefault = () => {
    if (!chartRef.current) return;
    chartRef.current.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #999;">请先选择数据集</div>';
  };

  renderChartCallbackRef.current = renderChart;

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'visible' }}>
      <div
        ref={chartRef}
        style={{ flex: 1, minHeight: 0, overflow: 'visible' }}
      />
      <div ref={legendContainerRef} style={{ flexShrink: 0 }} />
    </div>
  );
};

export default ChartRenderer;
