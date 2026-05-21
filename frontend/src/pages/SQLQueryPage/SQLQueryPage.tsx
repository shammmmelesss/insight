import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button, Select, Space, Table, Typography, message, Spin, Tag, Tooltip } from 'antd';
import {
  PlayCircleOutlined, CopyOutlined, ClearOutlined,
  CloseOutlined, CheckCircleOutlined, CloseCircleOutlined, AlignLeftOutlined, PlusOutlined,
} from '@ant-design/icons';
import Editor, { OnMount } from '@monaco-editor/react';
import { format } from 'sql-formatter';
import type { editor } from 'monaco-editor';
import axios from 'axios';
import { useWorkspace } from '../../contexts/WorkspaceContext';

const { Text } = Typography;

interface DataSource { id: string; name: string; type: string; }
interface Column { name: string; type: string; }
interface QueryResult {
  id: string; label: string; sql: string;
  status: 'running' | 'success' | 'error';
  columns: Column[]; rows: any[]; elapsed: number | null; error?: string;
}
interface QueryTab {
  id: string; name: string; sql: string;
  results: QueryResult[]; activeResultId: string | undefined;
}

const SQL_PLACEHOLDER = `-- 请选择数据源，然后输入 SQL 查询
-- 按 Ctrl+Enter（Mac: Cmd+Enter）执行查询

SELECT *
FROM your_table
LIMIT 100
`;

let _tc = 0;
function makeTab(): QueryTab {
  _tc += 1;
  return { id: `t${_tc}`, name: '未命名的查询', sql: SQL_PLACEHOLDER, results: [], activeResultId: undefined };
}

function ResultTable({ columns, rows }: { columns: Column[]; rows: any[] }) {
  const cols = columns.map(col => ({
    title: <Space size={4}><span>{col.name}</span><Tag style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>{col.type}</Tag></Space>,
    dataIndex: col.name, key: col.name, ellipsis: true,
    render: (val: any) => {
      if (val === null || val === undefined) return <Text type="secondary" style={{ fontStyle: 'italic' }}>NULL</Text>;
      const s = String(val);
      return s.length > 200 ? <Tooltip title={s}><span>{s.slice(0, 200)}…</span></Tooltip> : s;
    },
  }));
  return (
    <Table
      dataSource={rows.map((r, i) => ({ ...r, __k: i }))}
      columns={cols} rowKey="__k" size="small"
      scroll={{ x: 'max-content' }}
      pagination={{ pageSize: 100, showSizeChanger: true, pageSizeOptions: ['50', '100', '500'], showTotal: n => `共 ${n} 行`, size: 'small' }}
    />
  );
}

export default function SQLQueryPage() {
  const { currentWorkspace } = useWorkspace();
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [dsId, setDsId] = useState<string | undefined>();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<any>(null);
  const qcRef = useRef(0);

  const [tabs, setTabs] = useState<QueryTab[]>(() => [makeTab()]);
  const [activeTabId, setActiveTabId] = useState<string>('t1');

  const [editorPct, setEditorPct] = useState(45);
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!currentWorkspace?.id) return;
    axios.get('/api/data-sources', { params: { workspaceId: currentWorkspace.id } })
      .then(res => {
        const items: DataSource[] = res.data.items || res.data || [];
        setDataSources(items);
        if (items.length > 0) setDsId(cur => (cur == null ? items[0].id : cur));
      })
      .catch(() => {});
  }, [currentWorkspace?.id]);

  const activeTab = tabs.find(t => t.id === activeTabId);

  const switchTab = useCallback((toId: string) => {
    const curSql = editorRef.current?.getValue() ?? '';
    setTabs(prev => {
      const target = prev.find(t => t.id === toId);
      if (target && editorRef.current) {
        editorRef.current.setValue(target.sql);
        editorRef.current.focus();
      }
      return prev.map(t => t.id === activeTabId ? { ...t, sql: curSql } : t);
    });
    setActiveTabId(toId);
  }, [activeTabId]);

  const addTab = () => {
    const curSql = editorRef.current?.getValue() ?? '';
    const t = makeTab();
    setTabs(prev => [...prev.map(tab => tab.id === activeTabId ? { ...tab, sql: curSql } : tab), t]);
    setActiveTabId(t.id);
    setTimeout(() => { editorRef.current?.setValue(t.sql); editorRef.current?.focus(); }, 0);
  };

  const closeTab = (tabId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTabs(prev => {
      const next = prev.filter(t => t.id !== tabId);
      if (next.length === 0) {
        const fresh = makeTab();
        setTimeout(() => { setActiveTabId(fresh.id); editorRef.current?.setValue(fresh.sql); }, 0);
        return [fresh];
      }
      if (activeTabId === tabId) {
        const idx = prev.findIndex(t => t.id === tabId);
        const newActive = next[Math.min(idx, next.length - 1)];
        setTimeout(() => { setActiveTabId(newActive.id); editorRef.current?.setValue(newActive.sql); }, 0);
      }
      return next;
    });
  };

  const runQuery = useCallback(async () => {
    const sql = editorRef.current?.getValue()?.trim();
    if (!sql) { message.warning('请输入 SQL 语句'); return; }
    if (!dsId) { message.warning('请选择数据源'); return; }

    qcRef.current += 1;
    const seq = qcRef.current;
    const id = `q${seq}-${Date.now()}`;
    const label = `查询 ${seq}`;
    const t0 = Date.now();

    setTabs(prev => prev.map(t => t.id !== activeTabId ? t : {
      ...t,
      results: [...t.results, { id, label, sql, status: 'running' as const, columns: [], rows: [], elapsed: null }],
      activeResultId: id,
    }));

    try {
      const res = await axios.post('/api/datasets/preview', { sql, dataSourceId: dsId });
      setTabs(prev => prev.map(t => t.id !== activeTabId ? t : {
        ...t,
        results: t.results.map(r => r.id !== id ? r : {
          ...r, status: 'success' as const,
          columns: res.data.columns || [],
          rows: res.data.data || [],
          elapsed: Date.now() - t0,
        }),
      }));
    } catch (err: any) {
      setTabs(prev => prev.map(t => t.id !== activeTabId ? t : {
        ...t,
        results: t.results.map(r => r.id !== id ? r : {
          ...r, status: 'error' as const,
          elapsed: Date.now() - t0,
          error: err.response?.data?.error || '查询失败',
        }),
      }));
    }
  }, [dsId, activeTabId]);

  const handleMount: OnMount = (ed, monaco) => {
    editorRef.current = ed; monacoRef.current = monaco;
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, runQuery);
    ed.focus();
  };

  useEffect(() => {
    const ed = editorRef.current; const m = monacoRef.current;
    if (ed && m) ed.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.Enter, runQuery);
  }, [runQuery]);

  const onDrag = (e: React.MouseEvent) => {
    e.preventDefault(); dragging.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const r = containerRef.current.getBoundingClientRect();
      setEditorPct(Math.min(80, Math.max(15, ((ev.clientY - r.top) / r.height) * 100)));
    };
    const onUp = () => { dragging.current = false; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
  };

  const removeResultTab = (resultId: string) => {
    setTabs(prev => prev.map(t => {
      if (t.id !== activeTabId) return t;
      const next = t.results.filter(r => r.id !== resultId);
      const activeResultId = t.activeResultId === resultId
        ? (next.length ? next[next.length - 1].id : undefined)
        : t.activeResultId;
      return { ...t, results: next, activeResultId };
    }));
  };

  const formatSQL = () => {
    const ed = editorRef.current; if (!ed || !ed.getValue().trim()) return;
    try { ed.setValue(format(ed.getValue(), { language: 'sql', tabWidth: 2, keywordCase: 'upper' })); ed.focus(); }
    catch { message.error('格式化失败'); }
  };

  const active = activeTab?.results.find(r => r.id === activeTab.activeResultId);
  const isRunning = activeTab?.results.some(r => r.status === 'running') ?? false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* query tabs */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #e8e8e8', flexShrink: 0 }}>
        <div style={{ display: 'flex', flex: 1, overflowX: 'auto' }}>
          {tabs.map(tab => (
            <div key={tab.id} onClick={() => tab.id !== activeTabId && switchTab(tab.id)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap', userSelect: 'none', borderBottom: tab.id === activeTabId ? '2px solid #165DFF' : '2px solid transparent', color: tab.id === activeTabId ? '#165DFF' : '#595959', marginBottom: -1 }}>
              {tab.name}
              {tabs.length > 1 && <CloseOutlined style={{ fontSize: 10, color: '#bbb' }} onClick={e => closeTab(tab.id, e)} />}
            </div>
          ))}
        </div>
        <Button type="text" icon={<PlusOutlined />} onClick={addTab} style={{ flexShrink: 0, color: '#8c8c8c' }} title="新建查询" />
      </div>

      {/* toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', flexShrink: 0 }}>
        <Select placeholder="选择数据源" value={dsId} onChange={setDsId} style={{ width: 220 }}
          options={dataSources.map(ds => ({ value: ds.id, label: `${ds.name} (${ds.type})` }))} />
        <Button type="primary" icon={<PlayCircleOutlined />} onClick={runQuery} loading={isRunning} disabled={!dsId}>
          执行&nbsp;<span style={{ fontSize: 11, opacity: 0.75 }}>Ctrl+↵</span>
        </Button>
        <Button icon={<AlignLeftOutlined />} onClick={formatSQL}>格式化</Button>
        <Button icon={<CopyOutlined />} onClick={() => navigator.clipboard.writeText(editorRef.current?.getValue() || '').then(() => message.success('已复制'))}>复制 SQL</Button>
        <Button icon={<ClearOutlined />} onClick={() => { editorRef.current?.setValue(''); editorRef.current?.focus(); }}>清空</Button>
        {active?.status === 'success' && <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>{active.rows.length} 行 · {active.elapsed} ms</Text>}
      </div>

      <div ref={containerRef} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {/* editor */}
        <div style={{ height: `${editorPct}%`, minHeight: 0, border: '1px solid #e8e8e8', borderRadius: 6, overflow: 'hidden' }}>
          <Editor defaultLanguage="sql" defaultValue={SQL_PLACEHOLDER} onMount={handleMount}
            options={{ fontSize: 14, minimap: { enabled: false }, lineNumbers: 'on', scrollBeyondLastLine: false, automaticLayout: true, tabSize: 2, wordWrap: 'on', suggestOnTriggerCharacters: true, quickSuggestions: true }} />
        </div>

        {/* drag handle */}
        <div onMouseDown={onDrag} style={{ height: 6, cursor: 'row-resize', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ width: 40, height: 3, borderRadius: 2, background: '#d9d9d9' }} />
        </div>

        {/* results */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!activeTab || activeTab.results.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: '#bbb', fontSize: 13 }}>
              执行查询后结果将在此显示
            </div>
          ) : (
            <>
              {/* result tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid #e8e8e8', flexShrink: 0, overflowX: 'auto' }}>
                {activeTab.results.map(r => (
                  <div key={r.id}
                    onClick={() => setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, activeResultId: r.id } : t))}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 12px', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap', userSelect: 'none', borderBottom: r.id === activeTab.activeResultId ? '2px solid #165DFF' : '2px solid transparent', color: r.id === activeTab.activeResultId ? '#165DFF' : '#595959', marginBottom: -1 }}>
                    {r.status === 'running' && <Spin size="small" />}
                    {r.status === 'success' && <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 11 }} />}
                    {r.status === 'error' && <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 11 }} />}
                    {r.label}
                    <CloseOutlined style={{ fontSize: 10, color: '#aaa', marginLeft: 2 }} onClick={e => { e.stopPropagation(); removeResultTab(r.id); }} />
                  </div>
                ))}
              </div>

              {/* result content */}
              <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '8px 4px 4px' }}>
                {active?.status === 'running' && <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 120 }}><Spin tip="查询中..." /></div>}
                {active?.status === 'error' && <div style={{ padding: '12px 16px', color: '#ff4d4f', background: '#fff2f0', borderRadius: 6, fontSize: 13, fontFamily: 'monospace' }}>{active.error}</div>}
                {active?.status === 'success' && (active.columns.length === 0
                  ? <Text type="secondary">查询成功，无返回数据（{active.elapsed} ms）</Text>
                  : <ResultTable columns={active.columns} rows={active.rows} />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
