import AddAccountModal from '../accounts/AddAccountModal'
import AccountDetailsDrawer from '../accounts/AccountDetailsDrawer'
import ConfigDrawer from '../config/ConfigDrawer'
import CreateTaskModal from '../tasks/CreateTaskModal'
import SettingsDrawer from '../settings/SettingsDrawer'
import type { useDashboard } from '../../hooks/useDashboard'
type Controller = ReturnType<typeof useDashboard>
export default function WorkspaceDialogs({
  controller,
}: {
  controller: Controller
}) {
  return (
    <>
      {controller.configuration && (
        <ConfigDrawer
          key={`${controller.configuration.section}-${controller.configuration.config.mode}`}
          open
          section={controller.configuration.section}
          config={controller.configuration.config}
          onClose={() => controller.setConfiguration(null)}
          onSave={controller.saveConfig}
        />
      )}
      <AddAccountModal
        open={controller.addOpen}
        form={controller.accountForm}
        onClose={() => controller.setAddOpen(false)}
        onSubmit={controller.addAccount}
      />
      <CreateTaskModal
        open={controller.launchOpen}
        form={controller.taskForm}
        ready={controller.ready}
        config={controller.config}
        onClose={() => controller.setLaunchOpen(false)}
        onSubmit={controller.launch}
      />
      <AccountDetailsDrawer
        account={controller.detailAccount}
        tasks={controller.activeTasks}
        onClose={() => controller.setDetailsId(null)}
        onCheck={controller.checkAccounts}
        onDelete={controller.deleteAccount}
        onGroupChange={controller.changeGroup}
      />
      <SettingsDrawer
        open={controller.settingsOpen}
        preferences={controller.preferences}
        onClose={() => controller.setSettingsOpen(false)}
        onChange={controller.changePreferences}
      />
    </>
  )
}
