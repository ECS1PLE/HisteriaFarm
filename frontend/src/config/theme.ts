import { theme } from 'antd'
import type { ThemeConfig } from 'antd'
export const appTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: '#a9e879',
    colorInfo: '#91b9e8',
    colorSuccess: '#a9e879',
    colorWarning: '#d8ae70',
    colorError: '#e38a8a',
    colorBgBase: '#0e1314',
    colorBgContainer: '#151d1e',
    colorBgElevated: '#1b2526',
    colorBorder: '#334241',
    colorBorderSecondary: '#263332',
    colorText: '#e7e9e5',
    colorTextSecondary: '#9ba39a',
    colorTextTertiary: '#778176',
    colorTextPlaceholder: '#75816f',
    fontFamily:
      'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
    fontSize: 13,
    borderRadius: 10,
    controlHeight: 38,
  },
  components: {
    Button: {
      primaryColor: '#182410',
      fontWeight: 500,
      primaryShadow: '0 3px 16px #a9e87914',
    },
    Table: {
      headerBg: '#182223',
      headerColor: '#929b90',
      rowHoverBg: '#1c2b29',
      rowSelectedBg: '#24301e',
      rowSelectedHoverBg: '#2b3825',
      cellPaddingBlock: 13,
      cellPaddingInline: 16,
    },
    Drawer: { colorBgElevated: '#151d1e' },
    Input: { activeShadow: '0 0 0 2px #a9e87912' },
  },
}
