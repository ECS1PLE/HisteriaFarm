import { Button, EmptyState, Panel, PanelHeading } from '../UI'
import ActivityItem from './ActivityItem'
import type { Activity } from '../../types'
interface Props {
  events: Activity[]
  full?: boolean
  onViewAll?: () => void
}
export default function ActivityView({
  events,
  full = false,
  onViewAll,
}: Props) {
  return (
    <Panel className={`activity-panel ${full ? 'full' : ''}`}>
      <PanelHeading
        title="Последние события"
        action={
          !full && (
            <Button type="text" size="small" onClick={onViewAll}>
              Весь журнал ↗
            </Button>
          )
        }
      />
      <div className="activity-list">
        {!events.length && <EmptyState description="Событий пока нет" />}
        {(full ? events : events.slice(0, 3)).map((event) => (
          <ActivityItem key={event.id} event={event} />
        ))}
      </div>
    </Panel>
  )
}
