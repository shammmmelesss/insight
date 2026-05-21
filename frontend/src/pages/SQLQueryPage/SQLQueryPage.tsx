import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button, Select, Space, Table, Typography, message, Spin, Tag, Tooltip, Tabs } from 'antd';
import { PlayCircleOutlined, CopyOutlined, ClearOutlined, CloseOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import Editor, { OnMount } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import axios from 'axios';
import { useWorkspace } from '../../contexts/WorkspaceContext';

const { Text } = Typography;

interface DataSource {
  id: string;
  name: string;
  type: string;
}

interface Column {
  name: string;
  type: string;
}

interface QueryResult {
  id: string;
  label: string;
  sql: string;
  status: 'running' | 'success' | 'error';
  columns: Column[];
  rows: any[];
  elapsed: number | null;
  error?: string;
}

const SQL_PLACEHOLDER = `-- 请选择数据源，然后输入 SQL 查询
-- 按 Ctrl+Enter（Mac: Cmd+Enter）执行查询

SELECT *
FROM your_table
LIMIT 100
`;

let queryCounter = 0;

function ResultTable({ columns, rows }: { columns: Column[]; rows: any[] }) {
  const tableColumns = columns.map(col => ({
    title: (
      <Space size={4}>
        <span>{col.name}</span>
        <Tag style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>{col.type}</Tag>
      </Space>
    ),
    dataIndex: col.name,
    key: col.name,
    ellipsis: true,
    render: (val: any) => {
      if (val === null || val === undefined)
        return <Text type="secondary" style={{ fontStyle: 'italic' }}>NULL</Text>;
      const str = String(val);
      if (str.length > 200)
        return <Tooltip title={str}><span>{str.slice(0, 200)}…</span></Tooltip>;
      return str;
    },
  }));

  return (
    <Table
      dataSource={rows.map((r, i) => ({ ...r, __key: i }))}
      columns={tableColumns}
      rowKey="__key"
      size="small"
      scroll={{ x: 'max-content' }}
      pagination={{ pageSize: 200, showTotal: total => `共 ${total} 行`, size: 'small' }}
    />
  );
}

const SQLQueryPage: React.FC = () => {
  const { currentWorkspace } = useWorkspace();
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [selectedDataSource, setSelectedDataSource] = useState<string | undefined>();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<any>(null);

  const [results, setResults] = useState<QueryResult[]>([]);
  const [activeTab, setActiveTab] = useState<string | undefined>();

  // draggable split
  const [editorHeightPct, setEditorHeightPct] = useState(45);
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!currentWorkspace?.id) return;
    axios.get('/api/data-sources', { params: { workspaceId: currentWorkspace.id } })
      .then(res => setDataSources(res.data.items || res.data || []))
      .catch(() => {});
  }, [currentWorkspace?.id]);

  const runQuery = useCallback(async () => {
    const sql = editorRef.current?.getValue()?.trim();
    if (!sql) { message.warning('请输入 SQL 语句'); return; }
    if (!selectedDataSource) { message.warning('请选择数据源'); return; }

    queryCounter += 1;
    const id = `q-${queryCounter}`;
    const label = `查询 ${queryCounter}`;
    const t0 = Date.now();

    const newResult: QueryResult = { id, label, sql, status: 'running', columns: [], rows: [], elapsed: null };
    setResults(prev => [...prev, newResult]);
    setActiveTab(id);

    try {
      const res = await axios.post('/api/datasets/preview', { sql, dataSourceId: selectedDataSource });
      setResults(prev => prev.map(r => r.id !== id ? r : {
        ...r,
        status: 'success',
        columns: res.data.columns || [],
        rows: res.data.data || [],
        elapsed: Date.now() - t0,
      }));
    } catch (err: any) {
      setResults(prev => prev.map(r => r.id !== id ? r : {
        ...r,
        status: 'error',
        elapsed: Date.now() - t0,
        error: err.response?.data?.error || '查询失败',
      }));
    }
  }, [selectedDataSource]);

  const handleMount: OnMount = (ed, monaco) => {
    editorRef.current = ed;
    monacoRef.current = monaco;
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, runQuery);
    ed.focus();
  };

  useEffect(() => {
    const ed = editorRef.current;
    const monaco = monacoRef.current;
    if (!ed || !monaco) return;
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, runQuery);
  }, [runQuery]);

  const onDividerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((ev.clientY - rect.top) / rect.height) * 100;
      setEditorHeightPct(Math.min(80, Math.max(15, pct)));
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const removeTab = (id: string) => {
    setResults(prev => {
      const next = prev.filter(r => r.id !== id);
      if (activeTab === id) setActiveTab(next.length ? next[next.length - 1].id : undefined);
      return next;
    });
  };

  const copySQL = () => {
    const sql = editorRef.current?.getValue() || '';
    navigator.clipboard.writeText(sql).then(() => message.success('已复制'));
  };

  const clearSQL = () => {
    editorRef.current?.setValue('');
    editorRef.current?.focus();
  };

  const activeResult = results.find(r => r.id === activeTab);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8, flexShrink: 0 }}>
        <Select
          placeholder="选择数据源"
          value={selectedDataSource}
          onChange={setSelectedDataSource}
          style={{ width: 220 }}
          options={dataSources.map(ds => ({ value: ds.id, label: `${ds.name} (${ds.type})` }))}
        />
        <Button
          type="primary"
          icon={<PlayCircleOutlined />}
          onClick={runQuery}
          loading={results.some(r => r.status === 'running')}
          disabled={!selectedDataSource}
        >
          执行&nbsp;<span style={{ fontSize: 11, opacity: 0.75 }}>Ctrl+↵</span>
        </Button>
        <Button icon={<CopyOutlined />} onClick={copySQL}>复制 SQL</Button>
        <Button icon={<ClearOutlined />} onClick={clearSQL}>清空</Button>
        {activeResult?.status === 'success' && (
          <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
            {activeResult.rows.length} 行 · {activeResult.elapsed} ms
          </Text>
        )}
      </div>

      {/* editor + results */}
      <div ref={containerRef} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {/* editor pane */}
        <div style={{ height: `${editorHeightPct}%`, minHeight: 0, border: '1px solid #e8e8e8', borderRadius: 6, overflow: 'hidden' }}>
          <Editor
            defaultLanguage="sql"
            defaultValue={SQL_PLACEHOLDER}
            onMount={handleMount}
            options={{
              fontSize: 14,
              minimap: { enabled: false },
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              wordWrap: 'on',
              suggestOnTriggerCharacters: true,
              quickSuggestions: true,
            }}
          />
        </div>

        {/* divider */}
        <div
          onMouseDown={onDividerMouseDown}
          style={{ height: 6, cursor: 'row-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        >
          <div style={{ width: 40, height: 3, borderRadius: 2, background: '#d9d9d9' }} />
        </div>

        {/* results pane */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {results.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#bbb', fontSize: 13 }}>
              执行查询后结果将在此显示
            </div>
          ) : (
            <Tabs
              activeKey={activeTab}
              onChange={setActiveTab}
              size="small"
              style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
              tabBarStyle={{ marginBottom: 0, flexShrink: 0 }}
              items={results.map(r => ({
                key: r.id,
                label: (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    {r.status === 'running' && <Spin size="small" />}
                    {r.status === 'success' && <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 12 }} />}
                    {r.status === 'error' && <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 12 }} />}
                    {r.label}
                    <CloseOutlined
                      style={{ fontSize: 10, color: '#999', marginLeft: 2 }}
                      onClick={e => { e.stopPropagation(); removeTab(r.id); }}
                    />
                  </span>
                ),
                children: (
                  <div style={{ overflow: 'auto', height: '100%', paddingTop: 4 }}>
                    {r.status === 'running' && (
                      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 120 }}>
                        <Spin tip="查询中..." />
                      </div>
                    )}
                    {r.status === 'error' && (
                      <div style={{ padding: '12px 16px', color: '#ff4d4f', background: '#fff2f0', borderRadius: 6, fontSize: 13, fontFamily: 'monospace' }}>
                        {r.error}
                      </div>
                    )}
                    {r.status === 'success' && (
                      r.columns.length === 0
                        ? <Text type="secondary">查询执行成功，无返回数据（{r.elapsed} ms）</Text>
                        : <ResultTable columns={r.columns} rows={r.rows} />
                    )}
                  </div>
                ),
              }))}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default SQLQueryPage;
