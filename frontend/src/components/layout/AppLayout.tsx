import type { ReactNode } from 'react'
interface Props {
  sidebar: ReactNode
  topbar: ReactNode
  footer: ReactNode
  dialogs: ReactNode
  children: ReactNode
}
export default function AppLayout({
  sidebar,
  topbar,
  footer,
  dialogs,
  children,
}: Props) {
  return (
    <div className="app-shell">
      {sidebar}
      <div className="main-shell">
        {topbar}
        <main className="main-content">
          {children}
          {footer}
        </main>
      </div>
      {dialogs}
    </div>
  )
}
