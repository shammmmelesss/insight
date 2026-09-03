import { useEffect, useRef, useImperativeHandle, forwardRef, memo } from 'react';
import type { ChartType } from '@shared/api.interface';
import { PivotSheet, asyncGetAllPlainData } from '@antv/s2';
import '@antv/s2/dist/s2.min.css';
import { Chart } from '@antv/g2';

import type { ChartDatum, RenderContext, SeriesItem } from './ChartRenderer/context';
import * as fmt from './ChartRenderer/format';
import { renderCustomLegend } from './ChartRenderer/legend';
import { renderCrossTable } from './ChartRenderer/crossTable';
import { renderBarChart } from './ChartRenderer/barChart';
import { renderLineChart } from './ChartRenderer/lineChart';
import { renderDualAxisChart } from './ChartRenderer/dualAxis';
import { renderPieChart } from './ChartRenderer/pieChart';
import { renderIndicatorCard } from './ChartRenderer/indicatorCard';
import { downloadSensitiveCsv } from '../utils/csvDownload';

export interface ChartRendererHandle {
  /** 下载当前图表的数据为 CSV（支持所有图表类型） */
  downloadData: (fileName?: string) => Promise<void>;
}

interface ChartRendererProps {
  chartType: ChartType;
  chartData?: ChartDatum[];
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
  /** 非空时以占位提示替代图表内容（如数据集抽取中「数据正在写入」） */
  statusMessage?: string;
}

const ChartRenderer = forwardRef<ChartRendererHandle, ChartRendererProps>(({
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
  statusMessage,
}, ref) => {
  const getFieldLabel = (key: string): string => fieldLabelMap[key] || key;
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<PivotSheet | Chart | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const lastWidthRef = useRef<number>(0);
  const hiddenSeriesRef = useRef<Set<string>>(new Set());
  const crossTableSortParamsRef = useRef<any[]>([]);
  const legendContainerRef = useRef<HTMLDivElement>(null);
  const renderChartCallbackRef = useRef<() => void>(() => {});

  // 创建并渲染 G2 图表的公共函数
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

    // 将 tooltip 挂载到 body，避免被容器的 overflow:hidden 裁剪（G2 会按画布偏移正确定位）
    chart.interaction('tooltip', { enterable: true, mount: document.body });
    chartConfig(chart);
    chart.render();
    chartInstanceRef.current = chart;
  };

  // 构建渲染上下文（绑定当前 props 与 ref）
  const buildContext = (): RenderContext => ({
    container: chartRef.current as HTMLDivElement,
    legendContainer: legendContainerRef.current,
    chartType,
    chartData,
    rowFields,
    colFields,
    measureFields,
    xAxisFields,
    yAxisFields,
    y2AxisFields,
    groupFields,
    indicatorFields,
    containerHeight,
    fieldFormats,
    hiddenSeriesRef,
    crossTableSortParamsRef,
    chartInstanceRef,
    getFieldLabel,
    formatValue: fmt.formatValue,
    formatAxisValue: fmt.formatAxisValue,
    getActualField: fmt.getActualField,
    getActualFields: fmt.getActualFields,
    buildFormatLookup: (propFields, dataFields) => fmt.buildFormatLookup(fieldFormats, propFields, dataFields),
    createAndRenderG2Chart,
    renderCustomLegend: (series: SeriesItem[]) => renderCustomLegend(buildContext(), series),
    rerender: () => renderChartCallbackRef.current(),
  });

  // 渲染默认内容
  const renderDefault = () => {
    if (!chartRef.current) return;
    chartRef.current.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #999;">请先选择数据集</div>';
  };

  // 渲染状态占位提示（如数据集抽取中「数据正在写入」）
  const renderStatus = (msg: string) => {
    if (!chartRef.current) return;
    if (legendContainerRef.current) legendContainerRef.current.innerHTML = '';
    chartRef.current.innerHTML = `<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #999;">${msg}</div>`;
  };

  // 渲染图表的公共函数：清理旧实例并按类型分发
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

    // 抽取中等状态：仅显示占位提示，跳过图表渲染
    if (statusMessage) {
      renderStatus(statusMessage);
      return;
    }

    try {
      // 清理之前的内容
      chartRef.current.innerHTML = '';
      if (legendContainerRef.current) legendContainerRef.current.innerHTML = '';

      const ctx = buildContext();
      // 根据图表类型调用对应的渲染函数
      switch (chartType) {
        case 'crossTable': renderCrossTable(ctx); break;
        case 'bar': renderBarChart(ctx); break;
        case 'line': renderLineChart(ctx); break;
        case 'pie': renderPieChart(ctx); break;
        case 'indicator': renderIndicatorCard(ctx); break;
        case 'dualAxis': renderDualAxisChart(ctx); break;
        default: renderDefault();
      }
    } catch (error) {
      console.error('Failed to render chart:', error);
      renderDefault();
    }
  };

  // 保证 legend 等异步回调始终调用最新的 renderChart
  renderChartCallbackRef.current = renderChart;

  useEffect(() => {
    hiddenSeriesRef.current = new Set();
    crossTableSortParamsRef.current = [];
    renderChart();
    if (chartRef.current) {
      lastWidthRef.current = chartRef.current.clientWidth;
    }

    // 添加 ResizeObserver 监听容器大小变化，仅在宽度变化时重新渲染（防抖）
    if (chartRef.current) {
      let resizeTimer: ReturnType<typeof setTimeout> | null = null;
      resizeObserverRef.current = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const newWidth = entry.contentRect.width;
        if (Math.abs(newWidth - lastWidthRef.current) > 1) {
          lastWidthRef.current = newWidth;
          if (resizeTimer) clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => renderChart(), 150);
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
  }, [chartType, chartData, rowFields, colFields, measureFields, xAxisFields, yAxisFields, y2AxisFields, groupFields, indicatorFields, containerHeight, fieldFormats, statusMessage]);

  // CSV 字段转义：含逗号/引号/换行时用双引号包裹并转义内部引号
  const escapeCsvCell = (value: unknown): string => {
    const s = value == null ? '' : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  // 由 chartData 构建 CSV（用于 G2 类图表：柱/线/饼/双轴/指标卡）
  const buildDataCsv = (): string => {
    if (!chartData.length) return '';
    const keys = Array.from(
      chartData.reduce<Set<string>>((set, row) => {
        Object.keys(row).forEach((k) => set.add(k));
        return set;
      }, new Set<string>())
    );
    const header = keys.map((k) => escapeCsvCell(getFieldLabel(k))).join(',');
    const rows = chartData.map((row) =>
      keys.map((k) => escapeCsvCell(fmt.formatValue(row[k], fieldFormats[k]))).join(',')
    );
    return [header, ...rows].join('\n');
  };

  const handleDownloadData = async (fileName = 'chart') => {
    if (chartType === 'crossTable') {
      const s2 = chartInstanceRef.current as PivotSheet;
      if (!s2) return;
      const data = await asyncGetAllPlainData({ sheetInstance: s2, split: ',', formatOptions: true });
      await downloadSensitiveCsv(data, fileName);
      return;
    }
    const csv = buildDataCsv();
    if (!csv) return;
    await downloadSensitiveCsv(csv, fileName);
  };

  useImperativeHandle(ref, () => ({ downloadData: handleDownloadData }));

  return (
    <div style={{ width: '100%', height: containerHeight ? `${containerHeight}px` : '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div
        ref={chartRef}
        style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}
      />
      <div ref={legendContainerRef} style={{ flexShrink: 0 }} />
    </div>
  );
});

export default memo(ChartRenderer);
