import { S2Options, PivotSheet, S2Event } from '@antv/s2';
import type { RenderContext } from './context';

// 渲染交叉表
export const renderCrossTable = (ctx: RenderContext) => {
  const {
    container, chartData, rowFields, colFields, measureFields, containerHeight,
    getFieldLabel, formatValue, getActualFields, buildFormatLookup,
    crossTableSortParamsRef, chartInstanceRef,
  } = ctx;
  if (chartData.length === 0) return;

  // 获取数据中的实际字段名
  const dataFields = chartData.length > 0 ? Object.keys(chartData[0]) : [];

  // 处理度量字段，使用数据中的实际字段名（可能是聚合后的字段名）
  const actualMeasureFields = getActualFields(measureFields, dataFields);

  const measureFormatLookup = buildFormatLookup(measureFields, dataFields);
  const s2DataConfig = {
    fields: {
      rows: rowFields,
      columns: colFields,
      values: actualMeasureFields,
    },
    meta: [
      ...rowFields.map(field => ({ field, name: getFieldLabel(field) })),
      ...colFields.map(field => ({ field, name: getFieldLabel(field) })),
      ...actualMeasureFields.map(field => ({
        field,
        name: getFieldLabel(field),
        formatter: (v: any) => formatValue(v, measureFormatLookup[field]),
      })),
    ],
    data: chartData,
    sortParams: crossTableSortParamsRef.current,
  };

  const detectedHeight = containerHeight || container.clientHeight;
  const crossTableHeight = detectedHeight > 80 ? detectedHeight : 300;
  container.style.height = `${crossTableHeight}px`;
  container.style.overflow = 'hidden';

  const s2Options: S2Options = {
    width: container.clientWidth,
    height: crossTableHeight,
    interaction: {
      hoverHighlight: true,
    },
    seriesNumber: { enable: false },
    tooltip: {
      enable: true,
      render: (_s2Inst: any): any => ({
        show(opts: any) {
          const operator = opts?.options?.operator;
          if (!operator?.menu?.items?.length) return;
          // 移除旧菜单
          document.querySelectorAll('.s2-sort-menu').forEach(el => el.remove());
          const menu = document.createElement('div');
          menu.className = 's2-sort-menu';
          Object.assign(menu.style, {
            position: 'fixed', zIndex: '9999', background: '#fff',
            boxShadow: '0 2px 8px rgba(0,0,0,.15)', borderRadius: '6px',
            padding: '4px 0', minWidth: '100px',
            left: `${opts.position.x}px`, top: `${opts.position.y}px`,
          });
          operator.menu.items.forEach((item: any) => {
            const row = document.createElement('div');
            row.textContent = item.label;
            Object.assign(row.style, {
              padding: '7px 16px', cursor: 'pointer', fontSize: '14px', color: '#000',
            });
            row.onmouseenter = () => { row.style.background = '#F6F8FB'; };
            row.onmouseleave = () => { row.style.background = ''; };
            row.onclick = () => {
              operator.menu.onClick({ key: item.key });
              menu.remove();
            };
            menu.appendChild(row);
          });
          document.body.appendChild(menu);
          // 点击外部关闭
          const close = (e: MouseEvent) => {
            if (!menu.contains(e.target as Node)) { menu.remove(); document.removeEventListener('click', close, true); }
          };
          setTimeout(() => document.addEventListener('click', close, true), 0);
        },
        hide() { document.querySelectorAll('.s2-sort-menu').forEach(el => el.remove()); },
        destroy() { document.querySelectorAll('.s2-sort-menu').forEach(el => el.remove()); },
      }),
    },
    headerActionIcons: [
      {
        icons: ['SortDown'],
        belongsCell: 'colCell',
        defaultHide: true,
        displayCondition: (meta: any) => !meta.isTotals,
        onClick: ({ event, meta }: any) => {
          s2Instance.handleGroupSort(event, meta);
        },
      },
      {
        icons: ['SortDown'],
        belongsCell: 'rowCell',
        defaultHide: true,
        displayCondition: (meta: any) => !meta.isTotals,
        onClick: ({ event, meta }: any) => {
          s2Instance.handleGroupSort(event, meta);
        },
      },
    ],
  };

  let s2Instance: PivotSheet;
  const s2 = new PivotSheet(container, s2DataConfig, s2Options);
  s2Instance = s2;
  s2.on(S2Event.RANGE_SORT, (params) => {
    crossTableSortParamsRef.current = params;
    s2.setDataCfg({ ...s2DataConfig, sortParams: params });
    s2.render(false);
  });
  chartInstanceRef.current = s2;
  s2.render();
};
