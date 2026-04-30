import React, { useState } from 'react';
import { Button, Input, Modal, Dropdown, Tooltip } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, MoreOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import { Dashboard } from '@shared/api.interface';
import './DashboardList.css';

interface DashboardListProps {
  dashboards: Dashboard[];
  loading: boolean;
  selectedDashboard: Dashboard | null;
  onSelectDashboard: (dashboard: Dashboard) => void;
  onAddDashboard: () => void;
  onEditDashboard: (dashboard: Dashboard) => void;
  onDeleteDashboard: (id: string) => void;
  collapsed?: boolean;
  onCollapse?: () => void;
}

const DashboardList: React.FC<DashboardListProps> = ({
  dashboards,
  loading,
  selectedDashboard,
  onSelectDashboard,
  onAddDashboard,
  onEditDashboard,
  onDeleteDashboard,
  collapsed,
  onCollapse,
}) => {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [dashboardToDelete, setDashboardToDelete] = useState<string | null>(null);

  const filteredDashboards = dashboards.filter(d =>
    d.name.toLowerCase().includes(searchKeyword.toLowerCase())
  );

  const handleDeleteClick = (id: string) => {
    setDashboardToDelete(id);
    setDeleteModalVisible(true);
  };

  const handleDeleteConfirm = () => {
    if (dashboardToDelete) {
      onDeleteDashboard(dashboardToDelete);
      setDeleteModalVisible(false);
      setDashboardToDelete(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 标题栏 */}
      <div className="dashboard-list-header">
        <span className="dashboard-list-title">看板</span>
        <div className="dashboard-list-header-actions">
          <Tooltip title="新建看板" placement="bottom">
            <Button type="text" size="small" icon={<PlusOutlined />} onClick={onAddDashboard} />
          </Tooltip>
          {onCollapse && (
            <Tooltip title={collapsed ? '展开' : '收起'} placement="bottom">
              <Button
                type="text"
                size="small"
                icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                onClick={onCollapse}
                style={{ color: '#999' }}
              />
            </Tooltip>
          )}
        </div>
      </div>

      {/* 搜索框 */}
      <div className="dashboard-list-search">
        <Input
          placeholder="搜索看板"
          prefix={<SearchOutlined style={{ color: '#bbb' }} />}
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          size="small"
          style={{ width: '100%' }}
          allowClear
        />
      </div>

      {/* 列表 */}
      <div className="dashboard-list-body">
        {loading ? (
          <div className="dashboard-list-empty">加载中...</div>
        ) : filteredDashboards.length === 0 ? (
          <div className="dashboard-list-empty">
            {searchKeyword ? '没有匹配的看板' : '暂无看板'}
          </div>
        ) : (
          filteredDashboards.map((dashboard) => (
            <div
              key={dashboard.id}
              className={`dashboard-list-item${selectedDashboard?.id === dashboard.id ? ' selected' : ''}`}
              onClick={() => onSelectDashboard(dashboard)}
            >
              <span className="item-name">{dashboard.name}</span>
              <Dropdown
                menu={{
                  items: [
                    {
                      key: 'edit',
                      icon: <EditOutlined />,
                      label: '编辑',
                      onClick: ({ domEvent }) => {
                        domEvent.stopPropagation();
                        onEditDashboard(dashboard);
                      },
                    },
                    {
                      key: 'delete',
                      icon: <DeleteOutlined />,
                      label: '删除',
                      danger: true,
                      onClick: ({ domEvent }) => {
                        domEvent.stopPropagation();
                        handleDeleteClick(dashboard.id);
                      },
                    },
                  ],
                }}
                trigger={['click']}
              >
                <Button
                  type="text"
                  icon={<MoreOutlined />}
                  size="small"
                  className="more-btn"
                  onClick={(e) => e.stopPropagation()}
                />
              </Dropdown>
            </div>
          ))
        )}
      </div>

      <Modal
        title="删除确认"
        open={deleteModalVisible}
        onOk={handleDeleteConfirm}
        onCancel={() => { setDeleteModalVisible(false); setDashboardToDelete(null); }}
        okText="确认删除"
        cancelText="取消"
        okType="danger"
      >
        <p>确定要删除此看板吗？此操作不可恢复。</p>
      </Modal>
    </div>
  );
};

export default DashboardList;
