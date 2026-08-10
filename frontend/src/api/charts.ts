import api from '@/api/client';
import type { ChartOption } from '@shared/api.interface';

/** 获取图表下拉选项列表。 */
export async function fetchChartOptions(): Promise<ChartOption[]> {
  const res = await api.get('/api/charts/select-list');
  return res.data?.items ?? [];
}
