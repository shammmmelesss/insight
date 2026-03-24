import React, { useState, useEffect, useCallback } from 'react';
import { Button, Input, Select, Space, Card, Divider, message, Modal, Tooltip } from 'antd';
import { ArrowLeftOutlined, SettingOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import ChartRenderer from '../../components/ChartRenderer';

// 定义图表类型
type ChartType = 'crossTable' | 'bar' | 'line' | 'pie' | 'indicator';

const { Option } = Select;

const ChartConfigPage: React.FC = () => {
  const [chartName, setChartName] = useState('');
  const [selectedDataset, setSelectedDataset] = useState('');
  const [chartType, setChartType] = useState<ChartType>('crossTable');
  
  // URL参数
  const [searchParams] = useSearchParams();
  const chartId = searchParams.get('chartId');
  const [datasets, setDatasets] = useState<{ id: string; name: string }[]>([]);
  const [datasetFields, setDatasetFields] = useState<{ originalName: string; displayName: string; type: string }[]>([]);
  const [chartData, setChartData] = useState<any[]>([]);
  const [datasetSQL, setDatasetSQL] = useState('');
  const [dataSourceId, setDataSourceId] = useState('');
  
  // 拖拽相关状态
  const [droppableArea, setDroppableArea] = useState<string | null>(null);
  const [draggedField, setDraggedField] = useState<{ originalName: string; displayName: string; type: string } | null>(null);
  
  // 字段设置对话框状态
  const [isFieldSettingsModalVisible, setIsFieldSettingsModalVisible] = useState(false);
  const [currentField, setCurrentField] = useState<{ 
    originalName: string; 
    displayName: string; 
    type: string;
    area?: string;
    config?: { aggregation?: string; dataFormat?: string; sort?: string } 
  } | null>(null);
  // 临时保存字段设置对话框中的配置
  const [tempFieldConfig, setTempFieldConfig] = useState<{
    aggregation?: string;
    dataFormat?: string;
    sort?: string;
  }>({
    aggregation: '计数',
    dataFormat: '原始值',
    sort: '升序'
  });
  
  // SQL弹窗状态
  const [isSQLModalVisible, setIsSQLModalVisible] = useState(false);
  const [sqlContent, setSqlContent] = useState('');
  
  // 关闭SQL弹窗
  const closeSQLModal = () => {
    setIsSQLModalVisible(false);
  };
  
  // 字段配置状态
  interface FieldConfig {
    originalName: string;
    displayName: string;
    type: string;
    config?: {
      aggregation?: string;
      dataFormat?: string;
      sort?: string;
    };
  }
  
  const [rowFields, setRowFields] = useState<FieldConfig[]>([]);
  const [colFields, setColFields] = useState<FieldConfig[]>([]);
  const [measureFields, setMeasureFields] = useState<FieldConfig[]>([]);
  const [xAxisFields, setXAxisFields] = useState<FieldConfig[]>([]);
  const [yAxisFields, setYAxisFields] = useState<FieldConfig[]>([]);
  const [groupFields, setGroupFields] = useState<FieldConfig[]>([]);
  const [indicatorFields, setIndicatorFields] = useState<FieldConfig[]>([]);
  const [filterFields, setFilterFields] = useState<FieldConfig[]>([]);
  
  const navigate = useNavigate();
  
  // 将聚合方式映射为SQL聚合函数
  const mapAggregationToSQL = (aggregation: string): string => {
    switch (aggregation) {
      case '求和':
        return 'SUM';
      case '平均值':
        return 'AVG';
      case '最大值':
        return 'MAX';
      case '最小值':
        return 'MIN';
      case '计数':
        return 'COUNT';
      case '去重计数':
        return 'COUNT(DISTINCT';
      default:
        return 'COUNT';
    }
  };
  
  // 生成SQL
  const generateSQL = useCallback(() => {
    // 数据集SQL为空时返回默认SQL
    if (!datasetSQL) {
      return `SELECT * FROM ${selectedDataset || 'your_table'}`;
    }
    
    // 根据图表类型生成不同的SQL
    if (chartType === 'crossTable') {
      // 交叉表SQL生成
      const rowFieldNames = rowFields.map(f => f.originalName);
      const colFieldNames = colFields.map(f => f.originalName);
      
      // 生成聚合指标字段
      const aggregatedMeasureFields = measureFields.map(field => {
        const aggregation = field.config?.aggregation || '计数';
        const aggregationFunction = mapAggregationToSQL(aggregation);
        
        return `${aggregationFunction}(${field.originalName}) AS ${field.originalName}_${aggregation}`;
      });
      
      // 组合所有字段
      const allFields = [...rowFieldNames, ...colFieldNames, ...aggregatedMeasureFields];
      
      if (allFields.length === 0) {
        return datasetSQL;
      }
      
      // 生成GROUP BY子句
      const groupByFields = [...rowFieldNames, ...colFieldNames];
      
      // 生成ORDER BY子句
      const orderByFields = [...rowFieldNames];
      
      // 构建完整SQL
      let sql = `SELECT ${allFields.join(', ')} FROM (${datasetSQL}) AS dataset WHERE 1=1`;
      
      if (groupByFields.length > 0) {
        sql += ` GROUP BY ${groupByFields.join(', ')}`;
      }
      
      if (orderByFields.length > 0) {
        sql += ` ORDER BY ${orderByFields.join(', ')}`;
      }
      
      return sql;
    } else if (chartType === 'bar' || chartType === 'line') {
      // 柱状图/折线图SQL生成
      const xAxisFieldNames = xAxisFields.map(f => f.originalName);
      const groupFieldNames = groupFields.map(f => f.originalName);
      
      // 生成聚合Y轴字段
      const aggregatedYAxisFields = yAxisFields.map(field => {
        const aggregation = field.config?.aggregation || '计数';
        const aggregationFunction = mapAggregationToSQL(aggregation);
        
        return `${aggregationFunction}(${field.originalName}) AS ${field.originalName}_${aggregation}`;
      });
      
      // 组合所有字段
      const allFields = [...xAxisFieldNames, ...aggregatedYAxisFields, ...groupFieldNames];
      
      if (allFields.length === 0) {
        return datasetSQL;
      }
      
      // 生成GROUP BY子句
      const groupByFields = [...xAxisFieldNames, ...groupFieldNames];
      
      // 生成ORDER BY子句
      const orderByFields = [...xAxisFieldNames];
      
      // 构建完整SQL
      let sql = `SELECT ${allFields.join(', ')} FROM (${datasetSQL}) AS dataset WHERE 1=1`;
      
      if (groupByFields.length > 0) {
        sql += ` GROUP BY ${groupByFields.join(', ')}`;
      }
      
      if (orderByFields.length > 0) {
        sql += ` ORDER BY ${orderByFields.join(', ')}`;
      }
      
      return sql;
    } else if (chartType === 'pie') {
      // 饼图SQL生成
      const groupFieldNames = groupFields.map(f => f.originalName);
      
      // 生成聚合指标字段
      const aggregatedMeasureFields = measureFields.map(field => {
        const aggregation = field.config?.aggregation || '计数';
        const aggregationFunction = mapAggregationToSQL(aggregation);
        
        return `${aggregationFunction}(${field.originalName}) AS ${field.originalName}_${aggregation}`;
      });
      
      // 组合所有字段
      const allFields = [...groupFieldNames, ...aggregatedMeasureFields];
      
      if (allFields.length === 0) {
        return datasetSQL;
      }
      
      // 生成GROUP BY子句
      const groupByFields = [...groupFieldNames];
      
      // 构建完整SQL
      let sql = `SELECT ${allFields.join(', ')} FROM (${datasetSQL}) AS dataset WHERE 1=1`;
      
      if (groupByFields.length > 0) {
        sql += ` GROUP BY ${groupByFields.join(', ')}`;
      }
      
      return sql;
    } else if (chartType === 'indicator') {
      // 指标卡SQL生成
      // 生成聚合指标字段
      const aggregatedIndicatorFields = indicatorFields.map(field => {
        const aggregation = field.config?.aggregation || '计数';
        const aggregationFunction = mapAggregationToSQL(aggregation);
        
        return `${aggregationFunction}(${field.originalName}) AS ${field.originalName}_${aggregation}`;
      });
      
      if (aggregatedIndicatorFields.length === 0) {
        return datasetSQL;
      }
      
      // 构建完整SQL
      return `SELECT ${aggregatedIndicatorFields.join(', ')} FROM (${datasetSQL}) AS dataset WHERE 1=1`;
    }
    
    return datasetSQL;
  }, [datasetSQL, selectedDataset, chartType, rowFields, colFields, measureFields, xAxisFields, yAxisFields, groupFields, indicatorFields]);
  
  // 打开SQL弹窗
  const openSQLModal = () => {
    // 生成或获取当前图表的SQL
    const generatedSQL = generateSQL();
    setSqlContent(generatedSQL);
    setIsSQLModalVisible(true);
  };
  
  // 编辑模式下获取图表详情
  useEffect(() => {
    const fetchChartDetail = async () => {
      if (!chartId) return;
      
      try {
        const response = await axios.get(`/api/charts/${chartId}`);
        const chart = response.data;
        
        // 填充基本信息
        setChartName(chart.name);
        setSelectedDataset(chart.datasetId);
        setChartType(chart.type);
        
        // 解析配置信息
        const config = JSON.parse(chart.config);
        setRowFields(config.rowFields || []);
        setColFields(config.colFields || []);
        setMeasureFields(config.measureFields || []);
        setXAxisFields(config.xAxisFields || []);
        setYAxisFields(config.yAxisFields || []);
        setGroupFields(config.groupFields || []);
        setIndicatorFields(config.indicatorFields || []);
        setFilterFields(config.filterFields || []);
        
        message.success('图表信息加载成功');
      } catch (error) {
        console.error('获取图表详情失败:', error);
        message.error('获取图表详情失败');
      }
    };
    
    fetchChartDetail();
  }, [chartId]);

  // 保存图表配置
  const handleSaveChart = async () => {
    try {
      // 验证表单
      if (!chartName) {
        message.error('请输入图表名称');
        return;
      }
      
      if (!selectedDataset) {
        message.error('请选择数据集');
        return;
      }
      
      // 准备图表配置数据
      const chartConfig = {
        rowFields,
        colFields,
        measureFields,
        xAxisFields,
        yAxisFields,
        groupFields,
        indicatorFields,
        filterFields,
      };
      
      // 发送保存请求
      if (chartId) {
        // 编辑模式：使用PUT请求更新图表
        await axios.put(`/api/charts/${chartId}`, {
          name: chartName,
          datasetId: selectedDataset,
          type: chartType,
          config: JSON.stringify(chartConfig),
        });
        message.success('图表更新成功');
      } else {
        // 新建模式：使用POST请求创建图表
        await axios.post('/api/charts', {
          name: chartName,
          datasetId: selectedDataset,
          type: chartType,
          config: JSON.stringify(chartConfig),
        });
        message.success('图表保存成功');
      }
      
      // 保存成功后跳转到图表列表页面
      navigate('/charts');
    } catch (error) {
      console.error('保存图表失败:', error);
      message.error('保存图表失败，请重试');
    }
  };

  // 获取数据集列表
  useEffect(() => {
    const fetchDatasets = async () => {
      try {
        const response = await axios.get('/api/datasets/select-list');
        console.log('获取数据集列表成功:', response.data);
        setDatasets(response.data.items);
      } catch (error) {
        message.error('获取数据集列表失败');
        console.error('获取数据集列表失败:', error);
      }
    };

    fetchDatasets();
  }, []);

  // 获取数据集字段
  useEffect(() => {
    if (!selectedDataset) {
      setDatasetFields([]);
      setDatasetSQL('');
      setDataSourceId('');
      return;
    }

    const fetchDatasetFields = async () => {
      try {
        const response = await axios.get(`/api/datasets/${selectedDataset}`);
        setDatasetFields(response.data.fieldsConfig || []);
        setDatasetSQL(response.data.sql || '');
        setDataSourceId(response.data.dataSourceId || '');
      } catch (error) {
        message.error('获取数据集字段失败');
        console.error('获取数据集字段失败:', error);
        setDatasetFields([]);
        setDatasetSQL('');
        setDataSourceId('');
      }
    };

    fetchDatasetFields();
  }, [selectedDataset]);

  // 获取实际数据
  useEffect(() => {
    if (!selectedDataset || !datasetSQL || !dataSourceId) {
      setChartData([]);
      return;
    }

    // 调用后端API获取实际数据
    const fetchChartData = async () => {
      try {
        // 使用生成的聚合SQL获取数据
        const generatedSQL = generateSQL();
        const response = await axios.post('/api/datasets/preview', {
          sql: generatedSQL,
          dataSourceId: dataSourceId
        });
        setChartData(response.data.data || []);
      } catch (error) {
        message.error('获取图表数据失败');
        console.error('获取图表数据失败:', error);
        setChartData([]);
      }
    };
    
    fetchChartData();
  }, [selectedDataset, datasetSQL, dataSourceId, generateSQL]);

  // 拖拽开始事件
  const handleDragStart = (e: React.DragEvent, field: { originalName: string; displayName: string; type: string }) => {
    setDraggedField(field);
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', JSON.stringify(field));
  };

  // 拖拽结束事件
  const handleDragEnd = () => {
    setDraggedField(null);
    setDroppableArea(null);
  };

  // 拖拽进入事件
  const handleDragEnter = (e: React.DragEvent, area: string) => {
    e.preventDefault();
    setDroppableArea(area);
  };

  // 拖拽离开事件
  const handleDragLeave = () => {
    setDroppableArea(null);
  };

  // 拖拽悬停事件
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  // 拖拽放置事件
  const handleDrop = (e: React.DragEvent, area: string) => {
    e.preventDefault();
    setDroppableArea(null);
    
    if (!draggedField) return;
    
    // 创建包含默认配置的FieldConfig对象
    const fieldConfig: FieldConfig = {
      ...draggedField,
      config: {
        aggregation: '计数', // 默认聚合方式
        dataFormat: '原始值', // 默认数据格式
        sort: '升序' // 默认排序
      }
    };
    
    // 根据放置区域添加字段
    switch (area) {
      case 'row':
        setRowFields(prev => [...prev, fieldConfig]);
        break;
      case 'col':
        setColFields(prev => [...prev, fieldConfig]);
        break;
      case 'measure':
        setMeasureFields(prev => [...prev, fieldConfig]);
        break;
      case 'xAxis':
        setXAxisFields(prev => [...prev, fieldConfig]);
        break;
      case 'yAxis':
        setYAxisFields(prev => [...prev, fieldConfig]);
        break;
      case 'group':
        setGroupFields(prev => [...prev, fieldConfig]);
        break;
      case 'indicator':
        setIndicatorFields(prev => [...prev, fieldConfig]);
        break;
      case 'filter':
        setFilterFields(prev => [...prev, fieldConfig]);
        break;
      default:
        break;
    }
  };

  // 打开字段设置对话框
  const openFieldSettingsModal = (field: FieldConfig, area?: string) => {
    const config = field.config || {
      aggregation: '计数',
      dataFormat: '原始值',
      sort: '升序'
    };
    
    setCurrentField({
      ...field,
      area,
      config
    });
    
    // 初始化临时字段配置
    setTempFieldConfig(config);
    
    setIsFieldSettingsModalVisible(true);
  };
  
  // 关闭字段设置对话框
  const closeFieldSettingsModal = () => {
    setIsFieldSettingsModalVisible(false);
    setCurrentField(null);
  };
  
  // 保存字段设置
  const saveFieldSettings = () => {
    if (!currentField) return;
    
    // 根据字段所在区域更新字段配置
    const updateFieldConfig = (fields: FieldConfig[]) => {
      return fields.map(f => 
        f.originalName === currentField?.originalName ? {
          ...f,
          config: tempFieldConfig
        } : f
      );
    };
    
    // 更新对应的字段数组
    switch (currentField.area) {
      case 'row':
        setRowFields(updateFieldConfig(rowFields));
        break;
      case 'col':
        setColFields(updateFieldConfig(colFields));
        break;
      case 'measure':
        setMeasureFields(updateFieldConfig(measureFields));
        break;
      case 'xAxis':
        setXAxisFields(updateFieldConfig(xAxisFields));
        break;
      case 'yAxis':
        setYAxisFields(updateFieldConfig(yAxisFields));
        break;
      case 'group':
        setGroupFields(updateFieldConfig(groupFields));
        break;
      case 'indicator':
        setIndicatorFields(updateFieldConfig(indicatorFields));
        break;
      case 'filter':
        setFilterFields(updateFieldConfig(filterFields));
        break;
      default:
        // 如果没有明确的区域，根据图表类型和字段名猜测可能的区域
        // 对于指标字段，可能需要更新多个数组
        if (currentField.type !== 'dimension') {
          // 更新所有可能包含该指标字段的数组
          setMeasureFields(updateFieldConfig(measureFields));
          setYAxisFields(updateFieldConfig(yAxisFields));
          setIndicatorFields(updateFieldConfig(indicatorFields));
        }
        break;
    }
    
    closeFieldSettingsModal();
  };

  // 图表类型配置
  const chartTypes: { label: string; value: ChartType; icon: string }[] = [
    { label: '交叉表', value: 'crossTable', icon: '📋' },
    { label: '柱状图', value: 'bar', icon: '📊' },
    { label: '折线图', value: 'line', icon: '📈' },
    { label: '饼图', value: 'pie', icon: '🥧' },
    { label: '指标卡', value: 'indicator', icon: '📌' },
  ];

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', backgroundColor: '#f0f2f5' }}>
      {/* 顶部导航 */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '10px', backgroundColor: '#fff', borderBottom: '1px solid #e8e8e8' }}>
        <Button type="text" icon={<ArrowLeftOutlined />} style={{ marginRight: 16 }} onClick={() => navigate('/charts')}>
          返回
        </Button>
        <Input
          placeholder="请输入图表名称"
          value={chartName}
          onChange={(e) => setChartName(e.target.value)}
          style={{ width: 300, marginRight: 'auto' }}
        />
        <Button type="primary" onClick={handleSaveChart}>
          保存
        </Button>
      </div>

      {/* 三栏布局 */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* 左栏：数据集 */}
        <div style={{ width: '250px', backgroundColor: '#fff', borderRight: '1px solid #e8e8e8', overflow: 'auto', padding: 16 }}>
          <h3 style={{ marginBottom: 16 }}>数据集</h3>
          <Select
            placeholder="请选择数据集"
            style={{ width: '100%', marginBottom: 16 }}
            value={selectedDataset}
            onChange={(value) => setSelectedDataset(value)}
          >
            {datasets.map(dataset => (
              <Option key={dataset.id} value={dataset.id}>
                {dataset.name}
              </Option>
            ))}
          </Select>



          <Divider orientation="left" style={{ margin: '16px 0' }}>
            数据集字段
          </Divider>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {datasetFields.length > 0 ? (
              datasetFields.map((field, index) => (
                <Card 
                  key={index} 
                  size="small" 
                  style={{ cursor: 'move' }}
                  draggable
                  onDragStart={(e) => handleDragStart(e, field)}
                  onDragEnd={handleDragEnd}
                >
                  <div>
                    <div>{field.displayName}</div>
                    <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                      {field.originalName} ({field.type === 'dimension' ? '维度' : '指标'})
                    </div>
                  </div>
                </Card>
              ))
            ) : (
              <div style={{ textAlign: 'center', color: '#999', padding: '16px 0' }}>
                请先选择数据集
              </div>
            )}
          </div>
        </div>

        {/* 中栏：图表配置 */}
        <div style={{ width: '300px', backgroundColor: '#fff', borderRight: '1px solid #e8e8e8', overflow: 'auto', padding: 16 }}>
          <h3 style={{ marginBottom: 16 }}>图表配置</h3>

          {/* 图表类型选择 */}
          <Space wrap style={{ marginBottom: 24 }}>
            {chartTypes.map(type => (
              <Tooltip key={type.value} title={type.label} placement="top">
                <Button
                  type={chartType === type.value ? 'primary' : 'default'}
                  onClick={() => setChartType(type.value)}
                  style={{ minWidth: 'auto', padding: '4px 8px' }}
                  icon={<span>{type.icon}</span>}
                />
              </Tooltip>
            ))}
          </Space>

          {/* 字段配置区 */}
          <div style={{ maxHeight: 'calc(100vh - 200px)', overflow: 'auto' }}>
            <h4 style={{ marginBottom: 16 }}>字段配置</h4>
            
            {/* 交叉表配置 */}
            {chartType === 'crossTable' && (
              <>
                {/* 行配置 */}
                <div style={{ marginBottom: 16, border: '1px solid #f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                    <span>行</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button size="small" type="text" icon={<SettingOutlined />}></Button>
                    </div>
                  </div>
                  <div 
                    style={{ 
                      minHeight: 25, 
                      padding: 16, 
                      textAlign: 'center', 
                      color: '#999',
                      border: droppableArea === 'row' ? '2px dashed #165DFF' : 'none',
                      backgroundColor: droppableArea === 'row' ? '#f0f7ff' : 'transparent',
                      borderRadius: 4
                    }}
                    onDragEnter={(e) => handleDragEnter(e, 'row')}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, 'row')}
                  >
                    {rowFields.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                        {rowFields.map((field, index) => (
                          <div key={index} style={{ 
                            width: '200px',
                            padding: '4px 8px', 
                            backgroundColor: '#e6f7ff', 
                            borderRadius: 4,
                            color: '#165DFF',
                            fontSize: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}>
                            {field.displayName}
                            <Button 
                              size="small" 
                              type="text" 
                              icon={<SettingOutlined />}
                              style={{ color: '#165DFF', padding: 0, margin: 0, minWidth: 'auto' }}
                              onClick={() => openFieldSettingsModal(field, 'row')}
                            />
                            <Button 
                              size="small" 
                              type="text" 
                              icon={<DeleteOutlined />}
                              style={{ color: '#ff4d4f', padding: 0, margin: 0, minWidth: 'auto' }}
                              onClick={() => {
                                const newFields = [...rowFields];
                                newFields.splice(index, 1);
                                setRowFields(newFields);
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div>拖拽字段到此处<br />或点击 + 按钮添加</div>
                    )}
                  </div>
                </div>

                {/* 列配置 */}
                <div style={{ marginBottom: 16, border: '1px solid #f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                    <span>列</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button size="small" type="text" icon={<SettingOutlined />}></Button>
                    </div>
                  </div>
                  <div 
                    style={{ 
                      minHeight: 100, 
                      padding: 16, 
                      textAlign: 'center', 
                      color: '#999',
                      border: droppableArea === 'col' ? '2px dashed #165DFF' : 'none',
                      backgroundColor: droppableArea === 'col' ? '#f0f7ff' : 'transparent',
                      borderRadius: 4
                    }}
                    onDragEnter={(e) => handleDragEnter(e, 'col')}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, 'col')}
                  >
                    {colFields.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                        {colFields.map((field, index) => (
                          <div key={index} style={{ 
                            width: '200px',
                            padding: '4px 8px', 
                            backgroundColor: '#e6f7ff', 
                            borderRadius: 4,
                            color: '#165DFF',
                            fontSize: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}>
                            {field.displayName}
                            <Button 
                              size="small" 
                              type="text" 
                              icon={<SettingOutlined />}
                              style={{ color: '#165DFF', padding: 0, margin: 0, minWidth: 'auto' }}
                              onClick={() => openFieldSettingsModal(field, 'col')}
                            />
                            <Button 
                              size="small" 
                              type="text" 
                              icon={<DeleteOutlined />}
                              style={{ color: '#ff4d4f', padding: 0, margin: 0, minWidth: 'auto' }}
                              onClick={() => {
                                const newFields = [...colFields];
                                newFields.splice(index, 1);
                                setColFields(newFields);
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div>拖拽字段到此处<br />或点击 + 按钮添加</div>
                    )}
                  </div>
                </div>

                {/* 指标配置 */}
                <div style={{ marginBottom: 16, border: '1px solid #f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                    <span>指标</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button size="small" type="text" icon={<SettingOutlined />}></Button>
                    </div>
                  </div>
                  <div 
                    style={{ 
                      minHeight: 100, 
                      padding: 16, 
                      textAlign: 'center', 
                      color: '#999',
                      border: droppableArea === 'measure' ? '2px dashed #165DFF' : 'none',
                      backgroundColor: droppableArea === 'measure' ? '#f0f7ff' : 'transparent',
                      borderRadius: 4
                    }}
                    onDragEnter={(e) => handleDragEnter(e, 'measure')}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, 'measure')}
                  >
                    {measureFields.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                        {measureFields.map((field, index) => (
                          <div key={index} style={{ 
                            width: '200px',
                            padding: '4px 8px', 
                            backgroundColor: '#e6f7ff', 
                            borderRadius: 4,
                            color: '#165DFF',
                            fontSize: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}>
                            {field.displayName}
                            <Button 
                              size="small" 
                              type="text" 
                              icon={<SettingOutlined />}
                              style={{ color: '#165DFF', padding: 0, margin: 0, minWidth: 'auto' }}
                              onClick={() => openFieldSettingsModal(field, 'measure')}
                            />
                            <Button 
                              size="small" 
                              type="text" 
                              icon={<DeleteOutlined />}
                              style={{ color: '#ff4d4f', padding: 0, margin: 0, minWidth: 'auto' }}
                              onClick={() => {
                                const newFields = [...measureFields];
                                newFields.splice(index, 1);
                                setMeasureFields(newFields);
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div>拖拽字段到此处<br />或点击 + 按钮添加</div>
                    )}
                  </div>
                </div>

                {/* 筛选配置 */}
                <div style={{ marginBottom: 16, border: '1px solid #f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                    <span>筛选</span>
                  </div>
                  <div 
                    style={{ 
                      minHeight: 30, 
                      padding: 16, 
                      textAlign: 'center', 
                      color: '#999',
                      border: droppableArea === 'filter' ? '2px dashed #165DFF' : 'none',
                      backgroundColor: droppableArea === 'filter' ? '#f0f7ff' : 'transparent',
                      borderRadius: 4
                    }}
                    onDragEnter={(e) => handleDragEnter(e, 'filter')}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, 'filter')}
                  >
                    {filterFields.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                        {filterFields.map((field, index) => (
                          <div key={index} style={{ 
                            padding: '4px 8px', 
                            backgroundColor: '#e6f7ff', 
                            borderRadius: 4,
                            color: '#165DFF',
                            fontSize: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}>
                            {field.displayName}
                            <Button 
                              size="small" 
                              type="text" 
                              icon={<DeleteOutlined />}
                              style={{ color: '#ff4d4f', padding: 0, margin: 0, minWidth: 'auto' }}
                              onClick={() => {
                                const newFields = [...filterFields];
                                newFields.splice(index, 1);
                                setFilterFields(newFields);
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div>拖拽字段到此处<br />或点击 + 添加筛选条件</div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* 柱状图、折线图配置 */}
            {(chartType === 'bar' || chartType === 'line') && (
              <>
                {/* X轴配置 */}
                <div style={{ marginBottom: 16, border: '1px solid #f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                    <span>X轴（维度）</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button size="small" type="text" icon={<SettingOutlined />}></Button>
                    </div>
                  </div>
                  <div 
                    style={{ 
                      minHeight: 100, 
                      padding: 16, 
                      textAlign: 'center', 
                      color: '#999',
                      border: droppableArea === 'xAxis' ? '2px dashed #165DFF' : 'none',
                      backgroundColor: droppableArea === 'xAxis' ? '#f0f7ff' : 'transparent',
                      borderRadius: 4
                    }}
                    onDragEnter={(e) => handleDragEnter(e, 'xAxis')}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, 'xAxis')}
                  >
                    {xAxisFields.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                        {xAxisFields.map((field, index) => (
                          <div key={index} style={{ 
                            width: '200px',
                            padding: '4px 8px', 
                            backgroundColor: '#e6f7ff', 
                            borderRadius: 4,
                            color: '#165DFF',
                            fontSize: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}>
                            {field.displayName}
                            <Button 
                              size="small" 
                              type="text" 
                              icon={<SettingOutlined />}
                              style={{ color: '#165DFF', padding: 0, margin: 0, minWidth: 'auto' }}
                              onClick={() => openFieldSettingsModal(field, 'xAxis')}
                            />
                            <Button 
                              size="small" 
                              type="text" 
                              icon={<DeleteOutlined />}
                              style={{ color: '#ff4d4f', padding: 0, margin: 0, minWidth: 'auto' }}
                              onClick={() => {
                                const newFields = [...xAxisFields];
                                newFields.splice(index, 1);
                                setXAxisFields(newFields);
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div>拖拽字段到此处<br />或点击 + 按钮添加</div>
                    )}
                  </div>
                </div>

                {/* Y轴配置 */}
                <div style={{ marginBottom: 16, border: '1px solid #f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                    <span>Y轴（指标）</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button size="small" type="text" icon={<SettingOutlined />}></Button>
                    </div>
                  </div>
                  <div 
                    style={{ 
                      minHeight: 100, 
                      padding: 16, 
                      textAlign: 'center', 
                      color: '#999',
                      border: droppableArea === 'yAxis' ? '2px dashed #165DFF' : 'none',
                      backgroundColor: droppableArea === 'yAxis' ? '#f0f7ff' : 'transparent',
                      borderRadius: 4
                    }}
                    onDragEnter={(e) => handleDragEnter(e, 'yAxis')}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, 'yAxis')}
                  >
                    {yAxisFields.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                        {yAxisFields.map((field, index) => (
                          <div key={index} style={{ 
                            width: '200px',
                            padding: '4px 8px', 
                            backgroundColor: '#e6f7ff', 
                            borderRadius: 4,
                            color: '#165DFF',
                            fontSize: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}>
                            {field.displayName}
                            <Button 
                              size="small" 
                              type="text" 
                              icon={<SettingOutlined />}
                              style={{ color: '#165DFF', padding: 0, margin: 0, minWidth: 'auto' }}
                              onClick={() => openFieldSettingsModal(field, 'yAxis')}
                            />
                            <Button 
                              size="small" 
                              type="text" 
                              icon={<DeleteOutlined />}
                              style={{ color: '#ff4d4f', padding: 0, margin: 0, minWidth: 'auto' }}
                              onClick={() => {
                                const newFields = [...yAxisFields];
                                newFields.splice(index, 1);
                                setYAxisFields(newFields);
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div>拖拽字段到此处<br />或点击 + 按钮添加</div>
                    )}
                  </div>
                </div>

                {/* 分组配置 */}
                <div style={{ marginBottom: 16, border: '1px solid #f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                    <span>分组</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button size="small" type="text" icon={<SettingOutlined />}></Button>
                    </div>
                  </div>
                  <div 
                    style={{ 
                      minHeight: 100, 
                      padding: 16, 
                      textAlign: 'center', 
                      color: '#999',
                      border: droppableArea === 'group' ? '2px dashed #165DFF' : 'none',
                      backgroundColor: droppableArea === 'group' ? '#f0f7ff' : 'transparent',
                      borderRadius: 4
                    }}
                    onDragEnter={(e) => handleDragEnter(e, 'group')}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, 'group')}
                  >
                    {groupFields.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                        {groupFields.map((field, index) => (
                          <div key={index} style={{ 
                            width: '200px',
                            padding: '4px 8px', 
                            backgroundColor: '#e6f7ff', 
                            borderRadius: 4,
                            color: '#165DFF',
                            fontSize: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}>
                            {field.displayName}
                            <Button 
                              size="small" 
                              type="text" 
                              icon={<SettingOutlined />}
                              style={{ color: '#165DFF', padding: 0, margin: 0, minWidth: 'auto' }}
                              onClick={() => openFieldSettingsModal(field)}
                            />
                            <Button 
                              size="small" 
                              type="text" 
                              icon={<DeleteOutlined />}
                              style={{ color: '#ff4d4f', padding: 0, margin: 0, minWidth: 'auto' }}
                              onClick={() => {
                                const newFields = [...groupFields];
                                newFields.splice(index, 1);
                                setGroupFields(newFields);
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div>拖拽字段到此处<br />或点击 + 按钮添加</div>
                    )}
                  </div>
                </div>

                {/* 筛选配置 */}
                <div style={{ marginBottom: 16, border: '1px solid #f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                    <span>筛选</span>
                  </div>
                  <div 
                    style={{ 
                      minHeight: 60, 
                      padding: 16, 
                      textAlign: 'center', 
                      color: '#999',
                      border: droppableArea === 'filter' ? '2px dashed #165DFF' : 'none',
                      backgroundColor: droppableArea === 'filter' ? '#f0f7ff' : 'transparent',
                      borderRadius: 4
                    }}
                    onDragEnter={(e) => handleDragEnter(e, 'filter')}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, 'filter')}
                  >
                    {filterFields.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                        {filterFields.map((field, index) => (
                          <div key={index} style={{ 
                            padding: '4px 8px', 
                            backgroundColor: '#e6f7ff', 
                            borderRadius: 4,
                            color: '#165DFF',
                            fontSize: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}>
                            {field.displayName}
                            <Button 
                              size="small" 
                              type="text" 
                              icon={<DeleteOutlined />}
                              style={{ color: '#ff4d4f', padding: 0, margin: 0, minWidth: 'auto' }}
                              onClick={() => {
                                const newFields = [...filterFields];
                                newFields.splice(index, 1);
                                setFilterFields(newFields);
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div>拖拽字段到此处<br />或点击 + 添加筛选条件</div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* 饼图配置 */}
            {chartType === 'pie' && (
              <>
                {/* 分组配置 */}
                <div style={{ marginBottom: 16, border: '1px solid #f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                    <span>分组</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button size="small" type="text" icon={<SettingOutlined />}></Button>
                    </div>
                  </div>
                  <div 
                    style={{ 
                      minHeight: 100, 
                      padding: 16, 
                      textAlign: 'center', 
                      color: '#999',
                      border: droppableArea === 'group' ? '2px dashed #165DFF' : 'none',
                      backgroundColor: droppableArea === 'group' ? '#f0f7ff' : 'transparent',
                      borderRadius: 4
                    }}
                    onDragEnter={(e) => handleDragEnter(e, 'group')}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, 'group')}
                  >
                    {groupFields.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                        {groupFields.map((field, index) => (
                          <div key={index} style={{ 
                            width: '200px',
                            padding: '4px 8px', 
                            backgroundColor: '#e6f7ff', 
                            borderRadius: 4,
                            color: '#165DFF',
                            fontSize: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}>
                            {field.displayName}
                            <Button 
                              size="small" 
                              type="text" 
                              icon={<SettingOutlined />}
                              style={{ color: '#165DFF', padding: 0, margin: 0, minWidth: 'auto' }}
                              onClick={() => openFieldSettingsModal(field)}
                            />
                            <Button 
                              size="small" 
                              type="text" 
                              icon={<DeleteOutlined />}
                              style={{ color: '#ff4d4f', padding: 0, margin: 0, minWidth: 'auto' }}
                              onClick={() => {
                                const newFields = [...groupFields];
                                newFields.splice(index, 1);
                                setGroupFields(newFields);
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div>拖拽字段到此处<br />或点击 + 按钮添加</div>
                    )}
                  </div>
                </div>

                {/* 指标配置 */}
                <div style={{ marginBottom: 16, border: '1px solid #f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                    <span>指标</span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <Button size="small" type="text" icon={<SettingOutlined />}></Button>
                    </div>
                  </div>
                  <div 
                    style={{ 
                      minHeight: 100, 
                      padding: 16, 
                      textAlign: 'center', 
                      color: '#999',
                      border: droppableArea === 'measure' ? '2px dashed #165DFF' : 'none',
                      backgroundColor: droppableArea === 'measure' ? '#f0f7ff' : 'transparent',
                      borderRadius: 4
                    }}
                    onDragEnter={(e) => handleDragEnter(e, 'measure')}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, 'measure')}
                  >
                    {measureFields.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                        {measureFields.map((field, index) => (
                          <div key={index} style={{ 
                            width: '200px',
                            padding: '4px 8px', 
                            backgroundColor: '#e6f7ff', 
                            borderRadius: 4,
                            color: '#165DFF',
                            fontSize: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}>
                            {field.displayName}
                            <Button 
                              size="small" 
                              type="text" 
                              icon={<SettingOutlined />}
                              style={{ color: '#165DFF', padding: 0, margin: 0, minWidth: 'auto' }}
                              onClick={() => openFieldSettingsModal(field, 'measure')}
                            />
                            <Button 
                              size="small" 
                              type="text" 
                              icon={<DeleteOutlined />}
                              style={{ color: '#ff4d4f', padding: 0, margin: 0, minWidth: 'auto' }}
                              onClick={() => {
                                const newFields = [...measureFields];
                                newFields.splice(index, 1);
                                setMeasureFields(newFields);
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div>拖拽字段到此处<br />或点击 + 按钮添加</div>
                    )}
                  </div>
                </div>

                {/* 筛选配置 */}
                <div style={{ marginBottom: 16, border: '1px solid #f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                    <span>筛选</span>
                  </div>
                  <div 
                    style={{ 
                      minHeight: 60, 
                      padding: 16, 
                      textAlign: 'center', 
                      color: '#999',
                      border: droppableArea === 'filter' ? '2px dashed #165DFF' : 'none',
                      backgroundColor: droppableArea === 'filter' ? '#f0f7ff' : 'transparent',
                      borderRadius: 4
                    }}
                    onDragEnter={(e) => handleDragEnter(e, 'filter')}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, 'filter')}
                  >
                    {filterFields.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                        {filterFields.map((field, index) => (
                          <div key={index} style={{ 
                            padding: '4px 8px', 
                            backgroundColor: '#e6f7ff', 
                            borderRadius: 4,
                            color: '#165DFF',
                            fontSize: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4
                          }}>
                            {field.displayName}
                            <Button 
                              size="small" 
                              type="text" 
                              icon={<DeleteOutlined />}
                              style={{ color: '#ff4d4f', padding: 0, margin: 0, minWidth: 'auto' }}
                              onClick={() => {
                                const newFields = [...filterFields];
                                newFields.splice(index, 1);
                                setFilterFields(newFields);
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div>拖拽字段到此处<br />或点击 + 添加筛选条件</div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* 指标卡配置 */}
            {chartType === 'indicator' && (
              <div style={{ marginBottom: 16, border: '1px solid #f0f0f0', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', backgroundColor: '#fafafa', borderBottom: '1px solid #f0f0f0' }}>
                  <span>指标配置</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button size="small" type="text" icon={<PlusOutlined />}>+</Button>
                    <Button size="small" type="text" icon={<SettingOutlined />}></Button>
                  </div>
                </div>
                <div 
                  style={{ 
                    minHeight: 100, 
                    padding: 16, 
                    textAlign: 'center', 
                    color: '#999',
                    border: droppableArea === 'indicator' ? '2px dashed #165DFF' : 'none',
                    backgroundColor: droppableArea === 'indicator' ? '#f0f7ff' : 'transparent',
                    borderRadius: 4
                  }}
                  onDragEnter={(e) => handleDragEnter(e, 'indicator')}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, 'indicator')}
                >
                  {indicatorFields.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                      {indicatorFields.map((field, index) => (
                        <div key={index} style={{ 
                          width: '200px',
                          padding: '4px 8px', 
                          backgroundColor: '#e6f7ff', 
                          borderRadius: 4,
                          color: '#165DFF',
                          fontSize: '14px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}>
                          {field.displayName}
                            <Button 
                              size="small" 
                              type="text" 
                              icon={<SettingOutlined />}
                              style={{ color: '#165DFF', padding: 0, margin: 0, minWidth: 'auto' }}
                              onClick={() => openFieldSettingsModal(field, 'indicator')}
                            />
                            <Button 
                              size="small" 
                              type="text" 
                              icon={<DeleteOutlined />}
                              style={{ color: '#ff4d4f', padding: 0, margin: 0, minWidth: 'auto' }}
                              onClick={() => {
                                const newFields = [...indicatorFields];
                                newFields.splice(index, 1);
                                setIndicatorFields(newFields);
                              }}
                            />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div>拖拽字段到此处<br />或点击 + 按钮添加</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 右栏：预览 */}
        <div style={{ flex: 1, backgroundColor: '#fff', overflow: 'auto', padding: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3>报表预览</h3>
            <Button type="primary" onClick={openSQLModal}>
              SQL
            </Button>
          </div>
          <div style={{ height: 'calc(100% - 48px)' }}>
            <ChartRenderer
              chartType={chartType}
              chartData={chartData}
              rowFields={rowFields.map(f => f.originalName)}
              colFields={colFields.map(f => f.originalName)}
              measureFields={measureFields.map(f => `${f.originalName}_${f.config?.aggregation || '计数'}`)}
              xAxisFields={xAxisFields.map(f => f.originalName)}
              yAxisFields={yAxisFields.map(f => `${f.originalName}_${f.config?.aggregation || '计数'}`)}
              groupFields={groupFields.map(f => f.originalName)}
              indicatorFields={indicatorFields.map(f => `${f.originalName}_${f.config?.aggregation || '计数'}`)}
            />
          </div>
        </div>
      </div>

      {/* 字段设置对话框 */}
      <Modal
        title="字段设置"
        open={isFieldSettingsModalVisible}
        onCancel={closeFieldSettingsModal}
        footer={null}
        width={600}
      >
        {currentField && (
          <div>
            <div style={{ marginBottom: 24 }}>
              <div style={{ marginBottom: 12 }}>
                <span style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>字段名称</span>
                <Input value={currentField.displayName} disabled style={{ width: '100%' }} />
              </div>
              
              {/* 聚合方式 - 指标字段或被放置在指标区域的字段显示 */}
              {(currentField.type !== 'dimension' || 
                currentField.area === 'measure' || 
                currentField.area === 'yAxis' || 
                currentField.area === 'indicator') && (
                <div style={{ marginBottom: 12 }}>
                  <span style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>聚合方式</span>
                  <Select 
                    value={tempFieldConfig.aggregation} 
                    style={{ width: '100%' }}
                    onChange={(value) => setTempFieldConfig(prev => ({ ...prev, aggregation: value }))}
                  >
                    <Option value="求和">求和</Option>
                    <Option value="平均值">平均值</Option>
                    <Option value="最大值">最大值</Option>
                    <Option value="最小值">最小值</Option>
                    <Option value="计数">计数</Option>
                    <Option value="去重计数">去重计数</Option>
                  </Select>
                </div>
              )}
              
              {/* 数据格式 - 根据图表类型和字段区域条件显示 */}
              {( 
                // 交叉表 - 仅指标显示数据格式
                (chartType === 'crossTable' && currentField.area === 'measure') ||
                // 柱状图/折线图 - 仅Y轴显示数据格式
                ((chartType === 'bar' || chartType === 'line') && currentField.area === 'yAxis') ||
                // 饼图 - 仅指标显示数据格式
                (chartType === 'pie' && currentField.area === 'measure') ||
                // 指标卡 - 显示数据格式
                (chartType === 'indicator' && currentField.area === 'indicator')
              ) && (
                <div style={{ marginBottom: 12 }}>
                  <span style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>数据格式</span>
                  <Select 
                    value={tempFieldConfig.dataFormat} 
                    style={{ width: '100%' }}
                    onChange={(value) => setTempFieldConfig(prev => ({ ...prev, dataFormat: value }))}
                  >
                    <Option value="原始值">原始值</Option>
                    <Option value="百分比">百分比</Option>
                    <Option value="千分比">千分比</Option>
                    <Option value="小数">小数</Option>
                    <Option value="整数">整数</Option>
                  </Select>
                </div>
              )}
              
              {/* 排序 - 所有字段都显示 */}
              <div style={{ marginBottom: 12 }}>
                <span style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>排序</span>
                <Select 
                  value={tempFieldConfig.sort} 
                  style={{ width: '100%' }}
                  onChange={(value) => setTempFieldConfig(prev => ({ ...prev, sort: value }))}
                >
                  <Option value="升序">升序</Option>
                  <Option value="降序">降序</Option>
                </Select>
              </div>
            </div>
            
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, borderTop: '1px solid #f0f0f0', paddingTop: 16 }}>
              <Button onClick={closeFieldSettingsModal}>取消</Button>
              <Button type="primary" onClick={saveFieldSettings}>确定</Button>
            </div>
          </div>
        )}
      </Modal>
      
      {/* SQL弹窗 */}
      <Modal
        title="SQL查询"
        open={isSQLModalVisible}
        onCancel={closeSQLModal}
        footer={[
          <Button key="close" onClick={closeSQLModal}>
            关闭
          </Button>
        ]}
        width={800}
      >
        <div style={{ backgroundColor: '#f5f5f5', padding: 16, borderRadius: 4, overflow: 'auto', maxHeight: 400 }}>
          <pre style={{ margin: 0, fontSize: '14px', lineHeight: 1.5 }}>{sqlContent}</pre>
        </div>
      </Modal>
    </div>
  );
};

export default ChartConfigPage;