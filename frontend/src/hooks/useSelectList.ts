import { useCallback, useEffect, useState } from 'react';
import type { ChartOption, DatasetOption } from '@shared/api.interface';
import { fetchDatasetOptions } from '@/api/datasets';
import { fetchChartOptions } from '@/api/charts';

interface SelectListState<T> {
  items: T[];
  loading: boolean;
  reload: () => Promise<void>;
}

function useSelectList<T>(fetcher: () => Promise<T[]>, onError?: (e: unknown) => void): SelectListState<T> {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await fetcher());
    } catch (e) {
      onError?.(e);
    } finally {
      setLoading(false);
    }
    // fetcher/onError 由调用方保证稳定；仅在挂载时自动执行
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { items, loading, reload };
}

/** 数据集下拉列表，替代各页面重复的 /api/datasets/select-list 拉取逻辑。 */
export function useDatasetOptions(onError?: (e: unknown) => void): SelectListState<DatasetOption> {
  return useSelectList<DatasetOption>(fetchDatasetOptions, onError);
}

/** 图表下拉列表，替代各页面重复的 /api/charts/select-list 拉取逻辑。 */
export function useChartOptions(onError?: (e: unknown) => void): SelectListState<ChartOption> {
  return useSelectList<ChartOption>(fetchChartOptions, onError);
}
