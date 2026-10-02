import type { ReactNode } from 'react'
import Badge from './Badge'
interface Props {
  label: string
  icon: ReactNode
  active?: boolean
  count?: number
  onClick: () => void
}
export default function NavItem({
  label,
  icon,
  active = false,
  count,
  onClick,
}: Props) {
  return (
    <button
      type="button"
      className={`nav-item ${active ? 'active' : ''}`}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
      {count !== undefined && <Badge variant="nav">{count}</Badge>}
    </button>
  )
}
