import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Modal, Select, Avatar, Space, App } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import axios from 'axios';
import { Dashboard } from '@shared/api.interface';
import { WorkUser, fetchAllWorkUsers } from '@/lib/workUser';

export type { WorkUser };

interface ShareDashboardModalProps {
  dashboard: Dashboard | null;
  open: boolean;
  onClose: () => void;
  onShared: (dashboard: Dashboard) => void;
}

function parseSharedWith(raw: string | WorkUser[] | undefined): WorkUser[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as WorkUser[];
  try { return JSON.parse(raw) || []; } catch { return []; }
}

const ShareDashboardModal: React.FC<ShareDashboardModalProps> = ({
  dashboard,
  open,
  onClose,
  onShared,
}) => {
  const [selectedUsers, setSelectedUsers] = useState<WorkUser[]>([]);
  const [initialSharedWith, setInitialSharedWith] = useState<WorkUser[]>([]);
  const [allUsers, setAllUsers] = useState<WorkUser[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [saving, setSaving] = useState(false);
  const { message } = App.useApp();

  // 打开时预加载全量用户，并记录初始已分享用户
  useEffect(() => {
    if (!open || !dashboard) return;
    const initial = parseSharedWith(dashboard.sharedWith);
    setSelectedUsers(initial);
    setInitialSharedWith(initial);
    setSearchKeyword('');
    setLoadingUsers(true);
    fetchAllWorkUsers()
      .then(setAllUsers)
      .finally(() => setLoadingUsers(false));
  }, [open, dashboard]);

  // 本地过滤，最多展示 100 条
  const filteredUsers = useMemo(() => {
    if (!searchKeyword) return allUsers.slice(0, 100);
    const kw = searchKeyword.toLowerCase();
    return allUsers
      .filter((u) => u.name.toLowerCase().includes(kw) || u.openId.toLowerCase().includes(kw))
      .slice(0, 100);
  }, [allUsers, searchKeyword]);

  // 已选用户始终显示在选项中
  const displayOptions = useMemo(() => {
    const combined: WorkUser[] = [...selectedUsers];
    filteredUsers.forEach((u) => {
      if (!combined.find((s) => s.openId === u.openId)) combined.push(u);
    });
    return combined;
  }, [filteredUsers, selectedUsers]);

  const selectedIds = selectedUsers.map((u) => u.openId);

  const handleSearch = useCallback((keyword: string) => {
    setSearchKeyword(keyword);
  }, []);

  const handleChange = useCallback(
    (ids: string[]) => {
      const newSelected = ids
        .map((id) => displayOptions.find((u) => u.openId === id))
        .filter(Boolean) as WorkUser[];
      setSelectedUsers(newSelected);
    },
    [displayOptions],
  );

  const handleOk = async () => {
    if (!dashboard) return;
    setSaving(true);
    try {
      const initialIds = new Set(initialSharedWith.map((u) => u.openId));
      const selectedIds = new Set(selectedUsers.map((u) => u.openId));
      const added = selectedUsers.filter((u) => !initialIds.has(u.openId));
      const removed = initialSharedWith.filter((u) => !selectedIds.has(u.openId));
      if (added.length || removed.length) {
        console.log(
          `[Share] dashboard=${dashboard.id} added=[${added.map((u) => u.name).join(', ')}] removed=[${removed.map((u) => u.name).join(', ')}]`,
        );
      }
      const res = await axios.put(`/api/dashboards/${dashboard.id}/share`, {
        sharedWith: JSON.stringify(selectedUsers),
      });
      onShared(res.data);
      message.success('分享设置已保存');
      onClose();
    } catch {
      message.error('保存分享设置失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={`分享看板：${dashboard?.name || ''}`}
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      width={480}
    >
      <div style={{ marginBottom: 8, color: '#666', fontSize: 13 }}>
        选择可访问此看板的用户（支持多选）
      </div>
      <Select
        mode="multiple"
        style={{ width: '100%' }}
        placeholder="输入姓名搜索用户..."
        showSearch
        onSearch={handleSearch}
        filterOption={false}
        loading={loadingUsers}
        value={selectedIds}
        onChange={handleChange}
        optionLabelProp="label"
        notFoundContent={loadingUsers ? '加载中...' : '未找到匹配用户'}
      >
        {displayOptions.map((user) => (
          <Select.Option key={user.openId} value={user.openId} label={user.name}>
            <Space>
              <Avatar size="small" src={user.avatar} icon={<UserOutlined />} />
              {user.name}
            </Space>
          </Select.Option>
        ))}
      </Select>
    </Modal>
  );
};

export default ShareDashboardModal;
