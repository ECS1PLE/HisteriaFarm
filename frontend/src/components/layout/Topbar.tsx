import { Badge as AntBadge, Popover } from 'antd'
import { BellOutlined, MenuOutlined } from '@ant-design/icons'
import { Avatar, ConnectionDot, IconButton } from '../UI'
import NotificationList from './NotificationList'
import type { Activity } from '../../types'
interface Props {
  connected: boolean
  title: string
  events: Activity[]
  hasNotifications: boolean
  onOpenMenu: () => void
}
export default function Topbar({
  title,
  connected,
  events,
  hasNotifications,
  onOpenMenu,
}: Props) {
  return (
    <header className="topbar">
      <div className="breadcrumb">
        <IconButton
          className="mobile-menu"
          type="text"
          icon={<MenuOutlined aria-hidden="true" />}
          label="Открыть меню"
          onClick={onOpenMenu}
        />
        <span>Рабочее пространство</span>
        <span className="breadcrumb-slash">/</span>
        <strong>{title}</strong>
      </div>
      <div className="topbar-actions">
        <span className="demo-indicator">
          <ConnectionDot tone={connected ? 'default' : 'muted'} />
          {connected ? 'Telegram настроен' : 'Настрой Telegram'}
        </span>
        <span className="topbar-divider" />
        <Popover
          trigger="click"
          placement="bottomRight"
          title="Уведомления"
          content={<NotificationList events={events} />}
        >
          <AntBadge dot={hasNotifications} color="#a9e879">
            <IconButton
              type="text"
              icon={<BellOutlined aria-hidden="true" />}
              label="Уведомления"
            />
          </AntBadge>
        </Popover>
        <Avatar size={30} className="topbar-avatar">
          E
        </Avatar>
      </div>
    </header>
  )
}
