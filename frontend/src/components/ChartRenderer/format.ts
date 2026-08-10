// 纯格式化 / 字段解析工具，无副作用、无闭包依赖

// 获取数据中的实际字段名（支持聚合后的字段名，如 col3_计数, col3_求和 等）
export const getActualField = (field: string, dataFields: string[]): string => {
  // 优先精确匹配（支持完整聚合别名如 amount_求和）
  const exactMatch = dataFields.find(f => f === field);
  if (exactMatch) return exactMatch;
  // 回退到前缀匹配（兼容原始字段名的单聚合场景）
  const prefixMatch = dataFields.find(f => f.startsWith(`${field}_`));
  return prefixMatch || field;
};

// 获取多个数据中的实际字段名
export const getActualFields = (fields: string[], dataFields: string[]): string[] =>
  fields.map(field => getActualField(field, dataFields));

// 将大数字缩写为 k/w/亿 形式用于 y 轴标签
export const formatAxisValue = (value: unknown): string => {
  const num = Number(value);
  if (isNaN(num)) return String(value ?? '');
  const abs = Math.abs(num);
  if (abs >= 100_000_000) return (num / 100_000_000).toFixed(abs % 100_000_000 === 0 ? 0 : 1) + '亿';
  if (abs >= 10_000) return (num / 10_000).toFixed(abs % 10_000 === 0 ? 0 : 1) + 'w';
  if (abs >= 1_000) return (num / 1_000).toFixed(abs % 1_000 === 0 ? 0 : 1) + 'k';
  return num.toLocaleString();
};

// 根据数据格式设置格式化数值，axis=true 时无特殊格式则用缩写
export const formatValue = (value: unknown, format?: string, axis = false): string => {
  const num = Number(value);
  if (isNaN(num)) return String(value ?? '');
  switch (format) {
    case '百分比': return (num * 100).toFixed(2) + '%';
    case '千分比': return (num * 1000).toFixed(2) + '‰';
    case '小数': return num.toFixed(2);
    case '1位小数': return num.toFixed(1);
    case '2位小数': return num.toFixed(2);
    case '整数': return Math.round(num).toLocaleString();
    default: return axis ? formatAxisValue(num) : num.toLocaleString();
  }
};

// 构建 实际字段名 → 数据格式 的映射表
export const buildFormatLookup = (
  fieldFormats: Record<string, string>,
  propFields: string[],
  dataFields: string[],
): Record<string, string> => {
  const map: Record<string, string> = {};
  propFields.filter(f => f).forEach(f => {
    if (fieldFormats[f]) {
      map[getActualField(f, dataFields)] = fieldFormats[f];
    }
  });
  return map;
};
