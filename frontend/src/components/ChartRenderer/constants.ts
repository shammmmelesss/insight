// G2 图表默认配色（左轴/主系列）
export const G2_COLORS = ['#1783FF', '#00C9C9', '#F0884D', '#D580FF', '#7863FF', '#60C42D', '#BD8F24', '#FF80CA', '#2491B3', '#17C76F'];
// 双轴图右轴（折线）配色
export const ORANGE_COLORS = ['#FA8C16', '#F5222D', '#FADB14', '#52C41A', '#722ED1', '#13C2C2'];
// 折线/双轴图自定义图例占用的高度
export const LINE_LEGEND_HEIGHT = 36;

// 缩放轴（slider）统一配置：
// handleIconSize 比默认略大，保证两个手柄重合时仍能点中，同时不至于太笨重。
export const SLIDER_CONFIG = {
  values: [0, 1] as [number, number],
  style: {
    trackSize: 6,
    handleIconSize: 6,
  },
  showLabelOnInteraction: true,
};
