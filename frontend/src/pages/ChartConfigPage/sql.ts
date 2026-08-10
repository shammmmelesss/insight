import { resolveDateRangeValue, DateRangeFilterValue } from '../../components/DateRangeFilterPicker/DateRangeFilterPicker';
import type { FieldConfig } from './types';
import type { ChartType } from '@shared/api.interface';

const mapAggregationToSQL = (aggregation: string): string => {
  const map: Record<string, string> = {
    '求和': 'SUM',
    '平均值': 'AVG',
    '最大值': 'MAX',
    '最小值': 'MIN',
    '计数': 'COUNT',
    '去重计数': 'COUNT(DISTINCT',
  };
  return map[aggregation] ?? 'COUNT';
};

// 根据数据源类型获取标识符引号
const getIdentifierQuote = (dataSourceType: string): string => {
  const dsType = dataSourceType.toLowerCase();
  // MySQL、BigQuery 使用反引号
  if (dsType === 'mysql' || dsType === 'bigquery') {
    return '`';
  }
  // 其余（PostgreSQL、SQLite、Oracle、SQLServer、未知）均使用双引号（ANSI SQL 标准）
  return '"';
};

const buildAggField = (field: FieldConfig, dataSourceType: string) => {
  const aggregation = field.config?.aggregation || '计数';
  const quote = getIdentifierQuote(dataSourceType);
  const alias = `${quote}${field.originalName}_${aggregation}${quote}`;
  if (field.isCalculated && field.expression) {
    return `${field.expression} AS ${alias}`;
  }
  if (aggregation === '去重计数') {
    return `COUNT(DISTINCT ${field.originalName}) AS ${alias}`;
  }
  const fn = mapAggregationToSQL(aggregation);
  return `${fn}(${field.originalName}) AS ${alias}`;
};

export interface GenerateSQLParams {
  datasetSQL: string;
  selectedDataset: string;
  chartType: ChartType;
  rowFields: FieldConfig[];
  colFields: FieldConfig[];
  measureFields: FieldConfig[];
  xAxisFields: FieldConfig[];
  yAxisFields: FieldConfig[];
  y2AxisFields: FieldConfig[];
  groupFields: FieldConfig[];
  indicatorFields: FieldConfig[];
  filterFields: FieldConfig[];
  filterValues: Record<string, any>;
  dataSourceType: string;
}

// 单个图表查询返回的最大行数，需与后端 maxChartRows 保持一致
export const MAX_CHART_ROWS = 200000;

// 根据当前图表类型 / 字段配置 / 筛选值生成查询 SQL
export const generateSQL = (params: GenerateSQLParams): string => {
  const {
    datasetSQL, selectedDataset, chartType,
    rowFields, colFields, measureFields, xAxisFields, yAxisFields, y2AxisFields,
    groupFields, indicatorFields, filterFields, filterValues, dataSourceType,
  } = params;

  if (!datasetSQL) return `SELECT * FROM ${selectedDataset || 'your_table'}`;

  // 计算字段用表达式，普通字段用字段名
  const fieldExpr = (f: FieldConfig) => (f.isCalculated && f.expression) ? f.expression : f.originalName;
  const fieldSelect = (f: FieldConfig) =>
    (f.isCalculated && f.expression) ? `${f.expression} AS ${f.originalName}` : f.originalName;
  const aggField = (f: FieldConfig) => buildAggField(f, dataSourceType);

  const filterClauses = filterFields
    .map(f => {
      const filterType = f.config?.filterType || 'multiple';
      const vals = filterValues[f.originalName];
      if (!vals) return null;
      const expr = fieldExpr(f);
      if (filterType === 'dateRange') {
        if (vals && typeof vals === 'object' && 'startType' in vals) {
          const [s, e] = resolveDateRangeValue(vals as DateRangeFilterValue);
          return `${expr} BETWEEN '${s.format('YYYY-MM-DD')}' AND '${e.format('YYYY-MM-DD')}'`;
        }
        if (Array.isArray(vals) && vals.length === 2 && vals[0] && vals[1]) {
          return `${expr} BETWEEN '${vals[0]}' AND '${vals[1]}'`;
        }
        return null;
      }
      const arr: string[] = Array.isArray(vals) ? vals : (vals !== '' ? [String(vals)] : []);
      if (arr.length === 0) return null;
      const quoted = arr.map((v: string) => `'${v.replace(/'/g, "''")}'`).join(', ');
      return `${expr} IN (${quoted})`;
    })
    .filter((c): c is string => c !== null);

  const innerSQL = filterClauses.length > 0
    ? `SELECT * FROM (${datasetSQL}) AS _inner WHERE ${filterClauses.join(' AND ')}`
    : datasetSQL;

  const wrap = (fields: string[], aggFields: string[], groupBy: string[], orderBy: string[]) => {
    const all = [...fields, ...aggFields];
    if (all.length === 0) return `${innerSQL} LIMIT ${MAX_CHART_ROWS}`;
    let sql = `SELECT ${all.join(', ')} FROM (${innerSQL}) AS dataset WHERE 1=1`;
    if (groupBy.length > 0) sql += ` GROUP BY ${groupBy.join(', ')}`;
    if (orderBy.length > 0) sql += ` ORDER BY ${orderBy.join(', ')}`;
    sql += ` LIMIT ${MAX_CHART_ROWS}`;
    return sql;
  };

  const sortDir = (f: FieldConfig) => f.config?.sort === '降序' ? 'DESC' : 'ASC';

  if (chartType === 'crossTable') {
    const rows = rowFields.map(fieldSelect);
    const cols = colFields.map(fieldSelect);
    return wrap(
      [...rows, ...cols],
      measureFields.map(aggField),
      [...rowFields.map(fieldExpr), ...colFields.map(fieldExpr)],
      rowFields.map(f => `${fieldExpr(f)} ${sortDir(f)}`),
    );
  }
  if (chartType === 'bar' || chartType === 'line') {
    const xs = xAxisFields.map(fieldSelect);
    const gs = groupFields.map(fieldSelect);
    return wrap(
      [...xs, ...gs],
      yAxisFields.map(aggField),
      [...xAxisFields.map(fieldExpr), ...groupFields.map(fieldExpr)],
      xAxisFields.map(f => `${fieldExpr(f)} ${sortDir(f)}`),
    );
  }
  if (chartType === 'dualAxis') {
    const xs = xAxisFields.map(fieldSelect);
    return wrap(
      xs,
      [...yAxisFields.map(aggField), ...y2AxisFields.map(aggField)],
      xAxisFields.map(fieldExpr),
      xAxisFields.map(f => `${fieldExpr(f)} ${sortDir(f)}`),
    );
  }
  if (chartType === 'pie') {
    const gs = groupFields.map(fieldSelect);
    return wrap(gs, measureFields.map(aggField), groupFields.map(fieldExpr), []);
  }
  if (chartType === 'indicator') {
    const agg = indicatorFields.map(aggField);
    if (agg.length === 0) return `${innerSQL} LIMIT ${MAX_CHART_ROWS}`;
    return `SELECT ${agg.join(', ')} FROM (${innerSQL}) AS dataset WHERE 1=1 LIMIT ${MAX_CHART_ROWS}`;
  }
  return `${innerSQL} LIMIT ${MAX_CHART_ROWS}`;
};
