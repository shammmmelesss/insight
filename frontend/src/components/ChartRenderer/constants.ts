// G2 图表默认配色（左轴/主系列）—— 现代专业 BI 色板，首色与品牌主色一致
export const G2_COLORS = ['#2563EB', '#10B981', '#F97316', '#8B5CF6', '#06B6D4', '#EF4444', '#F59E0B', '#EC4899', '#0891B2', '#84CC16'];
// 双轴图右轴（折线）配色
export const ORANGE_COLORS = ['#F97316', '#EF4444', '#F59E0B', '#10B981', '#8B5CF6', '#06B6D4'];
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
