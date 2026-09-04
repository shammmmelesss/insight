import React, { useState, useRef, useCallback, useMemo } from 'react';

interface PortalApp {
  id?: string;
  name: string;
  introduction: string;
  homePage: string;
  iconUrl: string;
  categories: Array<{
    name: string;
    secondary?: { name: string };
  }>;
}

interface NavItem {
  type: string;
  application?: { id: string; name: string; homepage: string };
}

// 走后端同源代理，避免浏览器直连第三方域名触发 CORS / 私有网络访问(PNA)拦截；
// 后端会把当前请求的 Cookie 转发给 work.learnings.ai 完成鉴权。
const PORTAL_API = '/api/portal';

function extractAppList(data: any): PortalApp[] {
  if (!data) return [];
  const d = data.data;
  if (Array.isArray(d?.data?.list)) return d.data.list;
  if (Array.isArray(d?.list)) return d.list;
  if (Array.isArray(d?.records)) return d.records;
  if (Array.isArray(d?.data)) return d.data;
  if (Array.isArray(d)) return d;
  return [];
}


const AppCard: React.FC<{ app: PortalApp }> = ({ app }) => (
  <a
    href={app.homePage}
    target="_blank"
    rel="noopener noreferrer"
    style={{
      textDecoration: 'none',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '6px 12px',
      borderRadius: 6,
      transition: 'background 0.12s',
    }}
    onMouseEnter={e => (e.currentTarget.style.background = '#f5f5f7')}
    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
  >
    {app.iconUrl && (
      <img
        src={app.iconUrl}
        alt=""
        style={{ width: 28, height: 28, borderRadius: 6, flexShrink: 0, marginTop: 1, objectFit: 'contain' }}
        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    )}
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#111', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: '18px' }}>
        {app.name}
      </div>
      <div style={{
        fontSize: 11, color: '#888', marginTop: 2,
        display: '-webkit-box',
        WebkitLineClamp: 1,
        WebkitBoxOrient: 'vertical' as const,
        overflow: 'hidden',
        lineHeight: '15px',
      }}>
        {app.introduction}
      </div>
    </div>
  </a>
);

const PortalSidebar: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [apps, setApps] = useState<PortalApp[]>([]);
  const [myApps, setMyApps] = useState<PortalApp[]>([]);
  const [searchVal, setSearchVal] = useState('');
  const [searchResults, setSearchResults] = useState<PortalApp[] | null>(null);
  const [loading, setLoading] = useState(false);

  const cachedApps = useRef<PortalApp[] | null>(null);
  const cachedMyApps = useRef<PortalApp[] | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async () => {
    if (cachedApps.current) {
      setApps(cachedApps.current);
      setMyApps(cachedMyApps.current ?? []);
      return;
    }
    setLoading(true);
    try {
      const [navRes, appsRes] = await Promise.allSettled([
        fetch(`${PORTAL_API}/navigation`, { credentials: 'include' }).then(r => r.json()),
        fetch(`${PORTAL_API}/applications/search`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ page: 1, per: 1000, name: '', categoryIds: [] }),
        }).then(r => r.json()),
      ]);

      const appList = appsRes.status === 'fulfilled' ? extractAppList(appsRes.value) : [];
      cachedApps.current = appList;
      setApps(appList);

      const appById = new Map(appList.filter(a => a.id).map(a => [a.id!, a]));
      const appByName = new Map(appList.map(a => [a.name, a]));
      const navItems: NavItem[] =
        navRes.status === 'fulfilled' ? (navRes.value?.data?.items ?? []) : [];
      const myList = navItems
        .filter(item => item.type === 'APPLICATION' && item.application)
        .map(item => {
          const app = item.application!;
          return (
            appById.get(app.id) ??
            appByName.get(app.name) ?? {
              id: app.id, name: app.name, introduction: '', homePage: app.homepage, iconUrl: '', categories: [],
            }
          );
        });
      cachedMyApps.current = myList;
      setMyApps(myList);
    } catch {
      // leave empty on error
    } finally {
      setLoading(false);
    }
  }, []);

  const openSidebar = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpen(true);
    fetchData();
  }, [fetchData]);

  const scheduleClose = useCallback(() => {
    closeTimer.current = setTimeout(() => {
      setOpen(false);
      setSearchVal('');
      setSearchResults(null);
    }, 250);
  }, []);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
  }, []);

  const closeSidebar = useCallback(() => {
    setOpen(false);
    setSearchVal('');
    setSearchResults(null);
  }, []);

  const handleSearch = useCallback((val: string) => {
    setSearchVal(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      if (!val.trim()) {
        setSearchResults(null);
        return;
      }
      try {
        const res = await fetch(`${PORTAL_API}/applications/search`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ page: 1, per: 1000, name: val }),
        }).then(r => r.json());
        setSearchResults(extractAppList(res));
      } catch {
        setSearchResults([]);
      }
    }, 300);
  }, []);

  // Group by primary → secondary
  const grouped = useMemo(() => {
    const primaryMap = new Map<string, Map<string, PortalApp[]>>();
    apps.forEach(app => {
      const primary = app.categories?.[0]?.name || '其他';
      const secondary = app.categories?.[0]?.secondary?.name || '';
      if (!primaryMap.has(primary)) primaryMap.set(primary, new Map());
      const secMap = primaryMap.get(primary)!;
      if (!secMap.has(secondary)) secMap.set(secondary, []);
      secMap.get(secondary)!.push(app);
    });
    return primaryMap;
  }, [apps]);

  return (
    <>
      {/* Hamburger trigger */}
      <div
        style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '0 10px', marginRight: 4 }}
        onMouseEnter={openSidebar}
        onMouseLeave={scheduleClose}
        title="产品与服务"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ width: 18, height: 2, background: '#555', borderRadius: 1 }} />
          ))}
        </div>
      </div>

      {/* Overlay */}
      {open && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,.18)',
            zIndex: 999,
          }}
          onClick={closeSidebar}
        />
      )}

      {/* Drawer */}
      <div
        style={{
          position: 'fixed', top: 0, left: 0, bottom: 0,
          width: '33.333vw', minWidth: 320,
          background: '#fff',
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          transition: 'transform 0.22s cubic-bezier(0.4,0,0.2,1)',
          zIndex: 1000,
          display: 'flex', flexDirection: 'column',
          boxShadow: '4px 0 24px rgba(0,0,0,.12)',
        }}
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
      >
        {/* Header — matches app header height */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          height: 'var(--header-height)', padding: '0 20px',
          borderBottom: '1px solid var(--border-secondary)',
          flexShrink: 0,
        }}>
          <span style={{ fontWeight: 700, fontSize: 15, color: '#111' }}>arsenal · 产品与服务</span>
          <button
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#666', lineHeight: 1, padding: 4 }}
            onClick={closeSidebar}
          >
            ✕
          </button>
        </div>

        {/* Top nav */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '10px 20px',
          borderBottom: '1px solid var(--border-secondary)',
          flexShrink: 0,
        }}>
          <a
            href="https://arsenal.learnings.ai/#/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: 13, color: '#111', textDecoration: 'none', whiteSpace: 'nowrap', fontWeight: 500 }}
          >
            🏠 门户主页
          </a>
          <input
            placeholder="搜索应用"
            value={searchVal}
            onChange={e => handleSearch(e.target.value)}
            style={{
              flex: 1, padding: '5px 10px',
              border: '1px solid #e0e0e0', borderRadius: 6,
              fontSize: 13, outline: 'none',
              transition: 'border-color 0.15s',
            }}
            onFocus={e => (e.target.style.borderColor = '#6366f1')}
            onBlur={e => (e.target.style.borderColor = '#e0e0e0')}
          />
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 16px' }}>
          {loading && (
            <div style={{ padding: 24, textAlign: 'center', color: '#999', fontSize: 13 }}>加载中...</div>
          )}

          {/* 我的收藏 */}
          {!loading && searchResults === null && myApps.length > 0 && (
            <div style={{ borderBottom: '1px solid var(--border-secondary)', paddingBottom: 8, marginBottom: 4 }}>
              <div style={{ padding: '10px 12px 2px', fontSize: 15, fontWeight: 700, color: '#111' }}>
                我的收藏
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, alignItems: 'start' }}>
                {myApps.map((app, i) => <AppCard key={i} app={app} />)}
              </div>
            </div>
          )}

          {/* Search results — flat grid */}
          {!loading && searchResults !== null && (
            <>
              <div style={{ padding: '10px 12px 6px', fontSize: 12, color: '#888' }}>
                找到 {searchResults.length} 个应用
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, alignItems: 'start' }}>
                {searchResults.map((app, i) => <AppCard key={i} app={app} />)}
              </div>
              {searchResults.length === 0 && (
                <div style={{ padding: '20px 12px', color: '#bbb', fontSize: 13 }}>暂无相关应用</div>
              )}
            </>
          )}

          {/* Category view */}
          {!loading && searchResults === null && Array.from(grouped.entries()).map(([primary, secMap], pi) => (
            <div key={primary}>
              <div style={{
                padding: '10px 12px 2px',
                fontSize: 15, fontWeight: 700, color: '#111',
                borderTop: pi === 0 ? 'none' : '1px solid var(--border-secondary)',
                marginTop: pi === 0 ? 6 : 0,
              }}>
                {primary}
              </div>
              {Array.from(secMap.entries()).filter(([, appList]) => appList.length > 0).map(([secondary, appList]) => (
                <div key={secondary}>
                  {secondary && (
                    <div style={{
                      padding: '6px 12px 4px',
                      fontSize: 11, fontWeight: 600, color: '#bbb',
                      textTransform: 'uppercase', letterSpacing: '0.5px',
                    }}>
                      {secondary}
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 2, alignItems: 'start' }}>
                    {appList.map((app, i) => <AppCard key={i} app={app} />)}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default PortalSidebar;
