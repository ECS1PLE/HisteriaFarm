import { ConnectionDot } from '../UI'
import type { Account } from '../../types'
export default function ProxyCell({ account }: { account: Account }) {
  return (
    <div className="proxy-cell">
      <ConnectionDot
        tone={
          account.status === 'error'
            ? 'bad'
            : account.status === 'offline'
              ? 'muted'
              : 'default'
        }
      />
      <span>
        {account.proxy}
        <small>Прямое подключение</small>
      </span>
    </div>
  )
}
