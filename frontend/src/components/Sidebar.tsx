import {
  AppstoreOutlined,
  ArrowUpOutlined,
  CheckCircleOutlined,
  CommentOutlined,
  FileTextOutlined,
  HeartOutlined,
  HistoryOutlined,
  LinkOutlined,
  SettingOutlined,
  ThunderboltFilled,
  UnorderedListOutlined,
  UserAddOutlined,
  UserOutlined,
} from '@ant-design/icons'
import type { ReactNode } from 'react'
import type { Mode, Page } from '../types'
interface Props {
  page: Page
  mode: Mode
  accountCount: number
  runningCount: number
  onPage: (page: Page) => void
  onConfigure: (section: string, mode?: Mode) => void
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
  const item = (
    label: string,
    icon: ReactNode,
    action: () => void,
    active = false,
    count?: number,
  ) => (
    <button
      className={`nav-item ${active ? 'active' : ''}`}
      onClick={() => {
        action()
        onClose()
      }}
    >
      {icon}
      <span>{label}</span>
      {count !== undefined && <span className="nav-count">{count}</span>}
    </button>
  )
  return (
    <>
      {mobileOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Закрыть меню"
          onClick={onClose}
        />
      )}
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault()
            onPage('accounts')
            onClose()
          }}
        >
          <span className="brand-icon">
            <ThunderboltFilled aria-hidden="true" />
          </span>
          <span>
            histeria<span className="brand-dot">.</span>
            <small>ACCOUNT WORKSPACE</small>
          </span>
        </a>
        <div className="workspace">
          <span className="workspace-symbol">
            <AppstoreOutlined aria-hidden="true" />
          </span>
          <div>
            Моя ферма<small>Личное пространство</small>
          </div>
          <span className="workspace-chevron">⌄</span>
        </div>
        <nav aria-label="Основная навигация">
          <div className="nav-label">УПРАВЛЕНИЕ</div>
          {item(
            'Аккаунты',
            <UserOutlined aria-hidden="true" />,
            () => onPage('accounts'),
            page === 'accounts',
            accountCount,
          )}
          {item(
            'Задачи',
            <UnorderedListOutlined aria-hidden="true" />,
            () => onPage('tasks'),
            page === 'tasks',
            runningCount || undefined,
          )}
          {item(
            'Журнал событий',
            <HistoryOutlined aria-hidden="true" />,
            () => onPage('activity'),
            page === 'activity',
          )}
          <div className="nav-label nav-label-spaced">РЕЖИМЫ РАБОТЫ</div>
          {item(
            'Комментарии',
            <CommentOutlined aria-hidden="true" />,
            () => onConfigure('mode', 'comments'),
            mode === 'comments',
          )}
          {item(
            'Реакции',
            <HeartOutlined aria-hidden="true" />,
            () => onConfigure('mode', 'reactions'),
            mode === 'reactions',
          )}
          {item(
            'Подписки',
            <UserAddOutlined aria-hidden="true" />,
            () => onConfigure('mode', 'subscriptions'),
            mode === 'subscriptions',
          )}
          {item(
            'Сценарии',
            <AppstoreOutlined aria-hidden="true" />,
            () => onConfigure('mode', 'scenario'),
            mode === 'scenario',
          )}
          <div className="nav-label nav-label-spaced">КОНФИГУРАЦИЯ</div>
          {item(
            'Тексты комментариев',
            <FileTextOutlined aria-hidden="true" />,
            () => onConfigure('text'),
          )}
          {item('Каналы и чаты', <LinkOutlined aria-hidden="true" />, () =>
            onConfigure('targets'),
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-card">
            <span className="demo-icon">
              <ThunderboltFilled aria-hidden="true" />
            </span>
            <strong>Всё под контролем</strong>
            <p>
              Аккаунты, задачи и сценарии
              <br />в одном пространстве.
            </p>
            <span className="demo-card-label">
              <CheckCircleOutlined aria-hidden="true" /> Демо-режим
            </span>
            <ArrowUpOutlined aria-hidden="true" className="demo-decoration" />
          </div>
          {item(
            'Настройки',
            <SettingOutlined aria-hidden="true" />,
            onSettings,
          )}
          <div className="sidebar-profile">
            <span className="profile-avatar">E</span>
            <div>
              ECS1PLE<small>Владелец пространства</small>
            </div>
            <span className="profile-dot" />
          </div>
        </div>
      </aside>
    </>
  )
}
