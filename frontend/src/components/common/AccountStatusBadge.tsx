import { StatusBadge } from '../UI'
import { statusLabels } from '../../data'
import type { AccountStatus } from '../../types'
export default function AccountStatusBadge({
  status,
}: {
  status: AccountStatus
}) {
  return <StatusBadge label={statusLabels[status]} variant={status} />
}
