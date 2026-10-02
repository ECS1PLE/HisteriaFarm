import { App as AntApp, ConfigProvider } from 'antd'
import ruRU from 'antd/locale/ru_RU'
import type { ReactNode } from 'react'
import { appTheme } from '../config/theme'
export default function AppProvider({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider locale={ruRU} theme={appTheme}>
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  )
}
