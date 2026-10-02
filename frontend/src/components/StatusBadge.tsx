import { statusLabels } from '../data'
import type { AccountStatus } from '../types'
export default function StatusBadge({ status }: { status: AccountStatus }) {
  return (
    <span className={`status-badge status-${status}`}>
      <span />
      {statusLabels[status]}
    </span>
  )
}
