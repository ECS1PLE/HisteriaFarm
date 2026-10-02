import { useEffect, useState } from 'react'
import {
  Alert,
  App as AntApp,
  Avatar,
  Badge,
  Button,
  ConfigProvider,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Popover,
  Select,
  Switch,
  Tooltip,
  theme,
} from 'antd'
import ruRU from 'antd/locale/ru_RU'
import {
  ArrowRightOutlined,
  BellOutlined,
  CheckCircleOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CommentOutlined,
  HeartOutlined,
  MenuOutlined,
  PlusOutlined,
  ReloadOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  ThunderboltFilled,
  ThunderboltOutlined,
  UserAddOutlined,
  UserOutlined,
} from '@ant-design/icons'
import Sidebar from './components/Sidebar'
import AccountTable from './components/AccountTable'
import ConfigDrawer from './components/ConfigDrawer'
import TasksView from './components/TasksView'
import ActivityView from './components/ActivityView'
import StatusBadge from './components/StatusBadge'
import {
  defaultConfig,
  groups,
  initialAccounts,
  initialActivity,
  modeLabels,
} from './data'
import { useLocalStorage } from './hooks/useLocalStorage'
import type { Account, Activity, Mode, Page, Task, TaskConfig } from './types'
import './App.css'

const modeIcons = {
  comments: <CommentOutlined aria-hidden="true" />,
  reactions: <HeartOutlined aria-hidden="true" />,
  subscriptions: <UserAddOutlined aria-hidden="true" />,
  scenario: <RobotOutlined aria-hidden="true" />,
}
const now = () =>
  new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
const event = (
  title: string,
  detail: string,
  type: Activity['type'] = 'info',
): Activity => ({ id: crypto.randomUUID(), title, detail, type, time: now() })
interface Workspace {
  accounts: Account[]
  tasks: Task[]
  events: Activity[]
}
interface AccountFields {
  name: string
  username: string
  phone: string
  proxy?: string
  group: string
}

function Dashboard() {
  const { message, modal } = AntApp.useApp()
  const [workspace, setWorkspace] = useLocalStorage<Workspace>(
    'histeria.workspace.v1',
    { accounts: initialAccounts, tasks: [], events: initialActivity },
  )
  const [config, setConfig] = useLocalStorage<TaskConfig>(
    'histeria.config.v1',
    defaultConfig,
  )
  const [preferences, setPreferences] = useLocalStorage(
    'histeria.preferences.v1',
    { compact: false, showActivity: true },
  )
  const { accounts, tasks, events } = workspace
  const [page, setPage] = useState<Page>('accounts')
  const [selected, setSelected] = useState<string[]>([])
  const [configuration, setConfiguration] = useState<{
    section: string
    config: TaskConfig
  } | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [launchOpen, setLaunchOpen] = useState(false)
  const [detailsId, setDetailsId] = useState<string | null>(null)
  const [accountForm] = Form.useForm<AccountFields>()
  const [taskForm] = Form.useForm<{ name: string; accountIds: string[] }>()
  const detailAccount = accounts.find((a) => a.id === detailsId)
  const ready = accounts.filter((a) => a.status === 'ready')
  const working = accounts.filter((a) => a.status === 'working').length
  const attention = accounts.filter(
    (a) => a.status === 'error' || a.status === 'offline',
  ).length
  const activeTasks = tasks.filter(
    (t) => t.status === 'running' || t.status === 'paused',
  )
  const hasRunning = tasks.some((t) => t.status === 'running')
  const addEvent = (entry: Activity) =>
    setWorkspace((prev) => ({
      ...prev,
      events: [entry, ...prev.events].slice(0, 100),
    }))

  useEffect(() => {
    if (!hasRunning) return
    const timer = window.setInterval(() => {
      setWorkspace((prev) => {
        const finished: Task[] = []
        const nextTasks = prev.tasks.map((t) => {
          if (t.status !== 'running') return t
          const progress = Math.min(
            100,
            t.progress +
              100 / (t.config.interval * Math.max(1, t.accountIds.length)),
          )
          if (progress >= 99.999) {
            finished.push(t)
            return { ...t, progress: 100, status: 'completed' as const }
          }
          return { ...t, progress }
        })
        const doneIds = new Set(finished.flatMap((t) => t.accountIds))
        return {
          accounts: prev.accounts.map((a) =>
            doneIds.has(a.id)
              ? {
                  ...a,
                  status: 'ready',
                  completed: a.completed + 1,
                  lastActive: 'Только что',
                }
              : a,
          ),
          tasks: nextTasks,
          events: [
            ...finished.map((t) => ({
              id: `done-${t.id}`,
              title: 'Задача завершена',
              detail: `${t.name} · ${t.accountIds.length} аккаунтов (демо)`,
              type: 'success' as const,
              time: now(),
            })),
            ...prev.events,
          ].slice(0, 100),
        }
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [hasRunning, setWorkspace])

  const configure = (section: string, mode?: Mode) =>
    setConfiguration({
      section,
      config: { ...config, mode: mode ?? config.mode },
    })
  const openLaunch = () => {
    taskForm.setFieldsValue({
      name: `${modeLabels[config.mode]} · ${now()}`,
      accountIds: selected.filter((id) => ready.some((a) => a.id === id)),
    })
    setLaunchOpen(true)
  }
  const launch = ({
    name,
    accountIds,
  }: {
    name: string
    accountIds: string[]
  }) => {
    if (
      !accountIds.length ||
      accountIds.some((id) => !ready.some((a) => a.id === id))
    ) {
      message.warning('Выбери готовые аккаунты')
      return
    }
    if (config.mode === 'comments' && !config.comment.trim()) {
      message.warning('Добавь текст комментария в настройках')
      return
    }
    if (config.mode !== 'scenario' && !config.targets.length) {
      message.warning('Добавь каналы и чаты в настройках')
      return
    }
    if (
      config.mode === 'scenario' &&
      (!config.bot.trim() ||
        !config.steps.length ||
        config.steps.some((s) => !s.trim()))
    ) {
      message.warning('Заполни настройки сценария')
      return
    }
    const task: Task = {
      id: crypto.randomUUID(),
      name: name.trim(),
      mode: config.mode,
      config: structuredClone(config),
      accountIds,
      progress: 0,
      status: 'running',
      createdAt: now(),
    }
    setWorkspace((prev) => ({
      accounts: prev.accounts.map((a) =>
        accountIds.includes(a.id)
          ? { ...a, status: 'working', lastActive: 'Только что' }
          : a,
      ),
      tasks: [task, ...prev.tasks],
      events: [
        event(
          'Задача запущена',
          `${task.name} · ${accountIds.length} аккаунтов (демо)`,
          'success',
        ),
        ...prev.events,
      ].slice(0, 100),
    }))
    setSelected([])
    setLaunchOpen(false)
    setPage('tasks')
    message.success('Демонстрация запущена')
  }
  const toggleTask = (id: string) =>
    setWorkspace((prev) => {
      const task = prev.tasks.find((t) => t.id === id)
      if (!task || !['running', 'paused'].includes(task.status)) return prev
      const paused = task.status === 'running'
      return {
        ...prev,
        tasks: prev.tasks.map((t) =>
          t.id === id ? { ...t, status: paused ? 'paused' : 'running' } : t,
        ),
        events: [
          event(
            paused ? 'Задача приостановлена' : 'Задача продолжена',
            task.name,
          ),
          ...prev.events,
        ].slice(0, 100),
      }
    })
  const stopTask = (id: string) =>
    setWorkspace((prev) => {
      const task = prev.tasks.find((t) => t.id === id)
      if (!task || !['running', 'paused'].includes(task.status)) return prev
      return {
        accounts: prev.accounts.map((a) =>
          task.accountIds.includes(a.id) ? { ...a, status: 'ready' } : a,
        ),
        tasks: prev.tasks.map((t) =>
          t.id === id ? { ...t, status: 'cancelled' } : t,
        ),
        events: [
          event('Задача остановлена', task.name, 'warning'),
          ...prev.events,
        ].slice(0, 100),
      }
    })
  const checkAccounts = (account?: Account) => {
    setWorkspace((prev) => ({
      ...prev,
      accounts: prev.accounts.map((a) =>
        (!account || a.id === account.id) && a.status !== 'working'
          ? { ...a, status: 'ready', lastActive: 'Только что' }
          : a,
      ),
      events: [
        event(
          'Демо-проверка завершена',
          account
            ? `${account.name} · статус сброшен на «Готов к работе»`
            : 'Свободные аккаунты переведены в статус «Готов к работе»',
          'success',
        ),
        ...prev.events,
      ].slice(0, 100),
    }))
    message.success('Демо-проверка завершена')
  }
  const deleteAccount = (account: Account) =>
    modal.confirm({
      title: `Удалить аккаунт «${account.name}»?`,
      content: 'Аккаунт будет удалён из локального списка панели.',
      okText: 'Удалить',
      cancelText: 'Отмена',
      okButtonProps: { danger: true },
      onOk: () => {
        setWorkspace((prev) => ({
          ...prev,
          accounts: prev.accounts.filter((a) => a.id !== account.id),
          events: [
            event('Аккаунт удалён', account.name, 'warning'),
            ...prev.events,
          ].slice(0, 100),
        }))
        setSelected((prev) => prev.filter((id) => id !== account.id))
        setDetailsId(null)
      },
    })
  const addAccount = (fields: AccountFields) => {
    const username = fields.username.trim().replace(/^@/, '')
    if (
      accounts.some((a) => a.username.toLowerCase() === username.toLowerCase())
    ) {
      message.warning('Аккаунт с таким username уже существует')
      return
    }
    const phone = fields.phone.trim()
    if (
      accounts.some(
        (a) => a.phone.replace(/\D/g, '') === phone.replace(/\D/g, ''),
      )
    ) {
      message.warning('Аккаунт с таким телефоном уже существует')
      return
    }
    const account: Account = {
      ...fields,
      name: fields.name.trim(),
      username,
      phone,
      proxy: fields.proxy?.trim() || 'Без прокси',
      id: crypto.randomUUID(),
      country: 'RU',
      color: '#91b99a',
      status: 'ready',
      premium: false,
      completed: 0,
      lastActive: 'Только что',
    }
    setWorkspace((prev) => ({
      ...prev,
      accounts: [account, ...prev.accounts],
      events: [
        event('Аккаунт добавлен', `${account.name} · демо-профиль`, 'success'),
        ...prev.events,
      ].slice(0, 100),
    }))
    setAddOpen(false)
    accountForm.resetFields()
    message.success('Демо-аккаунт добавлен')
  }
  const title =
    page === 'accounts'
      ? 'Аккаунты'
      : page === 'tasks'
        ? 'Задачи'
        : 'Журнал событий'
  const mode = config.mode
  return (
    <div className="app-shell">
      <Sidebar
        page={page}
        mode={mode}
        accountCount={accounts.length}
        runningCount={activeTasks.length}
        onPage={setPage}
        onConfigure={configure}
        onSettings={() => setSettingsOpen(true)}
        mobileOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <Button
              className="mobile-menu"
              type="text"
              icon={<MenuOutlined aria-hidden="true" />}
              aria-label="Открыть меню"
              onClick={() => setMobileOpen(true)}
            />
            <span>Рабочее пространство</span>
            <span className="breadcrumb-slash">/</span>
            <strong>{title}</strong>
          </div>
          <div className="topbar-actions">
            <span className="demo-indicator">
              <span className="connection-dot" />
              Демо-режим
            </span>
            <span className="topbar-divider" />
            <Popover
              trigger="click"
              placement="bottomRight"
              title="Уведомления"
              content={
                <div className="notification-content">
                  {events.slice(0, 3).map((e) => (
                    <div key={e.id}>
                      <strong>{e.title}</strong>
                      <small>{e.detail}</small>
                    </div>
                  ))}
                </div>
              }
            >
              <Badge dot={attention > 0} color="#a9e879">
                <Button
                  type="text"
                  icon={<BellOutlined aria-hidden="true" />}
                  aria-label="Уведомления"
                />
              </Badge>
            </Popover>
            <Avatar size={30} className="topbar-avatar">
              E
            </Avatar>
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">ТВОЙ ЦЕНТР УПРАВЛЕНИЯ</div>
              <h1>
                {title}
                <span className="heading-dot">.</span>
              </h1>
              <p>
                {page === 'accounts'
                  ? 'Управляй аккаунтами. Создавай задачи. Держи всё под контролем.'
                  : page === 'tasks'
                    ? 'Все режимы работы и прогресс выполнения в одном месте.'
                    : 'История действий и изменений в твоём пространстве.'}
              </p>
            </div>
            <div className="heading-actions">
              {page === 'accounts' && (
                <Button
                  icon={<PlusOutlined aria-hidden="true" />}
                  onClick={() => {
                    accountForm.resetFields()
                    setAddOpen(true)
                  }}
                >
                  Добавить аккаунт
                </Button>
              )}
              <Button
                type="primary"
                icon={<ThunderboltFilled aria-hidden="true" />}
                onClick={openLaunch}
              >
                Создать задачу
              </Button>
            </div>
          </div>
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-top">
                <span>Всего аккаунтов</span>
                <UserOutlined aria-hidden="true" />
              </div>
              <div className="stat-value">
                {accounts.length}
                <span className="stat-caption">в пространстве</span>
              </div>
              <div className="stat-footer">
                <span className="stat-mini-icon">
                  <CheckOutlined aria-hidden="true" />
                </span>{' '}
                {groups.length} группы аккаунтов{' '}
                <div className="mini-bars">
                  {[35, 48, 38, 64, 52, 76, 70, 90, 82, 100].map((v, i) => (
                    <i key={i} style={{ height: `${v}%` }} />
                  ))}
                </div>
              </div>
            </div>
            <div className="stat-card stat-highlight">
              <div className="stat-top">
                <span>Готовы к работе</span>
                <CheckCircleOutlined aria-hidden="true" />
              </div>
              <div className="stat-value">
                {ready.length}
                <span className="stat-percent">
                  {accounts.length
                    ? Math.round((ready.length / accounts.length) * 100)
                    : 0}
                  %
                </span>
              </div>
              <div className="stat-footer">
                <span className="connection-dot" /> Можно запускать задачи
              </div>
              <div className="stat-track">
                <span
                  style={{
                    width: `${accounts.length ? (ready.length / accounts.length) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-top">
                <span>Выполняют задачи</span>
                <ThunderboltOutlined aria-hidden="true" />
              </div>
              <div className="stat-value">
                {working}
                <span className="stat-caption">аккаунтов</span>
              </div>
              <div className="stat-footer">
                <span className="connection-dot blue" /> Активных задач:{' '}
                {activeTasks.length}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-top">
                <span>Требуют внимания</span>
                <SafetyCertificateOutlined aria-hidden="true" />
              </div>
              <div className="stat-value">
                {attention}
                <span className="attention-tag">
                  {attention ? 'Проверить' : 'Всё хорошо'}
                </span>
              </div>
              <div className="stat-footer">
                <span
                  className={`connection-dot ${attention ? 'amber' : ''}`}
                />{' '}
                Ошибки и отключённые аккаунты
              </div>
            </div>
          </div>
          {page === 'accounts' && (
            <>
              <div className="mode-strip">
                <span className="mode-strip-icon">{modeIcons[mode]}</span>
                <div>
                  <strong>Режим: {modeLabels[mode]}</strong>
                  <span>
                    {mode === 'scenario'
                      ? `${config.steps.length} шага · ${config.bot}`
                      : `${config.targets.length} площадки · интервал ${config.interval} сек.`}
                  </span>
                </div>
                <span className="mode-strip-divider" />
                <span className="mode-strip-note">
                  Конфигурация для следующей задачи
                </span>
                <Button
                  type="text"
                  icon={<ArrowRightOutlined aria-hidden="true" />}
                  iconPlacement="end"
                  onClick={() => configure('mode')}
                >
                  Настроить
                </Button>
              </div>
              <AccountTable
                accounts={accounts}
                selected={selected}
                compact={preferences.compact}
                onSelect={setSelected}
                onDetails={(a) => setDetailsId(a.id)}
                onDelete={deleteAccount}
                onCheck={checkAccounts}
                onLaunch={openLaunch}
              />
              <div
                className={`bottom-grid ${!preferences.showActivity ? 'without-activity' : ''}`}
              >
                {preferences.showActivity && (
                  <ActivityView
                    events={events}
                    onViewAll={() => setPage('activity')}
                  />
                )}
                <section className="panel quick-start">
                  <div className="quick-start-copy">
                    <span className="eyebrow">СЛЕДУЮЩИЙ ШАГ</span>
                    <h2>От идеи — к действию</h2>
                    <p>
                      Выбери аккаунты и настрой режим.
                      <br />
                      Остальное — в одной задаче.
                    </p>
                    <Button type="text" onClick={openLaunch}>
                      Создать первую задачу{' '}
                      <ArrowRightOutlined aria-hidden="true" />
                    </Button>
                  </div>
                  <div className="orbit-illustration" aria-hidden="true">
                    <div className="orbit orbit-one" />
                    <div className="orbit orbit-two" />
                    <div className="orbit-center">
                      <ThunderboltFilled aria-hidden="true" />
                    </div>
                    <span className="orbit-node node-one">
                      <CommentOutlined aria-hidden="true" />
                    </span>
                    <span className="orbit-node node-two">
                      <HeartOutlined aria-hidden="true" />
                    </span>
                    <span className="orbit-node node-three">
                      <UserOutlined aria-hidden="true" />
                    </span>
                    <span className="orbit-star">✦</span>
                  </div>
                </section>
              </div>
            </>
          )}
          {page === 'tasks' && (
            <TasksView
              tasks={tasks}
              onToggle={toggleTask}
              onStop={stopTask}
              onCreate={openLaunch}
            />
          )}
          {page === 'activity' && <ActivityView events={events} full />}
          <footer className="page-footer">
            <span>
              histeria<span> workspace</span>{' '}
              <span className="footer-version">v0.1</span>
            </span>
            <span>
              <ClockCircleOutlined aria-hidden="true" /> Локальное пространство
              · Демо-данные
            </span>
          </footer>
        </main>
      </div>
      {configuration && (
        <ConfigDrawer
          key={`${configuration.section}-${configuration.config.mode}`}
          open
          section={configuration.section}
          config={configuration.config}
          onClose={() => setConfiguration(null)}
          onSave={(value) => {
            setConfig(value)
            addEvent(
              event(
                'Конфигурация сохранена',
                `${modeLabels[value.mode]} · ${value.mode === 'scenario' ? `${value.steps.length} шага` : `${value.targets.length} площадки`}`,
              ),
            )
          }}
        />
      )}
      <Modal
        title="Добавить аккаунт"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={() => accountForm.submit()}
        okText="Добавить аккаунт"
        cancelText="Отмена"
      >
        <p className="modal-description">
          Создай демо-профиль для настройки интерфейса.
        </p>
        <Form
          form={accountForm}
          layout="vertical"
          initialValues={{ group: 'Основная' }}
          onFinish={addAccount}
        >
          <Form.Item
            name="name"
            label="Имя аккаунта"
            rules={[
              { required: true, whitespace: true, message: 'Введи имя' },
              { max: 64, message: 'До 64 символов' },
            ]}
          >
            <Input placeholder="Александр Волков" />
          </Form.Item>
          <Form.Item
            name="username"
            label="Username"
            rules={[
              { required: true, message: 'Введи username' },
              {
                pattern: /^@?[a-zA-Z][a-zA-Z0-9_]{4,31}$/,
                message: '5–32 символа: латиница, цифры, подчёркивание',
              },
            ]}
          >
            <Input placeholder="@username" />
          </Form.Item>
          <Form.Item
            name="phone"
            label="Номер телефона"
            rules={[
              { required: true, message: 'Введи номер' },
              {
                validator: (_, value: string) =>
                  /^\+?[\d ()-]+$/.test(value ?? '') &&
                  /^\d{10,15}$/.test((value ?? '').replace(/\D/g, ''))
                    ? Promise.resolve()
                    : Promise.reject(
                        new Error('Введи корректный номер (10–15 цифр)'),
                      ),
              },
            ]}
          >
            <Input placeholder="+7 (999) 123-45-67" />
          </Form.Item>
          <div className="form-two-cols">
            <Form.Item name="group" label="Группа">
              <Select options={groups.map((g) => ({ value: g, label: g }))} />
            </Form.Item>
            <Form.Item
              name="proxy"
              label="Прокси (необязательно)"
              rules={[
                { pattern: /^[\w.-]+:\d{2,5}$/, message: 'Формат host:port' },
              ]}
            >
              <Input placeholder="185.24.42.108:8000" />
            </Form.Item>
          </div>
          <Alert
            title="Подключение Telegram пока не выполняется"
            type="info"
            showIcon
          />
        </Form>
      </Modal>
      <Modal
        title="Новая задача"
        open={launchOpen}
        onCancel={() => setLaunchOpen(false)}
        onOk={() => taskForm.submit()}
        okText="Запустить демо"
        cancelText="Отмена"
        okButtonProps={{ disabled: !ready.length }}
      >
        <p className="modal-description">
          Режим <strong>{modeLabels[mode]}</strong> ·{' '}
          {mode === 'scenario'
            ? `${config.steps.length} шага`
            : `${config.targets.length} площадки`}
        </p>
        <Form form={taskForm} layout="vertical" onFinish={launch}>
          <Form.Item
            name="name"
            label="Название задачи"
            rules={[
              { required: true, whitespace: true, message: 'Введи название' },
              { max: 80, message: 'До 80 символов' },
            ]}
          >
            <Input placeholder="Моя первая задача" />
          </Form.Item>
          <div className="account-select-label">
            <span>Аккаунты для задачи</span>
            <Button
              type="text"
              size="small"
              disabled={!ready.length}
              onClick={() =>
                taskForm.setFieldValue(
                  'accountIds',
                  ready.map((a) => a.id),
                )
              }
            >
              Выбрать все готовые ({ready.length})
            </Button>
          </div>
          <Form.Item
            name="accountIds"
            rules={[
              {
                required: true,
                type: 'array',
                min: 1,
                message: 'Выбери хотя бы один готовый аккаунт',
              },
            ]}
          >
            <Select
              mode="multiple"
              placeholder="Выбери аккаунты"
              maxTagCount={3}
              optionFilterProp="label"
              options={ready.map((a) => ({ value: a.id, label: a.name }))}
            />
          </Form.Item>
          {mode === 'comments' && (
            <div className="comment-preview">
              <span>ТЕКСТ КОММЕНТАРИЯ</span>
              <p>{config.comment}</p>
            </div>
          )}
          {mode === 'reactions' && (
            <div className="comment-preview">
              Реакция: <span className="preview-emoji">{config.reaction}</span>
            </div>
          )}
          {mode === 'scenario' && (
            <div className="comment-preview">
              <span>{config.bot}</span>
              {config.steps.map((s, i) => (
                <p key={i}>
                  {i + 1}. {s}
                </p>
              ))}
            </div>
          )}
          <Alert
            className="mt-4"
            title={
              ready.length
                ? 'Будет запущена демонстрация выполнения'
                : 'Нет готовых аккаунтов'
            }
            description={
              ready.length
                ? 'Telegram не подключён. Прогресс и статусы изменяются локально.'
                : 'Добавь аккаунт или выполни демо-проверку в его карточке.'
            }
            type={ready.length ? 'info' : 'warning'}
            showIcon
          />
        </Form>
      </Modal>
      <Drawer
        title="Аккаунт"
        open={!!detailAccount}
        onClose={() => setDetailsId(null)}
        size={420}
      >
        {detailAccount && (
          <>
            <div className="detail-profile">
              <Avatar
                size={64}
                style={{
                  background: `${detailAccount.color}25`,
                  color: detailAccount.color,
                }}
              >
                {detailAccount.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')}
              </Avatar>
              <h2>{detailAccount.name}</h2>
              <p>@{detailAccount.username}</p>
              <StatusBadge status={detailAccount.status} />
            </div>
            <Descriptions
              column={1}
              items={[
                {
                  key: 'phone',
                  label: 'Телефон',
                  children: detailAccount.phone,
                },
                {
                  key: 'proxy',
                  label: 'Прокси',
                  children: detailAccount.proxy,
                },
                {
                  key: 'country',
                  label: 'Страна',
                  children:
                    detailAccount.country === 'RU' ? 'Россия' : 'Германия',
                },
                {
                  key: 'premium',
                  label: 'Premium',
                  children: detailAccount.premium ? 'Да' : 'Нет',
                },
                {
                  key: 'completed',
                  label: 'Выполнено задач',
                  children: detailAccount.completed,
                },
                {
                  key: 'active',
                  label: 'Активность',
                  children: detailAccount.lastActive,
                },
                {
                  key: 'task',
                  label: 'Текущая задача',
                  children:
                    activeTasks.find((t) =>
                      t.accountIds.includes(detailAccount.id),
                    )?.name ?? 'Нет активной задачи',
                },
              ]}
            />
            <label className="field-label mt-4">Группа аккаунта</label>
            <Select
              className="w-full"
              value={detailAccount.group}
              options={groups.map((g) => ({ value: g, label: g }))}
              onChange={(group) =>
                setWorkspace((prev) => ({
                  ...prev,
                  accounts: prev.accounts.map((a) =>
                    a.id === detailAccount.id ? { ...a, group } : a,
                  ),
                  events: [
                    event(
                      'Группа изменена',
                      `${detailAccount.name} → ${group}`,
                    ),
                    ...prev.events,
                  ].slice(0, 100),
                }))
              }
            />
            <div className="detail-actions">
              <Tooltip title="Локальный сброс статуса без обращения к Telegram">
                <Button
                  block
                  icon={<ReloadOutlined aria-hidden="true" />}
                  disabled={detailAccount.status === 'working'}
                  onClick={() => checkAccounts(detailAccount)}
                >
                  Проверить аккаунт (демо)
                </Button>
              </Tooltip>
              <Button
                block
                danger
                disabled={detailAccount.status === 'working'}
                onClick={() => deleteAccount(detailAccount)}
              >
                Удалить аккаунт
              </Button>
            </div>
          </>
        )}
      </Drawer>
      <Drawer
        title="Настройки пространства"
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        size={420}
      >
        <p className="drawer-description">
          Настрой панель под свой рабочий процесс.
        </p>
        <div className="setting-row">
          <div>
            <strong>Компактная таблица</strong>
            <small>Больше аккаунтов на одном экране</small>
          </div>
          <Switch
            checked={preferences.compact}
            onChange={(compact) =>
              setPreferences((prev) => ({ ...prev, compact }))
            }
          />
        </div>
        <div className="setting-row">
          <div>
            <strong>Последние события</strong>
            <small>Показывать журнал под таблицей</small>
          </div>
          <Switch
            checked={preferences.showActivity}
            onChange={(showActivity) =>
              setPreferences((prev) => ({ ...prev, showActivity }))
            }
          />
        </div>
        <Alert
          className="mt-6"
          title="Локальное пространство"
          description="Аккаунты, конфигурация, задачи и настройки сохраняются в этом браузере. Для работы с Telegram потребуется серверная часть."
          type="info"
          showIcon
        />
        <div className="settings-info">
          <span>Версия панели</span>
          <strong>0.1.0</strong>
        </div>
      </Drawer>
    </div>
  )
}

export default function App() {
  return (
    <ConfigProvider
      locale={ruRU}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: '#a9e879',
          colorInfo: '#91b9e8',
          colorSuccess: '#a9e879',
          colorWarning: '#d8ae70',
          colorError: '#e38a8a',
          colorBgBase: '#101211',
          colorBgContainer: '#171a18',
          colorBgElevated: '#1b1f1c',
          colorBorder: '#30362f',
          colorBorderSecondary: '#272c27',
          colorText: '#e7e9e5',
          colorTextSecondary: '#9ba39a',
          colorTextTertiary: '#778176',
          colorTextPlaceholder: '#75816f',
          fontFamily:
            'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
          fontSize: 13,
          borderRadius: 7,
          controlHeight: 36,
        },
        components: {
          Button: {
            primaryColor: '#182410',
            fontWeight: 500,
            primaryShadow: 'none',
          },
          Table: {
            headerBg: '#1a1e1a',
            headerColor: '#929b90',
            rowHoverBg: '#1d231d',
            rowSelectedBg: '#24301e',
            rowSelectedHoverBg: '#2b3825',
            cellPaddingBlock: 13,
            cellPaddingInline: 16,
          },
          Drawer: { colorBgElevated: '#161a17' },
          Input: { activeShadow: '0 0 0 2px #a9e87912' },
        },
      }}
    >
      <AntApp>
        <Dashboard />
      </AntApp>
    </ConfigProvider>
  )
}
