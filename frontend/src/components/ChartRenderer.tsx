import React, { useEffect, useRef } from 'react';

// 图表类型
type ChartType = 'crossTable' | 'bar' | 'line' | 'pie' | 'indicator';
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
  groupFields?: string[];
  indicatorFields?: string[];
}

const ChartRenderer: React.FC<ChartRendererProps> = ({
  chartType,
  chartData = [],
  rowFields = [],
  colFields = [],
  measureFields = [],
  xAxisFields = [],
  yAxisFields = [],
  groupFields = [],
  indicatorFields = [],
}) => {
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

  // 创建并渲染G2图表的公共函数
  const createAndRenderG2Chart = (chartConfig: (chart: Chart) => void) => {
    if (!chartRef.current) return;

    let defaultHeight = 360;
    if (chartType === 'pie') {
      defaultHeight = 280;
    } else if (chartType === 'indicator') {
      defaultHeight = 200;
    }

    const chart = new Chart({
      container: chartRef.current,
      width: chartRef.current.clientWidth,
      height: defaultHeight,
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
  }, [chartType, chartData, rowFields, colFields, measureFields, xAxisFields, yAxisFields, groupFields, indicatorFields]);

  // 渲染交叉表
  const renderCrossTable = () => {
    if (!chartRef.current || chartData.length === 0) return;

    // 获取数据中的实际字段名
    const dataFields = chartData.length > 0 ? Object.keys(chartData[0]) : [];
    
    // 处理度量字段，使用数据中的实际字段名（可能是聚合后的字段名）
    const actualMeasureFields = getActualFields(measureFields, dataFields);

    const s2DataConfig = {
      fields: {
        rows: rowFields,
        columns: colFields,
        values: actualMeasureFields,
      },
      data: chartData,
    };

    // 为交叉表设置合理的默认高度
    const defaultHeight = 300;

    const s2Options: S2Options = {
      width: chartRef.current.clientWidth,
      height: defaultHeight,
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
        chart.axis(actualXField, {
          label: {
            style: { textWrap: { width: 80, method: 'wrap' } },
            align: 'center',
          },
          title: { text: actualXField, style: { fontSize: 12 } },
        });
        chart.axis(actualYField, {
          title: { text: actualYField, style: { fontSize: 12 } },
          label: { style: { fontSize: 11 }, formatter: (v: any) => Number(v).toLocaleString() },
        });

        const bar = chart
          .interval()
          .data(cleanedData)
          .encode('x', actualXField)
          .encode('y', actualYField)
          .style({ fillOpacity: 1, lineWidth: 0 })
          .interaction('elementHighlight', { background: true })
          .tooltip((d: any) => {
            const xValue = d[actualXField] !== undefined ? d[actualXField] : '';
            const yValue = d[actualYField] !== undefined ? d[actualYField] : 0;
            const tooltipItems: any = {
              [actualXField]: xValue,
              [actualYField]: yValue,
            };
            if (actualGroupField) {
              tooltipItems[actualGroupField] = d[actualGroupField] !== undefined ? d[actualGroupField] : '';
            }
            return tooltipItems;
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
              _metric: yField,
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

      createAndRenderG2Chart((chart) => {
        chart.axis(actualXField, {
          label: {
            style: { textWrap: { width: 80, method: 'wrap' } },
            align: 'center',
          },
          title: { text: actualXField, style: { fontSize: 12 } },
        });
        chart.axis('_value', {
          title: { text: '值', style: { fontSize: 12 } },
          label: { style: { fontSize: 11 }, formatter: (v: any) => Number(v).toLocaleString() },
        });

        chart
          .interval()
          .data(longData)
          .encode('x', actualXField)
          .encode('y', '_value')
          .encode('color', '_metric')
          .style({ fillOpacity: 1, lineWidth: 0 })
          .interaction('elementHighlight', { background: true })
          .tooltip((d: any) => ({
            [actualXField]: d[actualXField] !== undefined ? d[actualXField] : '',
            指标: d._metric,
            值: d._value,
          }));

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
        chart.axis(actualXField, {
          label: {
            style: { textWrap: { width: 80, method: 'wrap' } },
            align: 'center',
          },
          title: { text: actualXField, style: { fontSize: 12 } },
        });
        chart.axis(actualYField, {
          title: { text: actualYField, style: { fontSize: 12 } },
          label: { style: { fontSize: 11 }, formatter: (v: any) => Number(v).toLocaleString() },
        });

        const area = chart
          .area()
          .data(cleanedData)
          .encode('x', actualXField)
          .encode('y', actualYField)
          .encode('shape', 'smooth')
          .style({ fillOpacity: 0.15 });

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
          .interaction('elementHighlight', { background: true })
          .tooltip((d: any) => {
            const xValue = d[actualXField] !== undefined ? d[actualXField] : '';
            const yValue = d[actualYField] !== undefined ? d[actualYField] : 0;
            const tooltipItems: any = {
              [actualXField]: xValue,
              [actualYField]: yValue,
            };
            if (actualGroupField) {
              tooltipItems[actualGroupField] = d[actualGroupField] !== undefined ? d[actualGroupField] : '';
            }
            return tooltipItems;
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
              _metric: yField,
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

      createAndRenderG2Chart((chart) => {
        chart.axis(actualXField, {
          label: {
            style: { textWrap: { width: 80, method: 'wrap' } },
            align: 'center',
          },
          title: { text: actualXField, style: { fontSize: 12 } },
        });
        chart.axis('_value', {
          title: { text: '值', style: { fontSize: 12 } },
          label: { style: { fontSize: 11 }, formatter: (v: any) => Number(v).toLocaleString() },
        });

        chart
          .area()
          .data(longData)
          .encode('x', actualXField)
          .encode('y', '_value')
          .encode('color', '_metric')
          .encode('shape', 'smooth')
          .style({ fillOpacity: 0.15 });

        chart
          .line()
          .data(longData)
          .encode('x', actualXField)
          .encode('y', '_value')
          .encode('color', '_metric')
          .encode('shape', 'smooth')
          .style({ lineWidth: 2 })
          .interaction('elementHighlight', { background: true })
          .tooltip((d: any) => ({
            [actualXField]: d[actualXField] !== undefined ? d[actualXField] : '',
            指标: d._metric,
            值: d._value,
          }));

        chart.legend('color', { position: 'bottom', layout: { justifyContent: 'center' } });
      });
    }
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
            value: `${value}`,
            percentage: `${percentage}%`,
          };
        });
    });
  };

  // 渲染指标卡
  const renderIndicatorCard = () => {
    if (chartData.length === 0) {
      if (chartRef.current) {
        chartRef.current.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">暂无数据</div>';
      }
      return;
    }

    // 获取数据中的实际字段名
    const dataFields = Object.keys(chartData[0]);
    
    // 处理指标字段 - 安全检查
    let actualIndicatorField = '';
    if (Array.isArray(indicatorFields) && indicatorFields.length > 0 && indicatorFields[0]) {
      actualIndicatorField = getActualField(indicatorFields[0], dataFields);
    }
    
    // 校验核心字段是否存在
    if (!actualIndicatorField) {
      if (chartRef.current) {
        chartRef.current.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">请配置有效的指标字段</div>';
      }
      return;
    }
    
    // 数据清洗函数，确保指标值为数值类型
    const cleanIndicatorData = (data: any[], indicatorField: string) => {
      return data.map(item => ({
        ...item,
        [indicatorField]: Number(item[indicatorField]) || 0, // 非数值转0，避免渲染异常
      })).filter(item => !isNaN(item[indicatorField])); // 过滤NaN数据
    };
    
    const cleanedData = cleanIndicatorData(chartData, actualIndicatorField);
    
    if (cleanedData.length === 0) {
      if (chartRef.current) {
        chartRef.current.innerHTML = '<div style="text-align:center; color:#999; padding:20px;">指标字段无有效数值</div>';
      }
      return;
    }

    createAndRenderG2Chart((chart) => {
      // 使用文本标签实现指标卡效果
      chart
        .text()
        .data(cleanedData)
        .encode('text', (d: any) => {
          const value = d[actualIndicatorField] || 0;
          return `${d.name || '指标'}: ${value}`;
        })
        .style('fontSize', 24)
        .style('textAlign', 'center')
        .style('fill', '#165DFF')
        // 新增：Tooltip 配置
        .tooltip((d: any) => {
          return {
            名称: d.name || '指标',
            值: d[actualIndicatorField],
          };
        });
    });
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
        overflow: 'hidden',
      }}
    />
  );
};

export default ChartRenderer;
