import {
  PlusOutlined,
  ThunderboltFilled,
  ReloadOutlined,
} from '@ant-design/icons'
import { Spin } from 'antd'
import PanelLogin from '../components/auth/PanelLogin'
import { Button, Notice, Panel } from '../components/UI'
import AppLayout from '../components/layout/AppLayout'
import Sidebar from '../components/layout/Sidebar'
import Topbar from '../components/layout/Topbar'
import PageHeading from '../components/layout/PageHeading'
import PageFooter from '../components/layout/PageFooter'
import WorkspaceStats from '../components/dashboard/WorkspaceStats'
import AccountsView from '../components/dashboard/AccountsView'
import WorkspaceDialogs from '../components/dashboard/WorkspaceDialogs'
import WarmupPanel from '../components/accounts/WarmupPanel'
import TasksView from '../components/tasks/TasksView'
import ActivityView from '../components/activity/ActivityView'
import { useDashboard } from '../hooks/useDashboard'
const descriptions = {
  accounts: 'Управляй аккаунтами. Создавай задачи. Держи всё под контролем.',
  tasks: 'Все режимы работы и прогресс выполнения в одном месте.',
  activity: 'История действий и изменений в твоём пространстве.',
}
export default function DashboardPage() {
  const dashboard = useDashboard()
  if (dashboard.loading)
    return (
      <div className="connection-screen">
        <Spin size="large" />
      </div>
    )
  if (dashboard.connectionError)
    return (
      <div className="connection-screen">
        <Panel className="connection-panel">
          <h1>Подключение к серверу</h1>
          <Notice type="error" title={dashboard.connectionError} />
          <Button
            className="mt-6"
            block
            onClick={() => void dashboard.connect()}
          >
            Повторить
          </Button>
        </Panel>
      </div>
    )
  if (!dashboard.session?.authenticated)
    return <PanelLogin onLogin={dashboard.connect} />
  return (
    <AppLayout
      sidebar={
        <Sidebar
          page={dashboard.page}
          mode={dashboard.mode}
          accountCount={dashboard.accounts.length}
          runningCount={dashboard.activeTasks.length + dashboard.warmups.filter((job) => job.status === 'running').length}
          onPage={dashboard.setPage}
          onConfigure={dashboard.configure}
          onSettings={() => dashboard.setSettingsOpen(true)}
          mobileOpen={dashboard.mobileOpen}
          onClose={() => dashboard.setMobileOpen(false)}
        />
      }
      topbar={
        <Topbar
          title={dashboard.title}
          connected={dashboard.session.telegramConfigured}
          events={dashboard.events}
          hasNotifications={dashboard.attention > 0}
          onOpenMenu={() => dashboard.setMobileOpen(true)}
        />
      }
      footer={<PageFooter />}
      dialogs={<WorkspaceDialogs controller={dashboard} />}
    >
      <PageHeading
        title={dashboard.title}
        description={descriptions[dashboard.page]}
        actions={
          <>
            {dashboard.page === 'accounts' && (
              <Button
                icon={<PlusOutlined aria-hidden="true" />}
                onClick={dashboard.openAdd}
              >
                Добавить аккаунт
              </Button>
            )}
            {dashboard.page === 'accounts' && (
              <>
                <Button
                  icon={<ReloadOutlined aria-hidden="true" />}
                  loading={dashboard.busy}
                  disabled={!dashboard.accounts.length}
                  onClick={() => dashboard.checkAccounts()}
                >
                  Проверить
                </Button>
                <Button
                  type="primary"
                  icon={<ThunderboltFilled aria-hidden="true" />}
                  disabled={!dashboard.accounts.length || dashboard.busy}
                  onClick={() => dashboard.setGenerationOpen(true)}
                >
                  {dashboard.selected.length
                    ? 'Сгенерировать выбранным'
                    : 'Сгенерировать всем'}
                </Button>
                <Button
                  disabled={(dashboard.selected.length || dashboard.accounts.length) < 2 || dashboard.busy || dashboard.warmups.some((job) => job.status === 'running')}
                  onClick={() => dashboard.setWarmupOpen(true)}
                >
                  Прогреть аккаунты
                </Button>
              </>
            )}
            <Button
              disabled
              title="Выполнение задач ещё не подключено"
              icon={<ThunderboltFilled aria-hidden="true" />}
              onClick={dashboard.openLaunch}
            >
              Создать задачу
            </Button>
          </>
        }
      />
      <WorkspaceStats
        total={dashboard.accounts.length}
        ready={dashboard.ready.length}
        working={dashboard.working}
        attention={dashboard.attention}
        activeTasks={dashboard.activeTasks.length + dashboard.warmups.filter((job) => job.status === 'running').length}
      />
      {(dashboard.page === 'accounts' || dashboard.page === 'tasks') && (
        <WarmupPanel jobs={dashboard.warmups} workerOnline={dashboard.warmupWorkerOnline} busy={dashboard.busy} onStop={dashboard.stopWarmup} />
      )}
      {dashboard.page === 'accounts' && (
        <AccountsView
          accounts={dashboard.accounts}
          draftOwner={dashboard.session.username ?? ''}
          selected={dashboard.selected}
          compact={dashboard.preferences.compact}
          onSelect={dashboard.setSelected}
          onDetails={(account) => dashboard.setDetailsId(account.id)}
          onDelete={dashboard.deleteAccount}
          onCheck={dashboard.checkAccounts}
          onLaunch={dashboard.openLaunch}
          config={dashboard.config}
          events={dashboard.events}
          showActivity={dashboard.preferences.showActivity}
          onConfigure={() => dashboard.configure('mode')}
          onViewActivity={() => dashboard.setPage('activity')}
        />
      )}
      {dashboard.page === 'tasks' && (
        <TasksView
          tasks={dashboard.tasks}
          onToggle={dashboard.toggleTask}
          onStop={dashboard.stopTask}
          onCreate={dashboard.openLaunch}
        />
      )}
      {dashboard.page === 'activity' && (
        <ActivityView events={dashboard.events} full />
      )}
    </AppLayout>
  )
}
