// 图表字段配置的共享类型

export interface FieldConfig {
  originalName: string;
  displayName: string;
  description?: string;
  type: string;
  isCalculated?: boolean;
  expression?: string;
  config?: {
    aggregation?: string;
    dataFormat?: string;
    sort?: string;
    filterType?: 'multiple' | 'single' | 'dateRange';
    filterDefault?: any;
    /** 排除模式：true 时使用 NOT IN 而非 IN（仅单选/多选有效） */
    filterExclude?: boolean;
  };
}

// 字段设置弹窗使用的临时配置
export type TempFieldConfig = NonNullable<FieldConfig['config']>;

// 区域批量设置弹窗使用的逐字段编辑草稿
export interface AreaFieldEdit {
  displayName?: string;
  description?: string;
  config?: FieldConfig['config'];
}
