import type { ThemeConfig } from 'antd';

/**
 * Insight 设计系统 —— 现代化专业 BI 风格
 * 集中管理全局设计令牌，所有页面共享同一套视觉语言。
 */
export const designTokens = {
  // 品牌色（现代专业蓝，替代原 #165DFF）
  colorPrimary: '#2563EB',
  colorPrimaryHover: '#1D4ED8',
  colorPrimaryActive: '#1E40AF',
  colorPrimaryBg: '#EFF6FF',

  // 语义色
  colorSuccess: '#16A34A',
  colorWarning: '#D97706',
  colorError: '#DC2626',

  // 中性色
  colorBgLayout: '#F3F5F9',
  colorBgContainer: '#FFFFFF',
  colorBgElevated: '#FFFFFF',
  colorBorder: '#E6E8ED',
  colorBorderSecondary: '#EFF1F4',
  colorText: '#1F2937',
  colorTextSecondary: '#6B7280',
  colorTextTertiary: '#9CA3AF',

  // 圆角
  borderRadius: 10,
  borderRadiusSM: 6,
  borderRadiusLG: 14,

  // 阴影
  boxShadowCard:
    '0 1px 2px rgba(15, 23, 42, 0.04), 0 1px 3px rgba(15, 23, 42, 0.05)',
  boxShadowHover:
    '0 2px 4px rgba(15, 23, 42, 0.05), 0 8px 24px rgba(15, 23, 42, 0.08)',
  boxShadowModal:
    '0 8px 24px rgba(15, 23, 42, 0.12), 0 24px 64px rgba(15, 23, 42, 0.16)',

  // 侧边栏（深色）
  sidebarBg: '#0F172A',
  sidebarBgActive: '#1E293B',
  sidebarItemActive: '#2563EB',
  sidebarText: '#94A3B8',
  sidebarTextActive: '#F8FAFC',
  sidebarBorder: 'rgba(148, 163, 184, 0.14)',
} as const;

export const themeConfig: ThemeConfig = {
  token: {
    colorPrimary: designTokens.colorPrimary,
    colorInfo: designTokens.colorPrimary,
    colorSuccess: designTokens.colorSuccess,
    colorWarning: designTokens.colorWarning,
    colorError: designTokens.colorError,
    colorLink: designTokens.colorPrimary,

    colorBgLayout: designTokens.colorBgLayout,
    colorBgContainer: designTokens.colorBgContainer,
    colorBgElevated: designTokens.colorBgElevated,
    colorBorder: designTokens.colorBorder,
    colorBorderSecondary: designTokens.colorBorderSecondary,

    colorText: designTokens.colorText,
    colorTextSecondary: designTokens.colorTextSecondary,
    colorTextTertiary: designTokens.colorTextTertiary,

    borderRadius: designTokens.borderRadius,
    borderRadiusSM: designTokens.borderRadiusSM,
    borderRadiusLG: designTokens.borderRadiusLG,

    controlHeight: 32,
    controlHeightSM: 24,
    controlHeightLG: 40,
    controlOutlineWidth: 1,

    fontSize: 14,
    fontSizeHeading1: 26,
    fontSizeHeading2: 22,
    fontSizeHeading3: 18,
    fontSizeHeading4: 16,
    fontSizeHeading5: 14,

    boxShadow: designTokens.boxShadowCard,
    boxShadowSecondary: designTokens.boxShadowHover,

    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Helvetica Neue', sans-serif",
  },
  components: {
    Layout: {
      siderBg: designTokens.sidebarBg,
      headerBg: '#FFFFFF',
      headerHeight: 60,
      headerPadding: '0 20px',
      bodyBg: designTokens.colorBgLayout,
      triggerBg: designTokens.sidebarBgActive,
    },
    Menu: {
      itemHeight: 42,
      itemBorderRadius: 8,
      itemMarginInline: 10,
      itemColor: designTokens.sidebarText,
      itemSelectedColor: designTokens.sidebarTextActive,
      itemSelectedBg: 'rgba(37, 99, 235, 0.22)',
      itemHoverBg: 'rgba(148, 163, 184, 0.1)',
      itemHoverColor: designTokens.sidebarTextActive,
      groupTitleColor: designTokens.sidebarText,
      darkItemBg: 'transparent',
      darkSubMenuItemBg: 'transparent',
      darkItemColor: designTokens.sidebarText,
      darkItemHoverBg: 'rgba(148, 163, 184, 0.1)',
      darkItemHoverColor: designTokens.sidebarTextActive,
      darkItemSelectedBg: 'rgba(37, 99, 235, 0.22)',
      darkItemSelectedColor: designTokens.sidebarTextActive,
      darkGroupTitleColor: 'rgba(148, 163, 184, 0.7)',
      horizontalItemSelectedColor: designTokens.colorPrimary,
      horizontalItemHoverColor: designTokens.colorPrimary,
      activeBarBorderWidth: 0,
    },
    Card: {
      headerBg: '#FFFFFF',
      headerFontSize: 15,
      headerFontSizeSM: 15,
      paddingLG: 20,
      paddingMD: 16,
      borderRadiusLG: designTokens.borderRadiusLG,
    },
    Table: {
      headerBg: '#F8FAFC',
      headerColor: designTokens.colorTextSecondary,
      headerSplitColor: 'transparent',
      borderColor: designTokens.colorBorderSecondary,
      rowHoverBg: '#F6F8FB',
      cellPaddingBlock: 12,
      cellPaddingInline: 12,
      headerBorderRadius: 8,
    },
    Button: {
      primaryShadow: '0 1px 2px rgba(37, 99, 235, 0.4)',
      defaultShadow: 'none',
      contentFontSizeLG: 15,
      borderRadius: 8,
    },
    Modal: {
      titleFontSize: 16,
      headerBg: '#FFFFFF',
      contentBg: '#FFFFFF',
      paddingContentHorizontal: 24,
      paddingContentVertical: 20,
    },
    Drawer: {
      paddingLG: 20,
    },
    Tabs: {
      itemSelectedColor: designTokens.colorPrimary,
      itemHoverColor: designTokens.colorPrimaryHover,
      inkBarColor: designTokens.colorPrimary,
    },
    Segmented: {
      trackBg: '#EDF0F4',
      itemSelectedBg: '#FFFFFF',
      itemSelectedColor: designTokens.colorText,
      itemColor: designTokens.colorTextSecondary,
      borderRadius: 8,
    },
    Dropdown: {
      borderRadiusLG: 10,
    },
    Tooltip: {
      colorBgSpotlight: '#1E293B',
      borderRadius: 6,
    },
    Tag: {
      borderRadiusSM: 6,
    },
    Input: {
      activeShadow: '0 0 0 3px rgba(37, 99, 235, 0.12)',
      hoverBg: '#FFFFFF',
    },
    InputNumber: {
      activeShadow: '0 0 0 3px rgba(37, 99, 235, 0.12)',
    },
    Select: {
      optionSelectedBg: '#EFF6FF',
      activeOutlineColor: 'rgba(37, 99, 235, 0.2)',
    },
    DatePicker: {
      activeBorderColor: designTokens.colorPrimary,
      activeShadow: '0 0 0 3px rgba(37, 99, 235, 0.12)',
    },
    Tree: {
      directoryNodeSelectedBg: '#EFF6FF',
      nodeSelectedBg: '#EFF6FF',
    },
    Empty: {
      lineHeight: 28,
    },
    Statistic: {
      titleFontSize: 13,
      contentFontSize: 24,
    },
    List: {
      itemPaddingLG: '12px 0',
    },
  },
};

export default themeConfig;