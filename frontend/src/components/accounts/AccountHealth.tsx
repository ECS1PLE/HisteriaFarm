import { Tooltip } from 'antd'
import { CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined, QuestionCircleOutlined } from '@ant-design/icons'
import type { Account } from '../../types'
import { checkedAt } from '../../utils/checkTime'

export default function AccountHealth({ account, kind, showTime = true }: { account: Account; kind: 'session' | 'spam'; showTime?: boolean }) {
  const status = kind === 'session' ? account.sessionStatus : account.spamStatus
  const labels = { unchecked: 'Не проверено', valid: 'Действительна', invalid: 'Недействительна', clear: 'Без ограничений', restricted: 'Спамблок', unknown: 'Не определено', error: 'Ошибка проверки' }
  const tone = status === 'valid' || status === 'clear' ? 'success' : status === 'invalid' || status === 'restricted' ? 'danger' : status === 'error' ? 'warning' : 'neutral'
  const Icon = tone === 'success' ? CheckCircleOutlined : tone === 'danger' ? CloseCircleOutlined : status === 'unchecked' ? ClockCircleOutlined : QuestionCircleOutlined
  const time = kind === 'session' ? account.sessionCheckedAt : account.spamCheckedAt
  const detail = kind === 'session' ? account.sessionError : account.spamDetail
  return (
    <Tooltip title={detail || checkedAt(time)}>
      <div className="account-health">
        <span className={`health-badge health-${tone}`}><Icon aria-hidden="true" />{labels[status] ?? labels.unchecked}</span>
        {showTime && <small>{checkedAt(time)}</small>}
      </div>
    </Tooltip>
  )
}
