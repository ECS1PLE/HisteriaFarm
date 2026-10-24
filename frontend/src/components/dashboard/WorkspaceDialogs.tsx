import { useMemo, useState } from 'react'
import AddAccountModal from '../accounts/AddAccountModal'
import AccountDetailsDrawer from '../accounts/AccountDetailsDrawer'
import GenerateProfilesModal from '../accounts/GenerateProfilesModal'
import WarmupModal from '../accounts/WarmupModal'
import ConfigDrawer from '../config/ConfigDrawer'
import SettingsDrawer from '../settings/SettingsDrawer'
import type { useDashboard } from '../../hooks/useDashboard'
type Controller = ReturnType<typeof useDashboard>
export default function WorkspaceDialogs({
  controller,
}: {
  controller: Controller
}) {
  const [profileBusy, setProfileBusy] = useState(false)
  const targets = useMemo(
    () =>
      controller.selected.length
        ? controller.accounts.filter((a) => controller.selected.includes(a.id))
        : controller.accounts,
    [controller.accounts, controller.selected],
  )
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
      {controller.addOpen && (
        <AddAccountModal
          onClose={() => controller.setAddOpen(false)}
          onAdded={controller.refresh}
        />
      )}
      {controller.generationOpen && (
        <GenerateProfilesModal
          accounts={targets}
          selected={!!controller.selected.length}
          onClose={() => controller.setGenerationOpen(false)}
          onApplied={controller.refresh}
        />
      )}
      {controller.warmupOpen && (
        <WarmupModal accounts={targets} selected={!!controller.selected.length}
          onClose={() => controller.setWarmupOpen(false)} onStarted={controller.refresh} />
      )}
      <AccountDetailsDrawer
        account={controller.detailAccount}
        tasks={controller.activeTasks}
        onClose={() => {
          if (!profileBusy) controller.setDetailsId(null)
        }}
        onCheck={controller.checkAccounts}
        onDelete={controller.deleteAccount}
        onGroupChange={controller.changeGroup}
        onSaved={controller.refresh}
        onBusy={setProfileBusy}
        busy={profileBusy || controller.busy}
      />
      <SettingsDrawer
        open={controller.settingsOpen}
        preferences={controller.preferences}
        session={controller.session}
        onClose={() => controller.setSettingsOpen(false)}
        onChange={controller.changePreferences}
        onConnected={controller.connect}
        onLogout={controller.logout}
      />
    </>
  )
}
