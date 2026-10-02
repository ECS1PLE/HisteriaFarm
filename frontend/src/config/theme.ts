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
    colorBgBase: '#101211',
    colorBgContainer: '#171a18',
    colorBgElevated: '#1b1f1c',
    colorBorder: '#30362f',
    colorBorderSecondary: '#272c27',
    colorText: '#e7e9e5',
    colorTextSecondary: '#9ba39a',
    colorTextTertiary: '#778176',
    colorTextPlaceholder: '#75816f',
    fontFamily:
      'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
    fontSize: 13,
    borderRadius: 7,
    controlHeight: 36,
  },
  components: {
    Button: {
      primaryColor: '#182410',
      fontWeight: 500,
      primaryShadow: 'none',
    },
    Table: {
      headerBg: '#1a1e1a',
      headerColor: '#929b90',
      rowHoverBg: '#1d231d',
      rowSelectedBg: '#24301e',
      rowSelectedHoverBg: '#2b3825',
      cellPaddingBlock: 13,
      cellPaddingInline: 16,
    },
    Drawer: { colorBgElevated: '#161a17' },
    Input: { activeShadow: '0 0 0 2px #a9e87912' },
  },
}
