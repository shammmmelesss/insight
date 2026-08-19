// 嵌入模式：被其它系统以 iframe 嵌入时，隐藏顶部导航、看板列表侧栏、门户侧边栏。
// 由嵌入方在 URL 上加 ?embed=1 开启（?embed=0 显式关闭）。
// 首次命中后写入 sessionStorage，保证 iframe 内跳转其它页面时仍保持嵌入态。
const EMBED_KEY = 'insight_embed';

export function isEmbedMode(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has('embed')) {
      const v = params.get('embed');
      const on = v === '' || v === '1' || v === 'true';
      if (on) {
        window.sessionStorage.setItem(EMBED_KEY, '1');
        return true;
      }
      window.sessionStorage.removeItem(EMBED_KEY);
      return false;
    }
    return window.sessionStorage.getItem(EMBED_KEY) === '1';
  } catch {
    return false;
  }
}
