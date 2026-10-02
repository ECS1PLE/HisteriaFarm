import { PlusOutlined, ThunderboltFilled } from '@ant-design/icons'
import { Button } from '../components/UI'
import AppLayout from '../components/layout/AppLayout'
import Sidebar from '../components/layout/Sidebar'
import Topbar from '../components/layout/Topbar'
import PageHeading from '../components/layout/PageHeading'
import PageFooter from '../components/layout/PageFooter'
import WorkspaceStats from '../components/dashboard/WorkspaceStats'
import AccountsView from '../components/dashboard/AccountsView'
import WorkspaceDialogs from '../components/dashboard/WorkspaceDialogs'
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
  return (
    <AppLayout
      sidebar={
        <Sidebar
          page={dashboard.page}
          mode={dashboard.mode}
          accountCount={dashboard.accounts.length}
          runningCount={dashboard.activeTasks.length}
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
            <Button
              type="primary"
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
        activeTasks={dashboard.activeTasks.length}
      />
      {dashboard.page === 'accounts' && (
        <AccountsView
          accounts={dashboard.accounts}
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
