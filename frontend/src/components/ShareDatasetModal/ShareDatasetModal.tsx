import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { Modal, Select, Avatar, Space, App, Table, Button } from 'antd';
import { UserOutlined, DeleteOutlined } from '@ant-design/icons';
import axios from 'axios';
import { Dataset, ShareEntry, ShareRole } from '@shared/api.interface';
import { WorkUser, fetchAllWorkUsers } from '@/lib/workUser';

interface ShareDatasetModalProps {
  dataset: Dataset | null;
  open: boolean;
  onClose: () => void;
  onShared: (dataset: Dataset) => void;
}

const ROLE_OPTIONS: { value: ShareRole; label: string }[] = [
  { value: 'view', label: '查看' },
  { value: 'manage', label: '管理' },
];

function parseSharedWith(raw: string | ShareEntry[] | undefined): ShareEntry[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as ShareEntry[];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const ShareDatasetModal: React.FC<ShareDatasetModalProps> = ({
  dataset,
  open,
  onClose,
  onShared,
}) => {
  const [shares, setShares] = useState<ShareEntry[]>([]);
  const [allUsers, setAllUsers] = useState<WorkUser[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [saving, setSaving] = useState(false);
  const { message } = App.useApp();

  // 打开时预加载全量用户，并记录初始已分享用户
  useEffect(() => {
    if (!open || !dataset) return;
    setShares(parseSharedWith(dataset.sharedWith));
    setSearchKeyword('');
    setLoadingUsers(true);
    fetchAllWorkUsers()
      .then(setAllUsers)
      .finally(() => setLoadingUsers(false));
  }, [open, dataset]);

  const sharedIds = useMemo(() => new Set(shares.map((s) => s.openId)), [shares]);

  // 供选择的候选用户（排除已添加的），本地过滤最多 100 条
  const options = useMemo(() => {
    const kw = searchKeyword.toLowerCase();
    return allUsers
      .filter((u) => !sharedIds.has(u.openId))
      .filter(
        (u) =>
          !kw ||
          u.name.toLowerCase().includes(kw) ||
          u.openId.toLowerCase().includes(kw),
      )
      .slice(0, 100);
  }, [allUsers, sharedIds, searchKeyword]);

  const handleAdd = useCallback(
    (openId: string) => {
      const user = allUsers.find((u) => u.openId === openId);
      if (!user) return;
      setShares((prev) => [
        ...prev,
        { openId: user.openId, name: user.name, avatar: user.avatar, role: 'view' },
      ]);
      setSearchKeyword('');
    },
    [allUsers],
  );

  const handleRoleChange = useCallback((openId: string, role: ShareRole) => {
    setShares((prev) => prev.map((s) => (s.openId === openId ? { ...s, role } : s)));
  }, []);

  const handleRemove = useCallback((openId: string) => {
    setShares((prev) => prev.filter((s) => s.openId !== openId));
  }, []);

  const handleOk = async () => {
    if (!dataset) return;
    setSaving(true);
    try {
      const res = await axios.put(`/api/datasets/${dataset.id}/share`, {
        sharedWith: JSON.stringify(shares),
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

  const columns = [
    {
      title: '用户',
      key: 'user',
      render: (_: unknown, record: ShareEntry) => (
        <Space>
          <Avatar size="small" src={record.avatar} icon={<UserOutlined />} />
          {record.name}
        </Space>
      ),
    },
    {
      title: '权限',
      key: 'role',
      width: 120,
      render: (_: unknown, record: ShareEntry) => (
        <Select
          size="small"
          style={{ width: 90 }}
          value={record.role}
          options={ROLE_OPTIONS}
          onChange={(role: ShareRole) => handleRoleChange(record.openId, role)}
        />
      ),
    },
    {
      title: '',
      key: 'action',
      width: 48,
      render: (_: unknown, record: ShareEntry) => (
        <Button
          type="text"
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleRemove(record.openId)}
        />
      ),
    },
  ];

  return (
    <Modal
      title={`分享数据集：${dataset?.name || ''}`}
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      okText="保存"
      cancelText="取消"
      confirmLoading={saving}
      width={520}
    >
      <div style={{ marginBottom: 8, color: '#666', fontSize: 13 }}>
        选择要分享的用户，并为每个用户设置权限（查看 / 管理）。管理权限等同所有者。
      </div>
      <Select
        style={{ width: '100%', marginBottom: 16 }}
        placeholder="输入姓名搜索并添加用户..."
        showSearch
        value={undefined}
        searchValue={searchKeyword}
        onSearch={setSearchKeyword}
        filterOption={false}
        loading={loadingUsers}
        onSelect={(value?: string) => value && handleAdd(value)}
        optionLabelProp="label"
        notFoundContent={loadingUsers ? '加载中...' : '未找到匹配用户'}
      >
        {options.map((user) => (
          <Select.Option key={user.openId} value={user.openId} label={user.name}>
            <Space>
              <Avatar size="small" src={user.avatar} icon={<UserOutlined />} />
              {user.name}
            </Space>
          </Select.Option>
        ))}
      </Select>
      <Table
        size="small"
        rowKey="openId"
        columns={columns}
        dataSource={shares}
        pagination={false}
        locale={{ emptyText: '暂无分享用户' }}
      />
    </Modal>
  );
};

export default ShareDatasetModal;
