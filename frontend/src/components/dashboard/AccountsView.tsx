import AccountTable from '../accounts/AccountTable'
import type { AccountTableProps } from '../accounts/AccountTable'
import ActivityView from '../activity/ActivityView'
import ModeStrip from './ModeStrip'
import QuickStartCard from './QuickStartCard'
import type { Activity, TaskConfig } from '../../types'
interface Props extends AccountTableProps {
  config: TaskConfig
  events: Activity[]
  showActivity: boolean
  onConfigure: () => void
  onViewActivity: () => void
}
export default function AccountsView({
  config,
  events,
  showActivity,
  onConfigure,
  onViewActivity,
  ...tableProps
}: Props) {
  return (
    <>
      <ModeStrip config={config} onConfigure={onConfigure} />
      <AccountTable {...tableProps} />
      <div className={`bottom-grid ${!showActivity ? 'without-activity' : ''}`}>
        {showActivity && (
          <ActivityView events={events} onViewAll={onViewActivity} />
        )}
        <QuickStartCard onCreate={tableProps.onLaunch} />
      </div>
    </>
  )
}
