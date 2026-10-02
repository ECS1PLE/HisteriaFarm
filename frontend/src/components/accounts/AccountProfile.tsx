import { Avatar } from '../UI'
import AccountStatusBadge from '../common/AccountStatusBadge'
import type { Account } from '../../types'
export default function AccountProfile({ account }: { account: Account }) {
  return (
    <div className="detail-profile">
      <Avatar size={64} name={account.name} color={account.color} tint="25" />
      <h2>{account.name}</h2>
      <p>@{account.username}</p>
      <AccountStatusBadge status={account.status} />
    </div>
  )
}
