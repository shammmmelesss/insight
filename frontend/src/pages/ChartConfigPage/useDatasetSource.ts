import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { fetchDatasetOptions } from '@/api/datasets';
import type { FieldConfig } from './types';

interface UseDatasetSourceParams {
  selectedDataset: string;
  // 数据集切换时需要重置筛选值；加载图表时可能有待应用的筛选默认值
  setFilterValues: (v: Record<string, any>) => void;
  onError: (msg: string) => void;
}

// 负责加载数据集元数据（字段、SQL、数据源类型）与筛选字段候选值。
// 不涉及预览请求（依赖 generateSQL）与筛选值初始化（依赖 filterValues），
// 这两部分仍留在主组件以避免循环依赖并保持 effect 时序不变。
export function useDatasetSource({ selectedDataset, setFilterValues, onError }: UseDatasetSourceParams) {
  const [datasets, setDatasets] = useState<{ id: string; name: string }[]>([]);
  const [datasetFields, setDatasetFields] = useState<FieldConfig[]>([]);
  const [datasetSQL, setDatasetSQL] = useState('');
  const [dataSourceId, setDataSourceId] = useState('');
  const [dataSourceType, setDataSourceType] = useState('');
  const [datasetType, setDatasetType] = useState<string>('');
  const [loadedDatasetId, setLoadedDatasetId] = useState('');
  const [filterFieldOptions, setFilterFieldOptions] = useState<Record<string, string[]>>({});

  const loadedFilterKeys = useRef<Set<string>>(new Set());
  const pendingFilterValues = useRef<Record<string, any> | null>(null);

  useEffect(() => {
    fetchDatasetOptions()
      .then(setDatasets)
      .catch(() => onError('获取数据集列表失败'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedDataset) {
      setDatasetFields([]); setDatasetSQL(''); setDataSourceId('');
      return;
    }
    loadedFilterKeys.current.clear();
    setFilterFieldOptions({});
    setFilterValues({});
    setLoadedDatasetId('');
    axios.get(`/api/datasets/${selectedDataset}`).then(res => {
      setDatasetFields(res.data.fieldsConfig || []);
      const dsType = res.data.type || 'direct';
      setDatasetType(dsType);
      if (dsType === 'extract') {
        const ckTable = `ds_${res.data.id.replaceAll('-', '_')}`;
        setDatasetSQL(`SELECT * FROM insight.${ckTable}`);
      } else {
        setDatasetSQL(res.data.sql || '');
      }
      setDataSourceId(res.data.dataSourceId || '');
      setLoadedDatasetId(selectedDataset);
      if (pendingFilterValues.current) {
        setFilterValues(pendingFilterValues.current);
        pendingFilterValues.current = null;
      }
      // 获取数据源类型
      const dsId = res.data.dataSourceId;
      if (dsId) {
        axios.get(`/api/data-sources/${dsId}`).then(dsRes => {
          setDataSourceType(dsRes.data.type || '');
        }).catch(() => setDataSourceType(''));
      } else {
        setDataSourceType('');
      }
    }).catch(() => {
      onError('获取数据集字段失败');
      setDatasetFields([]); setDatasetSQL(''); setDataSourceId(''); setDataSourceType(''); setDatasetType('');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDataset]);

  const fetchFilterFieldOptions = useCallback(async (fieldName: string) => {
    if (!selectedDataset) return;
    const cacheKey = `${selectedDataset}:${fieldName}`;
    if (loadedFilterKeys.current.has(cacheKey)) return;
    loadedFilterKeys.current.add(cacheKey);
    try {
      const res = await axios.get(`/api/datasets/${selectedDataset}/field-values`, {
        params: { field: fieldName },
      });
      setFilterFieldOptions(prev => ({ ...prev, [cacheKey]: res.data.values || [] }));
    } catch {
      loadedFilterKeys.current.delete(cacheKey);
    }
  }, [selectedDataset]);

  return {
    datasets,
    datasetFields,
    datasetSQL,
    dataSourceId,
    dataSourceType,
    datasetType,
    loadedDatasetId,
    filterFieldOptions,
    fetchFilterFieldOptions,
    pendingFilterValues,
  };
}
