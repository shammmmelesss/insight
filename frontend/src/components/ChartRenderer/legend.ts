import type { RenderContext, SeriesItem } from './context';

// 折线/双轴图自定义图例（含反选与「仅显示此项」icon、横向滚动箭头）
export const renderCustomLegend = (ctx: RenderContext, series: SeriesItem[]) => {
  const { legendContainer, hiddenSeriesRef, rerender } = ctx;
  if (!legendContainer || series.length === 0) return;
  const allNames = series.map(s => s.name);
  const container = legendContainer;
  container.innerHTML = '';
  container.style.cssText = 'display:flex;align-items:center;gap:4px;padding:4px 0;min-height:28px;';

  // 可滚动内层列表
  const scrollWrap = document.createElement('div');
  scrollWrap.style.cssText = 'flex:1;overflow:hidden;min-width:0;';

  const list = document.createElement('div');
  list.style.cssText = 'display:flex;align-items:center;gap:12px;overflow-x:auto;padding:0 4px;scrollbar-width:none;';
  // 隐藏 webkit 滚动条
  const styleTag = document.createElement('style');
  styleTag.textContent = '.legend-list::-webkit-scrollbar{display:none}';
  list.classList.add('legend-list');
  document.head.appendChild(styleTag);

  const makeArrow = (dir: 'left' | 'right') => {
    const btn = document.createElement('button');
    btn.style.cssText = 'flex-shrink:0;display:none;align-items:center;justify-content:center;width:20px;height:20px;border:none;background:transparent;cursor:pointer;color:#8c8c8c;padding:0;transition:color 0.15s;';
    btn.addEventListener('mouseenter', () => { btn.style.color = '#1783FF'; });
    btn.addEventListener('mouseleave', () => { btn.style.color = '#8c8c8c'; });
    const d = dir === 'left'
      ? 'M8 10L5 7l3-3'
      : 'M4 4l3 3-3 3';
    btn.innerHTML = `<svg width="14" height="14" viewBox="0 0 12 12" fill="none"><path d="${d}" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
    return btn;
  };

  const leftBtn = makeArrow('left');
  const rightBtn = makeArrow('right');

  const SCROLL_STEP = 120;
  leftBtn.addEventListener('click', () => { list.scrollBy({ left: -SCROLL_STEP, behavior: 'smooth' }); });
  rightBtn.addEventListener('click', () => { list.scrollBy({ left: SCROLL_STEP, behavior: 'smooth' }); });

  const updateArrows = () => {
    const canScroll = list.scrollWidth > list.clientWidth + 2;
    leftBtn.style.display = canScroll ? 'inline-flex' : 'none';
    rightBtn.style.display = canScroll ? 'inline-flex' : 'none';
    leftBtn.style.opacity = list.scrollLeft > 2 ? '1' : '0.3';
    rightBtn.style.opacity = list.scrollLeft < list.scrollWidth - list.clientWidth - 2 ? '1' : '0.3';
  };

  list.addEventListener('scroll', updateArrows);

  series.forEach(({ name, color }) => {
    const isHidden = hiddenSeriesRef.current.has(name);
    const isSolo = !isHidden && hiddenSeriesRef.current.size > 0;

    const item = document.createElement('div');
    item.style.cssText = `display:inline-flex;align-items:center;gap:4px;cursor:pointer;opacity:${isHidden ? 0.35 : 1};user-select:none;transition:opacity 0.15s;flex-shrink:0;`;

    const dot = document.createElement('span');
    dot.style.cssText = `width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;`;

    const label = document.createElement('span');
    label.style.cssText = 'font-size:12px;color:#595959;white-space:nowrap;';
    label.textContent = name;

    const soloBtn = document.createElement('span');
    soloBtn.title = '仅显示此项';
    soloBtn.style.cssText = `display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;cursor:pointer;color:${isSolo ? '#1783FF' : '#bfbfbf'};transition:color 0.15s;flex-shrink:0;`;
    soloBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" stroke-width="1.5"/><circle cx="6" cy="6" r="2" fill="currentColor"/></svg>`;

    soloBtn.addEventListener('mouseenter', () => { soloBtn.style.color = '#1783FF'; });
    soloBtn.addEventListener('mouseleave', () => { soloBtn.style.color = (hiddenSeriesRef.current.size > 0 && !hiddenSeriesRef.current.has(name)) ? '#1783FF' : '#bfbfbf'; });

    soloBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const hidden = hiddenSeriesRef.current;
      if (hidden.size === allNames.length - 1 && !hidden.has(name)) {
        hiddenSeriesRef.current = new Set();
      } else {
        hiddenSeriesRef.current = new Set(allNames.filter(n => n !== name));
      }
      rerender();
    });

    item.addEventListener('click', () => {
      const hidden = hiddenSeriesRef.current;
      const newHidden = new Set(hidden);
      if (newHidden.has(name)) {
        newHidden.delete(name);
      } else {
        if (allNames.filter(n => !hidden.has(n)).length <= 1) return;
        newHidden.add(name);
      }
      hiddenSeriesRef.current = newHidden;
      rerender();
    });

    item.appendChild(dot);
    item.appendChild(label);
    item.appendChild(soloBtn);
    list.appendChild(item);
  });

  scrollWrap.appendChild(list);
  container.appendChild(leftBtn);
  container.appendChild(scrollWrap);
  container.appendChild(rightBtn);

  // 布局完成后再检查是否需要箭头
  requestAnimationFrame(updateArrows);
};
