import { useEffect, useState } from 'react'
import { App as AntApp, Form } from 'antd'
import {
  defaultConfig,
  initialAccounts,
  initialActivity,
  modeLabels,
} from '../data'
import { useLocalStorage } from './useLocalStorage'
import type {
  Account,
  AccountFields,
  Activity,
  ConfigSection,
  Mode,
  Page,
  Preferences,
  Task,
  TaskConfig,
  TaskFields,
  Workspace,
} from '../types'

const now = () =>
  new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
const event = (
  title: string,
  detail: string,
  type: Activity['type'] = 'info',
): Activity => ({ id: crypto.randomUUID(), title, detail, type, time: now() })

export function useDashboard() {
  const { message, modal } = AntApp.useApp()
  const [workspace, setWorkspace] = useLocalStorage<Workspace>(
    'histeria.workspace.v1',
    { accounts: initialAccounts, tasks: [], events: initialActivity },
  )
  const [config, setConfig] = useLocalStorage<TaskConfig>(
    'histeria.config.v1',
    defaultConfig,
  )
  const [preferences, setPreferences] = useLocalStorage<Preferences>(
    'histeria.preferences.v1',
    { compact: false, showActivity: true },
  )
  const { accounts, tasks, events } = workspace
  const [page, setPage] = useState<Page>('accounts')
  const [selected, setSelected] = useState<string[]>([])
  const [configuration, setConfiguration] = useState<{
    section: ConfigSection
    config: TaskConfig
  } | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [launchOpen, setLaunchOpen] = useState(false)
  const [detailsId, setDetailsId] = useState<string | null>(null)
  const [accountForm] = Form.useForm<AccountFields>()
  const [taskForm] = Form.useForm<TaskFields>()
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

  const configure = (section: ConfigSection, mode?: Mode) =>
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

  const openAdd = () => {
    accountForm.resetFields()
    setAddOpen(true)
  }
  const saveConfig = (value: TaskConfig) => {
    setConfig(value)
    addEvent(
      event(
        'Конфигурация сохранена',
        `${modeLabels[value.mode]} · ${value.mode === 'scenario' ? `${value.steps.length} шага` : `${value.targets.length} площадки`}`,
      ),
    )
  }
  const changeGroup = (account: Account, group: string) =>
    setWorkspace((prev) => ({
      ...prev,
      accounts: prev.accounts.map((a) =>
        a.id === account.id ? { ...a, group } : a,
      ),
      events: [
        event('Группа изменена', `${account.name} → ${group}`),
        ...prev.events,
      ].slice(0, 100),
    }))
  const changePreferences = (patch: Partial<Preferences>) =>
    setPreferences((prev) => ({ ...prev, ...patch }))
  return {
    accounts,
    tasks,
    events,
    config,
    preferences,
    page,
    setPage,
    selected,
    setSelected,
    configuration,
    setConfiguration,
    mobileOpen,
    setMobileOpen,
    settingsOpen,
    setSettingsOpen,
    addOpen,
    setAddOpen,
    launchOpen,
    setLaunchOpen,
    detailAccount,
    setDetailsId,
    accountForm,
    taskForm,
    ready,
    working,
    attention,
    activeTasks,
    configure,
    openLaunch,
    launch,
    toggleTask,
    stopTask,
    checkAccounts,
    deleteAccount,
    addAccount,
    title,
    mode,
    openAdd,
    saveConfig,
    changeGroup,
    changePreferences,
  }
}
