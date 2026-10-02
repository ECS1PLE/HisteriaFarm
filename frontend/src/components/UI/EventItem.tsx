import type { ReactNode } from 'react'
interface Props {
  title: string
  description: string
  time: string
  icon: ReactNode
  tone: string
}
export default function EventItem({
  title,
  description,
  time,
  icon,
  tone,
}: Props) {
  return (
    <div className="activity-item">
      <span className={`event-icon event-${tone}`}>{icon}</span>
      <div>
        <strong>{title}</strong>
        <small>{description}</small>
      </div>
      <time>{time}</time>
    </div>
  )
}
