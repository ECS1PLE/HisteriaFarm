import { useCallback, useEffect, useState } from 'react'
import { App as AntApp } from 'antd'
import { defaultConfig } from '../data'
import { useLocalStorage } from './useLocalStorage'
import { api, ApiError } from '../services/api'
import type {
  Account,
  ConfigSection,
  Mode,
  Page,
  Preferences,
  SessionStatus,
  TaskConfig,
  Workspace,
} from '../types'
const empty: Workspace = { accounts: [], tasks: [], events: [], warmups: [], warmupWorkerOnline: false }
export function useDashboard() {
  const { message, modal } = AntApp.useApp()
  const [workspace, setWorkspace] = useState<Workspace>(empty)
  const [session, setSession] = useState<SessionStatus | null>(null)
  const [connectionError, setConnectionError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [config, setConfig] = useLocalStorage<TaskConfig>(
    'histeria.config.v2',
    defaultConfig,
  )
  const [preferences, setPreferences] = useLocalStorage<Preferences>(
    'histeria.preferences.v1',
    { compact: false, showActivity: true },
  )
  const [page, setPage] = useState<Page>('accounts')
  const [selected, setSelected] = useState<string[]>([])
  const [configuration, setConfiguration] = useState<{
    section: ConfigSection
    config: TaskConfig
  } | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [generationOpen, setGenerationOpen] = useState(false)
  const [warmupOpen, setWarmupOpen] = useState(false)
  const [detailsId, setDetailsId] = useState<string | null>(null)
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const next = await api<Workspace>('workspace/', { signal })
    setWorkspace(next)
    setSelected((prev) =>
      prev.filter((id) => next.accounts.some((a) => a.id === id)),
    )
  }, [])
  const loadSession = useCallback(
    async (signal?: AbortSignal) => {
      const next = await api<SessionStatus>('status/', { signal })
      if (signal?.aborted) return
      setSession(next)
      if (next.authenticated) await refresh(signal)
    },
    [refresh],
  )
  const connect = useCallback(async () => {
    setLoading(true)
    setConnectionError('')
    try {
      await loadSession()
    } catch (e) {
      setConnectionError(
        e instanceof Error ? e.message : 'Не удалось подключиться.',
      )
    } finally {
      setLoading(false)
    }
  }, [loadSession])
  useEffect(() => {
    localStorage.removeItem('histeria.workspace.v1')
    const controller = new AbortController()
    void api<SessionStatus>('status/', { signal: controller.signal })
      .then(async (next) => {
        if (controller.signal.aborted) return
        setSession(next)
        if (next.authenticated) await refresh(controller.signal)
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setConnectionError(
            e instanceof Error ? e.message : 'Не удалось подключиться.',
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [refresh])
  useEffect(() => {
    if (!session?.authenticated) return
    const controller = new AbortController()
    const timer = window.setInterval(() => {
      void refresh(controller.signal).catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          setSession(null)
          setWorkspace(empty)
        }
      })
    }, 15_000)
    return () => {
      window.clearInterval(timer)
      controller.abort()
    }
  }, [refresh, session?.authenticated])
  const execute = async (action: () => Promise<void>) => {
    setBusy(true)
    try {
      await action()
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Ошибка операции')
      if (e instanceof ApiError && e.status === 401) {
        setSession(null)
        void connect()
      }
    } finally {
      setBusy(false)
    }
  }
  const checkAccounts = (account?: Account) => {
    void execute(async () => {
      const targets = account ? [account] : workspace.accounts
      let failures = 0
      for (const item of targets) {
        try {
          await api(`accounts/${item.id}/`, { method: 'POST' })
        } catch (e) {
          failures++
          message.error(
            `${item.name}: ${e instanceof Error ? e.message : 'Ошибка'}`,
          )
        }
      }
      await refresh()
      if (!failures) message.success('Проверка Telegram завершена')
    })
  }
  const deleteAccount = (account: Account) =>
    modal.confirm({
      title: `Удалить аккаунт «${account.name}» из панели?`,
      content:
        'Сохранённая сессия будет удалена с сервера. Сам аккаунт Telegram останется.',
      okText: 'Удалить',
      cancelText: 'Отмена',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await api(`accounts/${account.id}/`, { method: 'DELETE' })
          setDetailsId(null)
          await refresh()
        } catch (e) {
          message.error(e instanceof Error ? e.message : 'Ошибка удаления')
          throw e
        }
      },
    })
  const changeGroup = (account: Account, group: string) => {
    void execute(async () => {
      await api(`accounts/${account.id}/`, {
        method: 'PATCH',
        body: { group },
      })
      await refresh()
    })
  }
  const configure = (section: ConfigSection, mode?: Mode) =>
    setConfiguration({
      section,
      config: { ...config, mode: mode ?? config.mode },
    })
  const openLaunch = () => {
    message.info(
      'Выполнение задач ещё не подключено. Сейчас доступны аккаунты и редактирование профилей.',
    )
  }
  const logout = () => {
    void execute(async () => {
      await api('logout/', { method: 'POST' })
      setWorkspace(empty)
      setSelected([])
      setDetailsId(null)
      setSettingsOpen(false)
      await connect()
    })
  }
  const accounts = workspace.accounts
  return {
    ...workspace,
    session,
    connectionError,
    loading,
    busy,
    connect,
    refresh,
    logout,
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
    generationOpen,
    setGenerationOpen,
    warmupOpen,
    setWarmupOpen,
    stopWarmup: (id: string) => {
      void execute(async () => {
        await api(`warmups/${id}/stop/`, { method: 'POST' })
        await refresh()
        message.success('Прогрев остановлен')
      })
    },
    detailAccount: accounts.find((a) => a.id === detailsId),
    setDetailsId,
    ready: accounts.filter((a) => a.status === 'ready'),
    working: accounts.filter((a) => a.status === 'working').length,
    attention: accounts.filter(
      (a) => a.status === 'error' || a.status === 'offline',
    ).length,
    activeTasks: workspace.tasks.filter(
      (t) => t.status === 'running' || t.status === 'paused',
    ),
    configure,
    openLaunch,
    toggleTask: openLaunch,
    stopTask: openLaunch,
    checkAccounts,
    deleteAccount,
    changeGroup,
    title:
      page === 'accounts'
        ? 'Аккаунты'
        : page === 'tasks'
          ? 'Задачи'
          : 'Журнал событий',
    mode: config.mode,
    openAdd: () => {
      if (!session?.telegramConfigured) {
        setSettingsOpen(true)
        message.info('Сначала укажи Telegram API ID и API Hash')
      } else setAddOpen(true)
    },
    saveConfig: setConfig,
    changePreferences: (patch: Partial<Preferences>) =>
      setPreferences((prev) => ({ ...prev, ...patch })),
  }
}
