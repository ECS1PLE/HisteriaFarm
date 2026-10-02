import {
  AppstoreOutlined,
  CommentOutlined,
  FileTextOutlined,
  HeartOutlined,
  HistoryOutlined,
  LinkOutlined,
  SettingOutlined,
  UnorderedListOutlined,
  UserAddOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { NavGroup, NavItem } from '../UI'
import SidebarBrand from './SidebarBrand'
import WorkspaceIdentity from './WorkspaceIdentity'
import SidebarPromo from './SidebarPromo'
import UserProfile from './UserProfile'
import type { ConfigSection, Mode, Page } from '../../types'
interface Props {
  page: Page
  mode: Mode
  accountCount: number
  runningCount: number
  onPage: (page: Page) => void
  onConfigure: (section: ConfigSection, mode?: Mode) => void
  onSettings: () => void
  onClose: () => void
  mobileOpen: boolean
}
export default function Sidebar({
  page,
  mode,
  accountCount,
  runningCount,
  onPage,
  onConfigure,
  onSettings,
  onClose,
  mobileOpen,
}: Props) {
  const navigate = (action: () => void) => {
    action()
    onClose()
  }
  const pages = [
    {
      value: 'accounts' as const,
      label: 'Аккаунты',
      icon: UserOutlined,
      count: accountCount,
    },
    {
      value: 'tasks' as const,
      label: 'Задачи',
      icon: UnorderedListOutlined,
      count: runningCount || undefined,
    },
    {
      value: 'activity' as const,
      label: 'Журнал событий',
      icon: HistoryOutlined,
    },
  ]
  const modes = [
    { value: 'comments' as const, label: 'Комментарии', icon: CommentOutlined },
    { value: 'reactions' as const, label: 'Реакции', icon: HeartOutlined },
    {
      value: 'subscriptions' as const,
      label: 'Подписки',
      icon: UserAddOutlined,
    },
    { value: 'scenario' as const, label: 'Сценарии', icon: AppstoreOutlined },
  ]
  const configuration = [
    {
      value: 'text' as const,
      label: 'Тексты комментариев',
      icon: FileTextOutlined,
    },
    { value: 'targets' as const, label: 'Каналы и чаты', icon: LinkOutlined },
  ]
  return (
    <>
      {mobileOpen && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Закрыть меню"
          onClick={onClose}
        />
      )}
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <SidebarBrand onClick={() => navigate(() => onPage('accounts'))} />
        <WorkspaceIdentity />
        <nav aria-label="Основная навигация">
          <NavGroup label="УПРАВЛЕНИЕ">
            {pages.map(({ value, label, icon: Icon, count }) => (
              <NavItem
                key={value}
                label={label}
                icon={<Icon aria-hidden="true" />}
                active={page === value}
                count={count}
                onClick={() => navigate(() => onPage(value))}
              />
            ))}
          </NavGroup>
          <NavGroup label="РЕЖИМЫ РАБОТЫ" spaced>
            {modes.map(({ value, label, icon: Icon }) => (
              <NavItem
                key={value}
                label={label}
                icon={<Icon aria-hidden="true" />}
                active={mode === value}
                onClick={() => navigate(() => onConfigure('mode', value))}
              />
            ))}
          </NavGroup>
          <NavGroup label="КОНФИГУРАЦИЯ" spaced>
            {configuration.map(({ value, label, icon: Icon }) => (
              <NavItem
                key={value}
                label={label}
                icon={<Icon aria-hidden="true" />}
                onClick={() => navigate(() => onConfigure(value))}
              />
            ))}
          </NavGroup>
        </nav>
        <div className="sidebar-bottom">
          <SidebarPromo />
          <NavItem
            label="Настройки"
            icon={<SettingOutlined aria-hidden="true" />}
            onClick={() => navigate(onSettings)}
          />
          <UserProfile
            name="ECS1PLE"
            description="Владелец пространства"
            initial="E"
          />
        </div>
      </aside>
    </>
  )
}
