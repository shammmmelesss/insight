import React, { useState } from 'react';
import type { FieldConfig } from './types';

// 管理各图表区域的字段列表（行/列/指标/X轴/Y轴/右Y轴/分组/指标卡/筛选）及其增删/重排逻辑。
// 纯状态 + 纯处理函数，不涉及任何副作用或异步，从主组件中抽离以降低噪音。
export function useFieldAreas() {
  const [rowFields, setRowFields] = useState<FieldConfig[]>([]);
  const [colFields, setColFields] = useState<FieldConfig[]>([]);
  const [measureFields, setMeasureFields] = useState<FieldConfig[]>([]);
  const [xAxisFields, setXAxisFields] = useState<FieldConfig[]>([]);
  const [yAxisFields, setYAxisFields] = useState<FieldConfig[]>([]);
  const [y2AxisFields, setY2AxisFields] = useState<FieldConfig[]>([]);
  const [groupFields, setGroupFields] = useState<FieldConfig[]>([]);
  const [indicatorFields, setIndicatorFields] = useState<FieldConfig[]>([]);
  const [filterFields, setFilterFields] = useState<FieldConfig[]>([]);

  const fieldSetters: Record<string, React.Dispatch<React.SetStateAction<FieldConfig[]>>> = {
    row: setRowFields,
    col: setColFields,
    measure: setMeasureFields,
    xAxis: setXAxisFields,
    yAxis: setYAxisFields,
    y2Axis: setY2AxisFields,
    group: setGroupFields,
    indicator: setIndicatorFields,
    filter: setFilterFields,
  };

  const getAreaFields = (area: string): FieldConfig[] => {
    const map: Record<string, FieldConfig[]> = {
      row: rowFields, col: colFields, measure: measureFields,
      xAxis: xAxisFields, yAxis: yAxisFields, y2Axis: y2AxisFields,
      group: groupFields, indicator: indicatorFields, filter: filterFields,
    };
    return map[area] || [];
  };

  const handleReorder = (area: string, fromIndex: number, toIndex: number) => {
    fieldSetters[area]?.(prev => {
      const arr = [...prev];
      const [item] = arr.splice(fromIndex, 1);
      const insertAt = toIndex > fromIndex ? toIndex - 1 : toIndex;
      arr.splice(insertAt, 0, item);
      return arr;
    });
  };

  const handleRemoveField = (area: string, originalName: string) => {
    fieldSetters[area]?.(prev => prev.filter(f => f.originalName !== originalName));
  };

  return {
    rowFields, setRowFields,
    colFields, setColFields,
    measureFields, setMeasureFields,
    xAxisFields, setXAxisFields,
    yAxisFields, setYAxisFields,
    y2AxisFields, setY2AxisFields,
    groupFields, setGroupFields,
    indicatorFields, setIndicatorFields,
    filterFields, setFilterFields,
    fieldSetters,
    getAreaFields,
    handleReorder,
    handleRemoveField,
  };
}
