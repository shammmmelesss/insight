import api from '@/api/client';
import type { DatasetOption } from '@shared/api.interface';

/** 获取数据集下拉选项列表。 */
export async function fetchDatasetOptions(): Promise<DatasetOption[]> {
  const res = await api.get('/api/datasets/select-list');
  return res.data?.items ?? [];
}
