import { Progress } from 'antd'
import { SafetyCertificateOutlined, KeyOutlined, ArrowRightOutlined } from '@ant-design/icons'
import { Button, Panel } from '../UI'
import type { Account, CheckKind, CheckProgress } from '../../types'

export default function AccountCheckPanel({ accounts, selected, busy, progress, onCheck, onStop }: {
  accounts: Account[]; selected: string[]; busy: boolean; progress: CheckProgress | null
  onCheck: (account?: Account, kind?: CheckKind) => void; onStop: () => void
}) {
  const valid = accounts.filter((a) => a.sessionStatus === 'valid').length
  const restricted = accounts.filter((a) => a.spamStatus === 'restricted').length
  const unchecked = accounts.filter((a) => a.sessionStatus === 'unchecked' || a.spamStatus === 'unchecked').length
  return (
    <Panel className="check-panel">
      <div className="check-panel-intro">
        <span className="check-panel-icon"><SafetyCertificateOutlined aria-hidden="true" /></span>
        <div><div className="eyebrow">ЗДОРОВЬЕ АККАУНТОВ</div><h2>Уверенность перед запуском</h2><p>Проверь доступ к Telegram и ограничения на отправку сообщений.</p></div>
      </div>
      <div className="check-metrics">
        <span><strong>{valid}<small> / {accounts.length}</small></strong>Сессии действительны</span>
        <span className={restricted ? 'check-metric-warning' : ''}><strong>{restricted}</strong>Со спамблоком</span>
        <span><strong>{unchecked}</strong>Ждут проверки</span>
      </div>
      <div className="check-panel-actions">
        <Button icon={<KeyOutlined aria-hidden="true" />} disabled={busy || !accounts.length} onClick={() => onCheck(undefined, 'session')}>Проверить сессии</Button>
        <Button type="primary" icon={<SafetyCertificateOutlined aria-hidden="true" />} disabled={busy || !accounts.length} onClick={() => onCheck(undefined, 'spam')}>Проверить спамблоки <ArrowRightOutlined aria-hidden="true" /></Button>
        <small>{selected.length ? `Для выбранных: ${selected.length}` : 'Для всех аккаунтов'} · спамблок через @SpamBot</small>
      </div>
      {progress && <div className="check-progress" role="status" aria-live="polite">
        <div><strong>{progress.kind === 'session' ? 'Проверяем сессии' : progress.kind === 'spam' ? 'Проверяем спамблоки' : 'Проверяем аккаунты'}</strong><span>{progress.done} / {progress.total} · {progress.current}</span></div>
        <Progress percent={Math.round(progress.done / Math.max(progress.total, 1) * 100)} showInfo={false} strokeColor="#b6ed88" size="small" />
        <Button size="small" disabled={progress.stopping} onClick={onStop}>{progress.stopping ? 'Завершаем текущую проверку…' : 'Остановить после текущего'}</Button>
      </div>}
    </Panel>
  )
}
