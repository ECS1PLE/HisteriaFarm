import type { Activity } from '../../types'
export default function NotificationList({ events }: { events: Activity[] }) {
  return (
    <div className="notification-content">
      {events.slice(0, 3).map((e) => (
        <div key={e.id}>
          <strong>{e.title}</strong>
          <small>{e.detail}</small>
        </div>
      ))}
    </div>
  )
}
