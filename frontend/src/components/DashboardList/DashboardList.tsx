import React, { useState } from 'react';
import { Button, Input, Modal, Dropdown } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined, MoreOutlined } from '@ant-design/icons';
import { Dashboard } from '@shared/api.interface';

interface DashboardListProps {
  dashboards: Dashboard[];
  loading: boolean;
  selectedDashboard: Dashboard | null;
  onSelectDashboard: (dashboard: Dashboard) => void;
  onAddDashboard: () => void;
  onEditDashboard: (dashboard: Dashboard) => void;
  onDeleteDashboard: (id: string) => void;
}

const DashboardList: React.FC<DashboardListProps> = ({
  dashboards,
  loading,
  selectedDashboard,
  onSelectDashboard,
  onAddDashboard,
  onEditDashboard,
  onDeleteDashboard,
}) => {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [dashboardToDelete, setDashboardToDelete] = useState<string | null>(null);

  // 过滤看板列表
  const filteredDashboards = dashboards.filter(dashboard => 
    dashboard.name.toLowerCase().includes(searchKeyword.toLowerCase())
  );

  // 处理删除确认
  const handleDeleteClick = (id: string) => {
    setDashboardToDelete(id);
    setDeleteModalVisible(true);
  };

  // 确认删除
  const handleDeleteConfirm = () => {
    if (dashboardToDelete) {
      onDeleteDashboard(dashboardToDelete);
      setDeleteModalVisible(false);
      setDashboardToDelete(null);
    }
  };

  // 取消删除
  const handleDeleteCancel = () => {
    setDeleteModalVisible(false);
    setDashboardToDelete(null);
  };

  return (
    <div>
      <div style={{ padding: '20px', borderBottom: '1px solid #f0f0f0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Input
            placeholder="搜索看板"
            prefix={<SearchOutlined />}
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
            style={{ width: '180px' }}
            size="small"
          />
          <Button
            type="primary"
            icon={<PlusOutlined />}
            size="small"
            onClick={onAddDashboard}
          >
            新增
          </Button>
        </div>
      </div>
      
      <div style={{ padding: '16px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>加载中...</div>
        ) : filteredDashboards.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: '#666' }}>
            <div style={{ marginBottom: 16 }}>{searchKeyword ? '没有找到匹配的看板' : '暂无看板'}</div>
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              onClick={onAddDashboard}
            >
              创建第一个看板
            </Button>
          </div>
        ) : (
          <div>
            {filteredDashboards.map((dashboard) => (
              <div
                key={dashboard.id}
                style={{
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0 8px',
                  cursor: 'pointer',
                  borderRadius: 4,
                  backgroundColor: selectedDashboard?.id === dashboard.id ? '#e8f0fe' : 'transparent',
                  fontWeight: selectedDashboard?.id === dashboard.id ? 'bold' : 'normal',
                  fontSize: 13,
                }}
                onClick={() => onSelectDashboard(dashboard)}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                  {dashboard.name}
                </span>
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
                    onClick={(e) => e.stopPropagation()}
                    style={{ flexShrink: 0 }}
                  />
                </Dropdown>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 删除确认弹窗 */}
      <Modal
        title="删除确认"
        open={deleteModalVisible}
        onOk={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
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