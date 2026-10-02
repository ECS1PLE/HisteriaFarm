import { Tooltip } from 'antd'
import { CrownFilled } from '@ant-design/icons'
import { Avatar } from '../UI'
import type { Account } from '../../types'
export default function AccountIdentity({
  account,
  onClick,
}: {
  account: Account
  onClick: () => void
}) {
  return (
    <button type="button" className="account-cell" onClick={onClick}>
      <Avatar
        size={36}
        src={account.avatarUrl || undefined}
        name={account.name}
        color={account.color}
        bordered
      />
      <span>
        <strong>
          {account.name}
          {account.premium && (
            <Tooltip title="Telegram Premium">
              <CrownFilled aria-hidden="true" className="premium-icon" />
            </Tooltip>
          )}
        </strong>
        <small>
          {account.username ? '@' + account.username : 'Без username'}
        </small>
      </span>
    </button>
  )
}
