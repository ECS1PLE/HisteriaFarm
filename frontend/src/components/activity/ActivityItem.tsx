import {
  CheckOutlined,
  ClockCircleOutlined,
  ExclamationOutlined,
} from '@ant-design/icons'
import { EventItem } from '../UI'
import type { Activity } from '../../types'
const icons = {
  success: CheckOutlined,
  warning: ExclamationOutlined,
  info: ClockCircleOutlined,
}
export default function ActivityItem({ event }: { event: Activity }) {
  const Icon = icons[event.type]
  return (
    <EventItem
      title={event.title}
      description={event.detail}
      time={event.time}
      tone={event.type}
      icon={<Icon aria-hidden="true" />}
    />
  )
}
