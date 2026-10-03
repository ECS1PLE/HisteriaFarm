import { Button, Notice, Panel, PanelHeading } from '../UI'
import type { WarmupJob } from '../../types'

const labels = { running: 'Выполняется', completed: 'Завершён', cancelled: 'Остановлен', failed: 'Ошибка' }
const date = (value: string) => new Date(value).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function WarmupPanel({ jobs, workerOnline, busy, onStop }: {
  jobs: WarmupJob[]
  workerOnline: boolean
  busy: boolean
  onStop: (id: string) => void
}) {
  if (!jobs.length) return null
  return (
    <Panel className="warmup-panel">
      <PanelHeading title="Прогрев аккаунтов" count={jobs.length} />
      {!workerOnline && jobs.some((job) => job.status === 'running') && (
        <Notice type="warning" title="Отправка приостановлена: фоновый исполнитель недоступен" description="Перезапусти backend. Расписание сохранено; после запуска отправка продолжится, если 24 часа ещё не истекли." />
      )}
      {jobs.map((job) => {
        const next = job.participants.map((p) => p.nextMessageAt).filter((value): value is string => !!value).sort()[0]
        return (
          <div key={job.id} className="warmup-row">
            <div>
              <strong>{labels[job.status]} · {job.participants.length} аккаунтов</strong>
              <p className="muted-text">Отправлено: {job.sent} · с {date(job.startedAt)} до {date(job.endsAt)} · 40–80 минут</p>
              {job.status === 'running' && <p>Прошло {job.progress}% суток. {next ? `Следующая отправка: ${date(next)}` : 'Ожидание завершения суток.'}</p>}
              {job.error && <Notice type="error" title={job.error} />}
            </div>
            {job.status === 'running' && <Button danger loading={busy} onClick={() => onStop(job.id)}>Остановить прогрев</Button>}
          </div>
        )
      })}
    </Panel>
  )
}
