import {
  CheckOutlined,
  ClockCircleOutlined,
  ExclamationOutlined,
} from '@ant-design/icons'
import { Button, Empty } from 'antd'
import type { Activity } from '../types'
export default function ActivityView({
  events,
  full = false,
  onViewAll,
}: {
  events: Activity[]
  full?: boolean
  onViewAll?: () => void
}) {
  return (
    <section className={`panel activity-panel ${full ? 'full' : ''}`}>
      <div className="panel-heading">
        <h2>Последние события</h2>
        {!full && (
          <Button type="text" size="small" onClick={onViewAll}>
            Весь журнал ↗
          </Button>
        )}
      </div>
      <div className="activity-list">
        {!events.length && (
          <Empty
            description="Событий пока нет"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        )}
        {(full ? events : events.slice(0, 3)).map((e) => (
          <div className="activity-item" key={e.id}>
            <span className={`event-icon event-${e.type}`}>
              {e.type === 'success' ? (
                <CheckOutlined aria-hidden="true" />
              ) : e.type === 'warning' ? (
                <ExclamationOutlined aria-hidden="true" />
              ) : (
                <ClockCircleOutlined aria-hidden="true" />
              )}
            </span>
            <div>
              <strong>{e.title}</strong>
              <small>{e.detail}</small>
            </div>
            <time>{e.time}</time>
          </div>
        ))}
      </div>
    </section>
  )
}
