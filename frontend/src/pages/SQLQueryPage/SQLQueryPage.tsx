import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button, Select, Space, Table, Typography, message, Spin, Tag, Tooltip, Drawer, List, Empty, Popconfirm } from 'antd';
import {
  PlayCircleOutlined, CopyOutlined, ClearOutlined,
  CloseOutlined, CheckCircleOutlined, CloseCircleOutlined, AlignLeftOutlined, PlusOutlined,
  HistoryOutlined, DeleteOutlined,
} from '@ant-design/icons';
import Editor, { OnMount } from '@monaco-editor/react';
import { format } from 'sql-formatter';
import type { editor } from 'monaco-editor';
import axios from 'axios';
import { useWorkspace } from '../../contexts/WorkspaceContext';

const { Text } = Typography;

interface DataSource { id: string; name: string; type: string; }
interface Column { name: string; type: string; }
interface HistoryEntry {
  id: string; sql: string; dataSourceId: string; dataSourceName: string;
  createdAt: string; status: 'success' | 'error';
  elapsed: number | null; rowCount?: number; errorMsg?: string;
}

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
  const [dsId, setDsId] = useState<string | undefined>(() => localStorage.getItem('sql_query_dsid') || undefined);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<any>(null);
  const qcRef = useRef(0);

  const [tabs, setTabs] = useState<QueryTab[]>(() => {
    try {
      const saved = localStorage.getItem('sql_query_tabs');
      if (saved) {
        const parsed: QueryTab[] = JSON.parse(saved);
        if (parsed.length > 0) {
          parsed.forEach(t => { t.results = []; t.activeResultId = undefined; });
          return parsed;
        }
      }
    } catch {}
    return [makeTab()];
  });
  const tabsRef = useRef<QueryTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('sql_query_tabs');
      const activeId = localStorage.getItem('sql_query_active_tab');
      if (saved && activeId) {
        const parsed: QueryTab[] = JSON.parse(saved);
        if (parsed.find(t => t.id === activeId)) return activeId;
        if (parsed.length > 0) return parsed[0].id;
      }
    } catch {}
    return `t${_tc}`;
  });
  const activeTabIdRef = useRef('');

  const [editorPct, setEditorPct] = useState(45);
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await axios.get('/api/query-history');
      setHistory(res.data.items || []);
    } catch { /* silently ignore */ }
    finally { setHistoryLoading(false); }
  }, []);

  useEffect(() => {
    axios.get('/api/data-sources')
      .then(res => {
        const items: DataSource[] = res.data.items || res.data || [];
        setDataSources(items);
        if (items.length > 0) setDsId(cur => (cur == null ? items[0].id : cur));
      })
      .catch(() => {});
  }, [currentWorkspace?.id]);

  useEffect(() => {
    tabsRef.current = tabs;
    try {
      const toSave = tabs.map(t => ({ ...t, results: [], activeResultId: undefined }));
      localStorage.setItem('sql_query_tabs', JSON.stringify(toSave));
    } catch {}
  }, [tabs]);

  useEffect(() => {
    localStorage.setItem('sql_query_active_tab', activeTabId);
  }, [activeTabId]);

  useEffect(() => {
    if (dsId) localStorage.setItem('sql_query_dsid', dsId);
  }, [dsId]);

  const activeTab = tabs.find(t => t.id === activeTabId);

  const switchTab = useCallback((toId: string) => {
    const curSql = editorRef.current?.getValue() ?? '';
    const target = tabsRef.current.find(t => t.id === toId);
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, sql: curSql } : t));
    activeTabIdRef.current = toId;
    setActiveTabId(toId);
    if (target && editorRef.current) {
      editorRef.current.setValue(target.sql);
      editorRef.current.focus();
    }
  }, [activeTabId]);

  const addTab = () => {
    const curSql = editorRef.current?.getValue() ?? '';
    const t = makeTab();
    setTabs(prev => [...prev.map(tab => tab.id === activeTabId ? { ...tab, sql: curSql } : tab), t]);
    setActiveTabId(t.id);
    activeTabIdRef.current = t.id;
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

    const dsName = dataSources.find(d => d.id === dsId)?.name ?? '';
    const recordHistory = (entry: { status: 'success' | 'error'; elapsed: number; rowCount?: number; errorMsg?: string }) => {
      axios.post('/api/query-history', {
        sql, dataSourceId: dsId, dataSourceName: dsName, ...entry,
      }).catch(() => {});
    };

    try {
      const res = await axios.post('/api/datasets/preview', { sql, dataSourceId: dsId });
      const elapsed = Date.now() - t0;
      const rows = res.data.data || [];
      setTabs(prev => prev.map(t => t.id !== activeTabId ? t : {
        ...t,
        results: t.results.map(r => r.id !== id ? r : {
          ...r, status: 'success' as const,
          columns: res.data.columns || [],
          rows,
          elapsed,
        }),
      }));
      recordHistory({ status: 'success', elapsed, rowCount: rows.length });
    } catch (err: any) {
      const errMsg = err.response?.data?.error || '查询失败';
      const elapsed = Date.now() - t0;
      message.error(errMsg);
      setTabs(prev => prev.map(t => t.id !== activeTabId ? t : {
        ...t,
        results: t.results.map(r => r.id !== id ? r : {
          ...r, status: 'error' as const,
          elapsed,
          error: errMsg,
        }),
      }));
      recordHistory({ status: 'error', elapsed, errorMsg: errMsg });
    }
  }, [dsId, activeTabId, dataSources]);

  useEffect(() => { activeTabIdRef.current = activeTabId; }, [activeTabId]);

  const handleMount: OnMount = (ed, monaco) => {
    editorRef.current = ed; monacoRef.current = monaco;
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, runQuery);
    const currentTab = tabsRef.current.find(t => t.id === activeTabIdRef.current);
    if (currentTab) ed.setValue(currentTab.sql);
    ed.focus();
  };

  const handleEditorChange = useCallback((value: string | undefined) => {
    const sql = value ?? '';
    setTabs(prev => prev.map(t => t.id === activeTabIdRef.current ? { ...t, sql } : t));
  }, []);

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
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* query tabs */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid #e8e8e8', flexShrink: 0, overflowX: 'auto' }}>
        {tabs.map(tab => (
          <div key={tab.id} onClick={() => tab.id !== activeTabId && switchTab(tab.id)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap', userSelect: 'none', borderBottom: tab.id === activeTabId ? '2px solid #165DFF' : '2px solid transparent', color: tab.id === activeTabId ? '#165DFF' : '#595959', marginBottom: -1, flexShrink: 0 }}>
            {tab.name}
            {tabs.length > 1 && <CloseOutlined style={{ fontSize: 10, color: '#bbb' }} onClick={e => closeTab(tab.id, e)} />}
          </div>
        ))}
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
        <Button icon={<HistoryOutlined />} onClick={() => { setHistoryOpen(true); fetchHistory(); }}>历史记录</Button>
        {active?.status === 'success' && <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>{active.rows.length} 行 · {active.elapsed} ms</Text>}
      </div>

      <div ref={containerRef} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {/* editor */}
        <div style={{ height: `${editorPct}%`, minHeight: 0, border: '1px solid #e8e8e8', borderRadius: 6, overflow: 'hidden' }}>
          <Editor defaultLanguage="sql" defaultValue={tabs.find(t => t.id === activeTabId)?.sql ?? SQL_PLACEHOLDER} onMount={handleMount} onChange={handleEditorChange}
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

      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>查询历史记录</span>
            {history.length > 0 && (
              <Popconfirm title="确认清空所有历史记录？" okText="清空" cancelText="取消"
                onConfirm={() => axios.delete('/api/query-history').then(() => setHistory([])).catch(() => message.error('清空失败'))}>
                <Button type="text" size="small" icon={<DeleteOutlined />} danger>清空</Button>
              </Popconfirm>
            )}
          </div>
        }
        open={historyOpen} onClose={() => setHistoryOpen(false)}
        width={480} bodyStyle={{ padding: 0 }}
      >
        <Spin spinning={historyLoading}>
          {history.length === 0 && !historyLoading ? (
            <Empty description="暂无历史记录" style={{ marginTop: 80 }} />
          ) : (
            <List
              dataSource={history}
              renderItem={entry => (
                <List.Item
                  style={{ padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid #f0f0f0' }}
                  onClick={() => {
                    editorRef.current?.setValue(entry.sql);
                    editorRef.current?.focus();
                    if (entry.dataSourceId) setDsId(entry.dataSourceId);
                    setHistoryOpen(false);
                  }}
                  actions={[
                    <Tooltip key="copy" title="复制 SQL">
                      <Button type="text" size="small" icon={<CopyOutlined />}
                        onClick={e => { e.stopPropagation(); navigator.clipboard.writeText(entry.sql).then(() => message.success('已复制')); }} />
                    </Tooltip>,
                  ]}
                >
                  <List.Item.Meta
                    title={
                      <Space size={6} wrap>
                        {entry.status === 'success'
                          ? <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 12 }} />
                          : <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 12 }} />}
                        <Text style={{ fontSize: 12, color: '#8c8c8c' }}>
                          {new Date(entry.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </Text>
                        <Tag style={{ fontSize: 10, padding: '0 4px', lineHeight: '16px' }}>{entry.dataSourceName}</Tag>
                        {entry.status === 'success' && entry.elapsed != null && (
                          <Text style={{ fontSize: 11, color: '#aaa' }}>{entry.rowCount} 行 · {entry.elapsed} ms</Text>
                        )}
                      </Space>
                    }
                    description={
                      <pre style={{ margin: 0, fontSize: 12, color: entry.status === 'error' ? '#ff4d4f' : '#262626', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 72, overflow: 'hidden', fontFamily: 'monospace' }}>
                        {entry.sql.length > 200 ? entry.sql.slice(0, 200) + '…' : entry.sql}
                      </pre>
                    }
                  />
                </List.Item>
              )}
            />
          )}
        </Spin>
      </Drawer>
    </div>
  );
}
