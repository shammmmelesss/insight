import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Typography, List, Tag, Button } from 'antd';
import { Link } from 'react-router-dom';
import { DatabaseOutlined, BarChartOutlined, LayoutOutlined } from '@ant-design/icons';
import axios from 'axios';
import { RecentUpdatesResponse } from '@shared/api.interface';


const { Title, Text } = Typography;

// 导航卡片数据
const navCards = [
  {
    title: '数据源',
    description: '管理和配置数据源连接',
    icon: <DatabaseOutlined style={{ fontSize: 48, color: '#165DFF' }} />,
    path: '/data-sources',
    color: '#E6F2FF',
  },
  {
    title: '数据集',
    description: '创建和管理数据集查询',
    icon: <DatabaseOutlined style={{ fontSize: 48, color: '#52C41A' }} />,
    path: '/datasets',
    color: '#F6FFED',
  },
  {
    title: '图表配置',
    description: '创建和配置可视化图表',
    icon: <BarChartOutlined style={{ fontSize: 48, color: '#FAAD14' }} />,
    path: '/charts',
    color: '#FFFBE6',
  },
  {
    title: '看板',
    description: '构建和管理数据看板',
    icon: <LayoutOutlined style={{ fontSize: 48, color: '#722ED1' }} />,
    path: '/dashboards',
    color: '#F9F0FF',
  },
];

// 格式化时间
const formatTime = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  if (hours < 24) return `${hours}小时前`;
  if (days < 30) return `${days}天前`;
  return date.toLocaleDateString('zh-CN');
};

const HomePage: React.FC = () => {
  const [recentData, setRecentData] = useState<RecentUpdatesResponse>({
    recentDatasets: [],
    recentCharts: [],
    recentDashboards: [],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecentUpdates = async () => {
      try {
        const response = await axios.get<RecentUpdatesResponse>('/api/recent-updates');
        setRecentData(response.data);
      } catch (error) {
        console.error('获取最近更新失败:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRecentUpdates();
  }, []);

  // 合并所有最近更新并按时间排序
  const allRecentItems = [
    ...recentData.recentDatasets.map((item) => ({ ...item, type: '数据集' as const, path: `/datasets` })),
    ...recentData.recentCharts.map((item) => ({ ...item, type: '图表' as const, path: `/charts` })),
    ...recentData.recentDashboards.map((item) => ({ ...item, type: '看板' as const, path: `/dashboards` })),
  ]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 10);

  return (
    <div className="home-page">
      {/* 欢迎区域 */}
      <div className="welcome-section">
        <Title level={2}>欢迎使用Insight</Title>
        <Text>从数据到洞察，轻松构建可视化分析。管理数据源、创建图表、搭建看板，让数据说话。</Text>
      </div>

      {/* 导航卡片 */}
      <div className="nav-section">
        <Title level={3} style={{ marginBottom: 24 }}>快速导航</Title>
        <Row gutter={[16, 16]}>
          {navCards.map((card, index) => (
            <Col xs={24} sm={12} md={6} key={index}>
              <Card
                hoverable
                className="nav-card"
                style={{ backgroundColor: card.color, border: 'none' }}
                actions={[
                  <Link to={card.path} key="link">
                    <Button type="primary" size="small">
                      进入
                    </Button>
                  </Link>,
                ]}
              >
                <div className="card-content">
                  {card.icon}
                  <div className="card-text">
                    <Title level={4} style={{ margin: '16px 0 8px 0' }}>{card.title}</Title>
                    <Text style={{ color: '#666' }}>{card.description}</Text>
                  </div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      </div>

      {/* 最近更新 */}
      {allRecentItems.length > 0 && (
        <div className="recent-section">
          <Title level={3} style={{ marginBottom: 24 }}>最近更新</Title>
          <Card>
            <List
              loading={loading}
              dataSource={allRecentItems}
              renderItem={(item) => (
                <List.Item
                  actions={[
                    <Link to={item.path} key="link">
                      查看
                    </Link>
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <div style={{ display: 'flex', alignItems: 'center' }}>
                        <Text strong>{item.name}</Text>
                        <Tag style={{ marginLeft: 8 }} color={
                          item.type === '数据集' ? '#165DFF' :
                          item.type === '图表' ? '#52C41A' : '#722ED1'
                        }>
                          {item.type}
                        </Tag>
                      </div>
                    }
                    description={
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text type="secondary">{item.type}更新</Text>
                        <Text type="secondary">{formatTime(item.updatedAt)}</Text>
                      </div>
                    }
                  />
                </List.Item>
              )}
            />
          </Card>
        </div>
      )}
    </div>
  );
};

export default HomePage;