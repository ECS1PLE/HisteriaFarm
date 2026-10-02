import type { ReactNode } from 'react'
interface Props {
  label: string
  icon: ReactNode
  value: ReactNode
  suffix?: ReactNode
  footer: ReactNode
  highlighted?: boolean
  progress?: number
}
export default function StatCard({
  label,
  icon,
  value,
  suffix,
  footer,
  highlighted = false,
  progress,
}: Props) {
  return (
    <div className={`stat-card${highlighted ? ' stat-highlight' : ''}`}>
      <div className="stat-top">
        <span>{label}</span>
        {icon}
      </div>
      <div className="stat-value">
        {value}
        {suffix}
      </div>
      <div className="stat-footer">{footer}</div>
      {progress !== undefined && (
        <div className="stat-track">
          <span style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  )
}
