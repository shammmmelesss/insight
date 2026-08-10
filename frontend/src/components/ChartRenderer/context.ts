import type { MutableRefObject } from 'react';
import type { Chart } from '@antv/g2';
import type { PivotSheet } from '@antv/s2';
import type { ChartType } from '@shared/api.interface';

// 单行数据；字段名动态，值类型不定
export type ChartDatum = Record<string, any>;

export interface SeriesItem {
  name: string;
  color: string;
}

// 渲染上下文：封装所有 props、可变 ref 和共享基础设施，
// 每个图表渲染器接收它即可自洽，不再依赖组件闭包。
export interface RenderContext {
  container: HTMLDivElement;
  legendContainer: HTMLDivElement | null;
  chartType: ChartType;
  chartData: ChartDatum[];
  rowFields: string[];
  colFields: string[];
  measureFields: string[];
  xAxisFields: string[];
  yAxisFields: string[];
  y2AxisFields: string[];
  groupFields: string[];
  indicatorFields: string[];
  containerHeight?: number;
  fieldFormats: Record<string, string>;

  // 可变状态（保持与原组件一致的 ref 语义）
  hiddenSeriesRef: MutableRefObject<Set<string>>;
  crossTableSortParamsRef: MutableRefObject<any[]>;
  chartInstanceRef: MutableRefObject<PivotSheet | Chart | null>;

  // 字段 / 格式化工具（已绑定当前 props）
  getFieldLabel: (key: string) => string;
  formatValue: (value: unknown, format?: string, axis?: boolean) => string;
  formatAxisValue: (value: unknown) => string;
  getActualField: (field: string, dataFields: string[]) => string;
  getActualFields: (fields: string[], dataFields: string[]) => string[];
  buildFormatLookup: (propFields: string[], dataFields: string[]) => Record<string, string>;

  // 基础设施
  createAndRenderG2Chart: (config: (chart: Chart) => void, legendHeight?: number) => void;
  renderCustomLegend: (series: SeriesItem[]) => void;
  rerender: () => void;
}

// 在容器中央显示一条提示文案的公共辅助
export const showMessage = (container: HTMLDivElement | null, text: string) => {
  if (container) {
    container.innerHTML = `<div style="text-align:center; color:#999; padding:20px;">${text}</div>`;
  }
};
