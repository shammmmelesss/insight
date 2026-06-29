import React, { useState, useCallback, useEffect } from 'react';
import { Modal, Select, Avatar, Space, message } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import axios from 'axios';
import { Dashboard, LarkUser } from '@shared/api.interface';

const WORK_USER_API = 'https://work.learnings.ai/work/v1/user';

export interface WorkUser {
  openId: string;
  name: string;
  avatar?: string;
}

/** 将接口原始数据转换为 WorkUser */
export function mapWorkUser(u: any): WorkUser {
  return {
    openId: u.feishu_userid || u.userid || u.id,
    name: u.name,
    avatar: u.avatar,
  };
}

/** 调用用户列表接口，支持 keyword 搜索 */
export async function fetchWorkUsers(keyword?: string): Promise<WorkUser[]> {
  const params: Record<string, string> = {};
  if (keyword) params.keyword = keyword;
  const res = await axios.get(WORK_USER_API, { params });
  const list: any[] = res.data?.data?.userList || [];
  return list.map(mapWorkUser).filter(u => u.openId);
}

const MOCK_USERS: WorkUser[] = [
  { openId: 'mock_user_1', name: '张三' },
  { openId: 'mock_user_2', name: '李四' },
  { openId: 'mock_user_3', name: '王五' },
  { openId: 'mock_user_4', name: '赵六' },
];

const isDev = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

interface ShareDashboardModalProps {
  dashboard: Dashboard | null;
  open: boolean;
  onClose: () => void;
  onShared: (dashboard: Dashboard) => void;
}

const ShareDashboardModal: React.FC<ShareDashboardModalProps> = ({
  dashboard,
  open,
  onClose,
  onShared,
}) => {
  const [userOptions, setUserOptions] = useState<WorkUser[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);

  const parseSharedWith = (raw: string | LarkUser[] | undefined): WorkUser[] => {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw as WorkUser[];
    try { return JSON.parse(raw) || []; } catch { return []; }
  };

  useEffect(() => {
    if (!open || !dashboard) return;
    const shared = parseSharedWith(dashboard.sharedWith);
    setSelectedUserIds(shared.map(u => u.openId));
    if (isDev) {
      const merged = [...MOCK_USERS];
      shared.forEach(u => { if (!merged.find(m => m.openId === u.openId)) merged.push(u); });
      setUserOptions(merged);
    } else {
      setUserOptions(shared);
    }
  }, [open, dashboard]);

  const searchUsers = useCallback(async (keyword: string) => {
    if (isDev) {
      if (!keyword) return;
      const filtered = MOCK_USERS.filter(u => u.name.includes(keyword));
      setUserOptions(prev => {
        const kept = prev.filter(u => selectedUserIds.includes(u.openId));
        const fresh = filtered.filter(u => !kept.find(e => e.openId === u.openId));
        return [...kept, ...fresh];
      });
      return;
    }

    setSearching(true);
    try {
      const items = await fetchWorkUsers(keyword || undefined);
      setUserOptions(prev => {
        const kept = prev.filter(u => selectedUserIds.includes(u.openId));
        const fresh = items.filter(u => !kept.find(e => e.openId === u.openId));
        return [...kept, ...fresh];
      });
    } catch {
      // ignore
    } finally {
      setSearching(false);
    }
  }, [selectedUserIds]);

  const handleOk = async () => {
    if (!dashboard) return;
    setSaving(true);
    try {
      const selectedUsers = selectedUserIds
        .map(id => userOptions.find(u => u.openId === id))
        .filter(Boolean) as WorkUser[];
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
        placeholder={isDev ? '本地测试：直接选择' : '搜索用户姓名...'}
        filterOption={false}
        showSearch
        onSearch={searchUsers}
        loading={searching}
        value={selectedUserIds}
        onChange={setSelectedUserIds}
        optionLabelProp="label"
        notFoundContent={searching ? '搜索中...' : (isDev ? '无匹配用户' : '输入姓名搜索')}
      >
        {userOptions.map(user => (
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
