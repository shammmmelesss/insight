import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Modal, Select, Avatar, Space, App } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import axios from 'axios';
import { Dashboard } from '@shared/api.interface';
import { WorkUser, searchWorkUsers } from '@/lib/workUser';

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
  // Full user objects for currently selected users (needed to persist name/avatar on save)
  const [selectedUsers, setSelectedUsers] = useState<WorkUser[]>([]);
  // Search result options
  const [searchOptions, setSearchOptions] = useState<WorkUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const { message } = App.useApp();

  // Reset state when modal opens
  useEffect(() => {
    if (!open || !dashboard) return;
    const shared = parseSharedWith(dashboard.sharedWith);
    setSelectedUsers(shared);
    setSearchOptions([]);
  }, [open, dashboard]);

  // Options to render = search results + selected users (deduped, selected always visible)
  const displayOptions = useMemo(() => {
    const combined: WorkUser[] = [...selectedUsers];
    searchOptions.forEach((u) => {
      if (!combined.find((s) => s.openId === u.openId)) combined.push(u);
    });
    return combined;
  }, [searchOptions, selectedUsers]);

  const selectedIds = selectedUsers.map((u) => u.openId);

  const handleSearch = useCallback(
    async (keyword: string) => {
      if (!keyword) {
        setSearchOptions([]);
        return;
      }
      setSearching(true);
      try {
        const results = await searchWorkUsers(keyword);
        setSearchOptions(results);
      } catch {
        setSearchOptions([]);
      } finally {
        setSearching(false);
      }
    },
    [],
  );

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
        loading={searching}
        value={selectedIds}
        onChange={handleChange}
        optionLabelProp="label"
        notFoundContent={searching ? '搜索中...' : '请输入关键词搜索用户'}
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
