import type { ReactNode } from 'react'
interface Props {
  label: string
  spaced?: boolean
  children: ReactNode
}
export default function NavGroup({ label, spaced = false, children }: Props) {
  return (
    <>
      <div className={`nav-label${spaced ? ' nav-label-spaced' : ''}`}>
        {label}
      </div>
      {children}
    </>
  )
}
