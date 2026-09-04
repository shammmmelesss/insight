import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Typography, List, Tag, Skeleton } from 'antd';
import { Link } from 'react-router-dom';
import { ArrowRightOutlined, DatabaseOutlined, BarChartOutlined, LayoutOutlined } from '@ant-design/icons';
import axios from 'axios';
import { RecentUpdatesResponse } from '@shared/api.interface';
import './HomePage.css';

const { Title, Text } = Typography;

// 导航卡片数据
const navCards = [
  {
    title: '数据集',
    description: '基于 SQL 创建和管理数据查询',
    icon: <DatabaseOutlined />,
    path: '/datasets',
    bg: '#EFF6FF',
    color: '#2563EB',
  },
  {
    title: '图表配置',
    description: '拖拽配置可视化图表',
    icon: <BarChartOutlined />,
    path: '/charts',
    bg: '#FDF1E7',
    color: '#EA7A1D',
  },
  {
    title: '看板',
    description: '搭建交互式数据看板',
    icon: <LayoutOutlined />,
    path: '/dashboards',
    bg: '#F4F0FF',
    color: '#722ED1',
  },
  {
    title: '监控',
    description: '数据资产运行状态与概览',
    icon: <BarChartOutlined />,
    path: '/monitor',
    bg: '#F0FDF4',
    color: '#16A34A',
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

const typeColor: Record<string, string> = {
  数据集: 'geekblue',
  图表: 'green',
  看板: 'purple',
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
    ...recentData.recentDatasets.map(item => ({ ...item, type: '数据集' as const, path: `/datasets` })),
    ...recentData.recentCharts.map(item => ({ ...item, type: '图表' as const, path: `/charts` })),
    ...recentData.recentDashboards.map(item => ({ ...item, type: '看板' as const, path: `/dashboards` })),
  ]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 8);

  const stats = [
    { label: '数据集', value: recentData.datasetCount ?? allRecentItems.filter(i => i.type === '数据集').length },
    { label: '图表', value: recentData.chartCount ?? allRecentItems.filter(i => i.type === '图表').length },
    { label: '看板', value: recentData.dashboardCount ?? allRecentItems.filter(i => i.type === '看板').length },
  ];

  return (
    <div className="home-page">
      {/* 欢迎横幅 */}
      <div className="home-welcome">
        <Title>欢迎使用 Insight</Title>
        <Text className="home-welcome-sub">
          从数据到洞察，轻松构建可视化分析。管理数据集、拖拽配置图表、搭建看板，让数据说话。
        </Text>
        <div className="home-welcome-stats">
          {stats.map(s => (
            <div className="home-stat" key={s.label}>
              <div className="home-stat-value">{s.value}</div>
              <div className="home-stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 快速导航 */}
      <div>
        <div className="home-section-title">
          <Title level={4}>快速导航</Title>
        </div>
        <Row gutter={[16, 16]}>
          {navCards.map((card, index) => (
            <Col xs={24} sm={12} md={6} key={index}>
              <Link to={card.path} style={{ display: 'block', height: '100%' }}>
                <Card className="home-nav-card" bordered>
                  <div
                    className="home-nav-icon"
                    style={{ background: card.bg, color: card.color, fontSize: 20 }}
                  >
                    {card.icon}
                  </div>
                  <div>
                    <div className="home-nav-title">{card.title}</div>
                    <div className="home-nav-desc">{card.description}</div>
                  </div>
                  <span className="home-nav-enter">
                    进入 <ArrowRightOutlined style={{ fontSize: 11 }} />
                  </span>
                </Card>
              </Link>
            </Col>
          ))}
        </Row>
      </div>

      {/* 最近更新 */}
      <div>
        <div className="home-section-title">
          <Title level={4}>最近更新</Title>
          {allRecentItems.length > 0 && (
            <Link className="home-more" to="/dashboards">
              查看全部
            </Link>
          )}
        </div>
        <Card bordered>
          <List
            className="home-recent-list"
            loading={loading}
            dataSource={allRecentItems}
            locale={{ emptyText: <Skeleton active /> }}
            renderItem={item => (
              <List.Item
                actions={[
                  <Link to={item.path} key="link" style={{ fontSize: 13 }}>
                    查看
                  </Link>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Text strong style={{ fontSize: 14 }}>{item.name}</Text>
                      <Tag color={typeColor[item.type]} style={{ borderRadius: 6, marginInlineEnd: 0 }}>
                        {item.type}
                      </Tag>
                    </div>
                  }
                  description={
                    <span>
                      <Text type="secondary" style={{ fontSize: 12 }}>{item.type}更新</Text>
                    </span>
                  }
                />
                <div style={{ marginRight: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                    {formatTime(item.updatedAt)}
                  </Text>
                </div>
              </List.Item>
            )}
          />
        </Card>
      </div>
    </div>
  );
};

export default HomePage;