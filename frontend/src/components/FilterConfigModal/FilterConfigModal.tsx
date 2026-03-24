import React, { useState, useEffect } from 'react';
import { Modal, Button, Layout, Form, Select, Radio, DatePicker, message, Spin } from 'antd';
import { PlusOutlined, DeleteOutlined } from '@ant-design/icons';
import axios from 'axios';
import { FilterField } from '@shared/api.interface';

const { Sider, Content } = Layout;
const { Option } = Select;
const { RangePicker } = DatePicker;

interface Dataset {
  id: string;
  name: string;
}

interface Chart {
  id: string;
  name: string;
  datasetId?: string;
}

interface FilterConfigModalProps {
  visible: boolean;
  onCancel: () => void;
  onOk: (filters: FilterField[]) => void;
  datasets: Dataset[];
  charts: Chart[];
  dashboardChartIds: string[];
  initialFilters?: FilterField[];
}

const FilterConfigModal: React.FC<FilterConfigModalProps> = ({ visible, onCancel, onOk, datasets, charts, dashboardChartIds, initialFilters }) => {
  const [fields, setFields] = useState<FilterField[]>([]);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [datasetFields, setDatasetFields] = useState<Record<string, Array<{ id: string; name: string }>>>({});
  const [fieldValues, setFieldValues] = useState<Record<string, any[]>>({});
  const [loadingValues, setLoadingValues] = useState(false);
  const [loading, setLoading] = useState(false);

  // 弹窗打开时加载已有筛选器配置
  useEffect(() => {
    if (visible && initialFilters && initialFilters.length > 0) {
      setFields(initialFilters);
      setSelectedFieldId(initialFilters[0].id);
      // 预加载已配置字段的数据集字段列表
      const datasetIds = [...new Set(initialFilters.map(f => f.dataset).filter(Boolean))];
      datasetIds.forEach(dsId => {
        if (!datasetFields[dsId]) {
          fetchDatasetFields(dsId);
        }
      });
      // 预加载已配置字段的字段值
      initialFilters.forEach(f => {
        if (f.dataset && f.field) {
          fetchFieldValues(f.dataset, f.field);
        }
      });
    } else if (visible && (!initialFilters || initialFilters.length === 0)) {
      setFields([]);
      setSelectedFieldId(null);
    }
  }, [visible]);
  
  // 获取数据集字段
  const fetchDatasetFields = async (datasetId: string) => {
    if (!datasetId) return;
    
    try {
      setLoading(true);
      const response = await axios.get(`/api/datasets/${datasetId}/fields`);
      // 确保返回的数据格式正确，只包含id和name字段
      const fields = response.data.items || [];
      const formattedFields = fields.map((field: any) => ({
        id: field.id || field.name || `field-${Math.random()}`,
        name: field.name || field.id || `字段${Math.random()}`
      })).filter((field: any) => field.id && field.name);
      setDatasetFields(prev => ({
        ...prev,
        [datasetId]: formattedFields
      }));
    } catch (error) {
      console.error('获取数据集字段失败:', error);
      message.error('获取数据集字段失败');
      setDatasetFields(prev => ({
        ...prev,
        [datasetId]: []
      }));
    } finally {
      setLoading(false);
    }
  };

  // 获取字段真实值
  const fetchFieldValues = async (datasetId: string, fieldName: string) => {
    if (!datasetId || !fieldName) return;
    const cacheKey = `${datasetId}:${fieldName}`;
    if (fieldValues[cacheKey]) return;

    try {
      setLoadingValues(true);
      const response = await axios.get(`/api/datasets/${datasetId}/field-values`, {
        params: { field: fieldName }
      });
      setFieldValues(prev => ({
        ...prev,
        [cacheKey]: response.data.values || []
      }));
    } catch (error) {
      console.error('获取字段值失败:', error);
      message.error('获取字段值失败');
      setFieldValues(prev => ({ ...prev, [cacheKey]: [] }));
    } finally {
      setLoadingValues(false);
    }
  };
  
  // 添加筛选字段
  const handleAddField = () => {
    if (fields.length >= 10) {
      message.warning('最多只能添加10个筛选字段');
      return;
    }
    
    const newField: FilterField = {
      id: `field-${Date.now()}`,
      name: `字段${fields.length + 1}`,
      dataset: '',
      field: '',
      type: 'multiple',
      defaultValue: [],
      charts: [],
    };
    
    const newFields = [...fields, newField];
    setFields(newFields);
    setSelectedFieldId(newField.id);
  };
  
  // 选择字段
  const handleSelectField = (fieldId: string) => {
    setSelectedFieldId(fieldId);
    // 获取选中的字段
    const field = fields.find(f => f.id === fieldId);
    // 如果字段有数据集配置，且还没有获取过该数据集的字段，则获取
    if (field && field.dataset && !datasetFields[field.dataset]) {
      fetchDatasetFields(field.dataset);
    }
    // 如果字段已配置数据集和字段名，加载字段值
    if (field && field.dataset && field.field) {
      fetchFieldValues(field.dataset, field.field);
    }
  };
  
  // 删除字段
  const handleDeleteField = (fieldId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // 防止触发选择字段的点击事件
    const newFields = fields.filter(field => field.id !== fieldId);
    setFields(newFields);
    if (selectedFieldId === fieldId) {
      setSelectedFieldId(newFields.length > 0 ? newFields[0].id : null);
    }
  };
  
  // 更新字段配置
  const updateField = (fieldId: string, updates: Partial<FilterField>) => {
    setFields(prev => prev.map(field => 
      field.id === fieldId ? { ...field, ...updates } : field
    ));
  };
  
  // 处理保存
  const handleSave = () => {
    // 校验配置
    const invalidFields = fields.filter(field => 
      !field.dataset || !field.field || field.charts.length === 0
    );
    
    if (invalidFields.length > 0) {
      message.error('请完成所有字段的配置');
      return;
    }
    
    onOk(fields);
  };
  
  // 处理取消
  const handleCancel = () => {
    onCancel();
  };
  
  // 获取当前选中的字段
  const selectedField = fields.find(field => field.id === selectedFieldId);
  
  return (
    <Modal
      title="筛选器配置"
      open={visible}
      onCancel={handleCancel}
      footer={null}
      width={800}
      style={{ top: 20 }}
    >
      <Layout style={{ height: 500 }}>
        {/* 左侧字段列表 */}
        <Sider width={200} style={{ background: '#f0f2f5', borderRight: '1px solid #e8e8e8' }}>
          <div style={{ padding: 16 }}>
            <Button 
              type="dashed" 
              icon={<PlusOutlined />} 
              onClick={handleAddField}
              style={{ width: '100%', marginBottom: 16 }}
              disabled={fields.length >= 10}
            >
              +添加筛选字段
            </Button>
            
            <div>
              {fields.map(field => (
                <div
                  key={field.id}
                  onClick={() => handleSelectField(field.id)}
                  style={{
                    padding: '8px 12px',
                    marginBottom: 8,
                    borderRadius: 4,
                    cursor: 'pointer',
                    backgroundColor: selectedFieldId === field.id ? '#e6f7ff' : '#fff',
                    border: selectedFieldId === field.id ? '1px solid #91d5ff' : '1px solid #e8e8e8',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  {field.name}
                  <Button
                    type="text"
                    icon={<DeleteOutlined />}
                    size="small"
                    onClick={(e) => handleDeleteField(field.id, e)}
                    style={{ color: '#ff4d4f' }}
                  />
                </div>
              ))}
            </div>
          </div>
        </Sider>
        
        {/* 右侧配置区域 */}
        <Content style={{ padding: 24, overflow: 'auto' }}>
          {selectedField ? (
            <Form layout="vertical">
              <Form.Item label="数据集">
                <Select
                  style={{ width: 200 }}
                  value={selectedField.dataset}
                  onChange={(value) => {
                    // 找出当前看板中使用了该数据集的图表
                    const matchingChartIds = charts
                      .filter(c => c.datasetId === value && dashboardChartIds.includes(c.id))
                      .map(c => c.id);
                    updateField(selectedField.id, { dataset: value, field: '', defaultValue: [], charts: matchingChartIds });
                    fetchDatasetFields(value);
                  }}
                >
                  {datasets.map(dataset => (
                    <Option key={dataset.id} value={dataset.id}>{dataset.name}</Option>
                  ))}
                </Select>
              </Form.Item>
              
              <Form.Item label="数据集字段">
                <Select
                  style={{ width: 200 }}
                  value={selectedField.field}
                  onChange={(value) => {
                    updateField(selectedField.id, { field: value, defaultValue: [] });
                    if (selectedField.dataset) {
                      fetchFieldValues(selectedField.dataset, value);
                    }
                  }}
                  disabled={!selectedField.dataset}
                  loading={loading}
                >
                  {selectedField.dataset && datasetFields[selectedField.dataset]?.map(field => (
                    <Option key={field.id} value={field.id}>{field.name}</Option>
                  ))}
                </Select>
              </Form.Item>
              
              <Form.Item label="筛选器类型">
                <Radio.Group
                  value={selectedField.type}
                  onChange={(e) => updateField(selectedField.id, { type: e.target.value, defaultValue: e.target.value === 'dateRange' ? [] : [] })}
                >
                  <Radio value="multiple">多选</Radio>
                  <Radio value="single">单选</Radio>
                  <Radio value="dateRange">日期区间</Radio>
                </Radio.Group>
              </Form.Item>
              
              <Form.Item label="筛选默认值">
                {selectedField.type === 'dateRange' ? (
                  <RangePicker
                    style={{ width: 200 }}
                    onChange={(dates) => updateField(selectedField.id, { defaultValue: dates })}
                  />
                ) : (
                  <Select
                    style={{ width: 200 }}
                    mode={selectedField.type === 'multiple' ? 'multiple' : undefined}
                    value={selectedField.defaultValue}
                    onChange={(value) => updateField(selectedField.id, { defaultValue: value })}
                    disabled={!selectedField.dataset || !selectedField.field}
                    loading={loadingValues}
                  >
                    {(fieldValues[`${selectedField.dataset}:${selectedField.field}`] || []).map((val: any) => (
                      <Option key={String(val)} value={String(val)}>{String(val)}</Option>
                    ))}
                  </Select>
                )}
              </Form.Item>
              
              <Form.Item label="生效图表">
                <Select
                  style={{ width: 200 }}
                  mode="multiple"
                  value={selectedField.charts}
                  onChange={(value) => updateField(selectedField.id, { charts: value })}
                  disabled={!selectedField.dataset}
                >
                  {charts
                    .filter(c => dashboardChartIds.includes(c.id) && c.datasetId === selectedField.dataset)
                    .map(chart => (
                      <Option key={chart.id} value={chart.id}>{chart.name}</Option>
                    ))}
                </Select>
              </Form.Item>
            </Form>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#666' }}>
              请选择或添加筛选字段
            </div>
          )}
        </Content>
      </Layout>
      
      {/* 底部操作按钮 */}
      <div style={{ padding: '16px 24px', borderTop: '1px solid #e8e8e8', textAlign: 'right' }}>
        <Button style={{ marginRight: 8 }} onClick={handleCancel}>
          取消
        </Button>
        <Button type="primary" onClick={handleSave}>
          确定
        </Button>
      </div>
    </Modal>
  );
};

export default FilterConfigModal;