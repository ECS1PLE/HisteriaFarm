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
        <small>
          {account.country === 'RU' ? 'Россия' : 'Германия'}{' '}
          <span>· SOCKS5</span>
        </small>
      </span>
    </div>
  )
}
