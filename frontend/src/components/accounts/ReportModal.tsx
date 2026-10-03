import { useEffect, useRef, useState } from 'react'
import { App, Checkbox } from 'antd'
import { FlagOutlined } from '@ant-design/icons'
import { Button, Field, Input, Modal, Notice, Select, TextArea } from '../UI'
import { api } from '../../services/api'
import type { Account } from '../../types'

interface Option { value: string; label: string }
interface Report {
  id: string
  state: 'confirm' | 'choose' | 'comment' | 'reported'
  target: string
  kind: 'peer' | 'message'
  title: string
  options: Option[]
  commentRequired: boolean
  reason: string
  selectedReasons: string[]
}

export function ReportAccountAction({ account, busy, onBusy, onReported }: {
  account: Account
  busy: boolean
  onBusy: (busy: boolean) => void
  onReported: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  return <>
    <Button block icon={<FlagOutlined aria-hidden="true" />} disabled={busy || account.status !== 'ready'} onClick={() => setOpen(true)}>
      Подать жалобу
    </Button>
    {open && <ReportModal account={account} onClose={() => setOpen(false)} onBusy={onBusy} onReported={onReported} />}
  </>
}

export default function ReportModal({ account, onClose, onBusy, onReported }: {
  account: Account
  onClose: () => void
  onBusy: (busy: boolean) => void
  onReported: () => Promise<void>
}) {
  const { message: toast } = App.useApp()
  const [kind, setKind] = useState<'peer' | 'message'>('peer')
  const [target, setTarget] = useState('')
  const [messageId, setMessageId] = useState('')
  const [reason, setReason] = useState<string>()
  const [reasons, setReasons] = useState<Option[]>([])
  const [comment, setComment] = useState('')
  const [report, setReport] = useState<Report>()
  const [option, setOption] = useState<string>()
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [failed, setFailed] = useState(false)
  const inFlight = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    void api<{ reasons: Option[] }>(`accounts/${account.id}/report/`, { signal: controller.signal })
      .then((data) => setReasons(data.reasons))
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Не удалось загрузить причины')
      })
    return () => controller.abort()
  }, [account.id])

  const formValid = !!target.trim() && (kind === 'message' || (!!reason && (reason !== 'other' || !!comment.trim())))
  const stepValid = !report ? formValid : confirmed &&
    (report.state !== 'choose' || option !== undefined) &&
    (report.state !== 'comment' || !report.commentRequired || !!comment.trim())
  const done = report?.state === 'reported'
  const submit = async () => {
    if (inFlight.current || !stepValid || failed || done) return
    inFlight.current = true
    setBusy(true)
    onBusy(true)
    setError('')
    try {
      const result = !report
        ? await api<{ report: Report }>(`accounts/${account.id}/report/`, {
          method: 'POST', body: { kind, target, messageId, reason, message: comment },
        })
        : await api<{ report: Report }>(`accounts/${account.id}/report/${report.id}/`, {
          method: 'POST', body: { confirmed: true, option, message: comment },
        })
      setReport(result.report)
      setOption(undefined)
      setConfirmed(false)
      if (result.report.state === 'reported') {
        toast.success('Telegram принял жалобу')
        void onReported().catch(() => toast.warning('Жалоба принята, но журнал не обновился. Обнови страницу.'))
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось подать жалобу')
      // Never replay a submission after a network error with an unknown outcome.
      if (report) setFailed(true)
    } finally {
      inFlight.current = false
      setBusy(false)
      onBusy(false)
    }
  }

  return <Modal open title="Подать жалобу в Telegram" onCancel={onClose} onOk={() => void submit()}
    okText={!report ? 'Далее' : report.kind === 'peer' || report.state === 'comment' ? 'Отправить жалобу' : 'Подтвердить и продолжить'}
    confirmLoading={busy} okButtonProps={{ disabled: !stepValid || failed }} cancelButtonProps={{ disabled: busy }}
    closable={!busy} maskClosable={!busy} keyboard={!busy}
    footer={done || failed ? <Button onClick={onClose}>Закрыть</Button> : undefined}>
    <p>Отправитель: <strong>{account.name}</strong> ({account.phone}).</p>
    {error && <Notice type="error" title={error} />}
    {failed && <p>Приём жалобы не подтверждён. Автоматического повтора не будет. При сетевой ошибке жалоба могла быть принята Telegram.</p>}
    {done ? <Notice type="success" title="Telegram принял жалобу" description="Это подтверждение приёма, а не решение модераторов." /> : !report ? <>
      <Field label="На что подать жалобу" htmlFor="report-kind">
        <Select id="report-kind" className="w-full" disabled={busy} value={kind} onChange={setKind}
          options={[{ value: 'peer', label: 'Аккаунт или чат' }, { value: 'message', label: 'Сообщение' }]} />
      </Field>
      <Field label={kind === 'peer' ? 'Username или ссылка на аккаунт/чат' : 'Ссылка на сообщение или username чата'} htmlFor="report-target">
        <Input id="report-target" disabled={busy} maxLength={512} value={target} onChange={(e) => setTarget(e.target.value)}
          placeholder={kind === 'peer' ? '@username или https://t.me/username' : 'https://t.me/channel/123'} />
      </Field>
      {kind === 'message' ? <>
        <Field label="ID сообщения, если указан только username" htmlFor="report-message-id" help="Для приватной ссылки t.me/c/… аккаунт должен иметь доступ к чату. Ссылки на комментарии не поддерживаются.">
          <Input id="report-message-id" disabled={busy} inputMode="numeric" maxLength={10} value={messageId} onChange={(e) => setMessageId(e.target.value)} />
        </Field>
        <p>Причины для этого сообщения предложит Telegram на следующем шаге.</p>
      </> : <Field label="Причина" htmlFor="report-reason">
        <Select id="report-reason" className="w-full" disabled={busy} options={reasons} value={reason} onChange={setReason} placeholder="Выбери фактическое нарушение" />
      </Field>}
      <Field label={`Пояснение${kind === 'peer' && reason === 'other' ? ' (обязательно)' : ' (необязательно)'}`} htmlFor="report-comment">
        <TextArea id="report-comment" disabled={busy} maxLength={1000} showCount autoSize={{ minRows: 3, maxRows: 6 }} value={comment} onChange={(e) => setComment(e.target.value)} />
      </Field>
    </> : <>
      <p>Цель: <strong>{report.target}</strong>{messageId && kind === 'message' ? ` · сообщение ${messageId}` : ''}.</p>
      {report.reason && <p>Причина: {report.reason}.</p>}
      {report.selectedReasons.length > 0 && <p>Выбранная причина: {report.selectedReasons.join(' → ')}.</p>}
      {report.state === 'confirm' && <>
        {comment && <p className="whitespace-pre-wrap">Пояснение: {comment}</p>}
        <p>{kind === 'message' ? 'После подтверждения запросим причины у Telegram. API может подтвердить приём на любом шаге; каждый запрос требует твоего подтверждения.' : 'После подтверждения жалоба будет отправлена модераторам Telegram.'}</p>
        <Button disabled={busy || failed} onClick={() => { setReport(undefined); setConfirmed(false) }}>Изменить данные</Button>
      </>}
      {report.state === 'choose' && <Field label={report.title} htmlFor="report-option">
        <Select id="report-option" className="w-full" disabled={busy || failed} value={option} onChange={(value) => { setOption(value); setConfirmed(false) }} options={report.options} placeholder="Выбери причину, предложенную Telegram" />
      </Field>}
      {report.state === 'comment' && <Field label={`Пояснение для модераторов${report.commentRequired ? ' (обязательно)' : ' (необязательно)'}`} htmlFor="report-final-comment">
        <TextArea id="report-final-comment" disabled={busy || failed} maxLength={1000} showCount autoSize={{ minRows: 3, maxRows: 6 }} value={comment}
          onChange={(e) => { setComment(e.target.value); setConfirmed(false) }} />
      </Field>}
      <p><Checkbox checked={confirmed} disabled={busy || failed} onChange={(e) => setConfirmed(e.target.checked)}>
        Подтверждаю указанное нарушение и отправку с аккаунта «{account.name}».
      </Checkbox></p>
    </>}
  </Modal>
}
