import { useRef, useState } from 'react'
import { App, Form, Checkbox } from 'antd'
import { Button, FormField, Input, Modal, NumberInput, Select, TextArea } from '../UI'
import type { Account } from '../../types'

interface ReportFields {
  kind?: 'peer' | 'message'
  accountIds?: string[]
  target?: string
  reason?: string
  comment?: string
  duration?: number | null
  confirmed?: boolean
}

interface ReportReply {
  id: string
  state: string
  title?: string
  options?: { value: string; label: string }[]
}

interface ApiReply {
  authenticated?: boolean
  csrfToken?: string
  report?: ReportReply
  error?: string
}

interface BulkReportMockupModalProps {
  accounts: Account[]
  selected: string[]
  draftOwner: string
  onClose: () => void
}

const reasonOptions = [
  { value: 'spam', label: 'Спам' },
  { value: 'violence', label: 'Насилие' },
  { value: 'pornography', label: 'Порнография' },
  { value: 'child_abuse', label: 'Насилие над детьми' },
  { value: 'copyright', label: 'Нарушение авторских прав' },
  { value: 'fake', label: 'Выдаёт себя за другого' },
  { value: 'illegal_drugs', label: 'Незаконные наркотики' },
  { value: 'personal_details', label: 'Публикация личных данных' },
  { value: 'geo_irrelevant', label: 'Неверная геолокация группы' },
  { value: 'other', label: 'Другое' },
]

function loadDraft(
  key: string | null,
  defaults: ReportFields,
  readyIds: Set<string>,
): ReportFields {
  if (!key) return defaults

  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')

    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
      return defaults
    }

    const draft = stored as Record<string, unknown>

    return {
      kind: draft.kind === 'message' ? 'message' : 'peer',
      accountIds: Array.isArray(draft.accountIds)
        ? [...new Set(draft.accountIds.filter(
          (id): id is string => typeof id === 'string' && readyIds.has(id),
        ))]
        : defaults.accountIds,
      target: typeof draft.target === 'string'
        ? draft.target.slice(0, 512)
        : '',
      reason: typeof draft.reason === 'string'
        && reasonOptions.some((option) => option.value === draft.reason)
        ? draft.reason
        : undefined,
      comment: typeof draft.comment === 'string'
        ? draft.comment.slice(0, 1000)
        : '',
      duration: typeof draft.duration === 'number'
        && Number.isInteger(draft.duration)
        && draft.duration >= 1
        && draft.duration <= 1440
        ? draft.duration
        : 60,
      confirmed: false,
    }
  } catch {
    return defaults
  }
}

export default function BulkReportMockupModal({
  accounts,
  selected,
  draftOwner,
  onClose,
}: BulkReportMockupModalProps) {
  const { message } = App.useApp()
  const [form] = Form.useForm<ReportFields>()
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)

  const values: ReportFields = Form.useWatch([], form) ?? {}
  const kind = values.kind ?? 'peer'
  const accountIds = values.accountIds ?? []
  const ready = accounts.filter((account) => account.status === 'ready')

  const storageKey = draftOwner
    ? `histeria.report-form-draft.v1:${encodeURIComponent(draftOwner)}`
    : null

  const [initialValues] = useState(() => loadDraft(
    storageKey,
    {
      kind: 'peer',
      accountIds: ready
        .filter((account) => selected.includes(account.id))
        .map((account) => account.id),
      duration: 60,
      confirmed: false,
    },
    new Set(ready.map((account) => account.id)),
  ))

  const complete = accountIds.length > 0
    && accountIds.every((id) => ready.some((account) => account.id === id))
    && (values.kind === 'peer' || values.kind === 'message')
    && !!values.target?.trim()
    && reasonOptions.some((option) => option.value === values.reason)
    && !!values.comment?.trim()
    && typeof values.duration === 'number'
    && Number.isInteger(values.duration)
    && values.duration >= 1
    && values.duration <= 1440
    && values.confirmed === true

  function saveDraft(notify = true) {
    if (!storageKey) {
      message.error('Не удалось определить пользователя для сохранения черновика.')
      return false
    }

    const { kind, accountIds, target, reason, comment, duration } =
      form.getFieldsValue()

    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ kind, accountIds, target, reason, comment, duration }),
      )

      if (notify) {
        message.success('Черновик сохранён в этом браузере.')
      }

      return true
    } catch {
      message.error(
        'Не удалось сохранить черновик. Проверь доступность хранилища браузера.',
      )
      return false
    }
  }

  async function massReport() {
    if (sendingRef.current || !complete || !saveDraft(false)) return

    const fields = form.getFieldsValue()
    const ids = new Set(fields.accountIds ?? [])
    const recipients = ready.filter((account) => ids.has(account.id))

    if (!recipients.length) return

    const payload = {
      kind: fields.kind,
      target: fields.target?.trim(),
      reason: fields.reason,
      message: fields.comment?.trim(),
    }

    const start = Date.now()
    const durationMs = Number(fields.duration) * 60_000
    const deadline = start + durationMs
    const intervalMs = durationMs / recipients.length
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), durationMs)

    let csrfToken = ''

    sendingRef.current = true
    setSending(true)

    async function request(
      path: string,
      data?: Record<string, unknown>,
    ): Promise<ApiReply> {
      if (controller.signal.aborted || Date.now() >= deadline) {
        throw new Error('Период отправки завершён.')
      }

      const response = await fetch(`/api${path}`, {
        method: data === undefined ? 'GET' : 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
        headers: data === undefined ? {} : {
          'Content-Type': 'application/json',
          'X-CSRFToken': csrfToken,
        },
        body: data === undefined ? undefined : JSON.stringify(data),
      })

      let reply: ApiReply

      try {
        reply = await response.json()
      } catch {
        throw new Error(
          `Сервер вернул некорректный ответ (HTTP ${response.status}).`,
        )
      }

      if (!response.ok) {
        throw new Error(reply.error || `HTTP ${response.status}`)
      }

      return reply
    }

    function waitUntil(time: number) {
      return new Promise<void>((resolve, reject) => {
        const signal = controller.signal
        const expired = () => reject(
          new Error('Период отправки завершён.'),
        )

        if (signal.aborted) return expired()

        const timer = window.setTimeout(() => {
          signal.removeEventListener('abort', abort)
          resolve()
        }, Math.max(0, time - Date.now()))

        function abort() {
          window.clearTimeout(timer)
          expired()
        }

        signal.addEventListener('abort', abort, { once: true })
      })
    }

    try {
      const session = await request('/status/')

      if (!session.authenticated || !session.csrfToken) {
        throw new Error('Войди в панель и повтори отправку.')
      }

      csrfToken = session.csrfToken

      const results = await Promise.all(
        recipients.map(async (account, index) => {
          try {
            await waitUntil(start + index * intervalMs)

            const path =
              `/accounts/${encodeURIComponent(account.id)}/report/`

            let report = (await request(path, payload)).report

            for (let step = 0; step <= 12; step += 1) {
              if (!report?.id) {
                throw new Error('Сервер не вернул черновик жалобы.')
              }

              if (report.state === 'reported') {
                console.info(
                  `${account.name}: приём жалобы подтверждён`,
                  report.id,
                )
                return true
              }

              if (step === 12) {
                throw new Error('Превышено число этапов подтверждения.')
              }

              const data: Record<string, unknown> = {
                confirmed: true,
              }

              if (report.state === 'choose') {
                const options = report.options ?? []

                if (!options.length) {
                  throw new Error('Сервер не вернул причины жалобы.')
                }

                let option: { value: string; label: string } | undefined

                do {
                  const chosen = window.prompt([
                    account.name,
                    report.title || 'Выбери причину жалобы',
                    ...options.map(
                      (item, i) => `${i + 1}. ${item.label}`,
                    ),
                    'Введи номер. Отмена остановит жалобу этого аккаунта.',
                  ].join('\n'))

                  if (chosen === null) {
                    throw new Error('Выбор причины отменён.')
                  }

                  const number = Number(chosen)

                  option = Number.isInteger(number)
                    ? options[number - 1]
                    : undefined
                } while (!option)

                data.option = option.value
              } else if (report.state === 'comment') {
                data.message = payload.message
              } else if (report.state !== 'confirm') {
                throw new Error(
                  `Отправка не подтверждена: ${report.state}.`,
                )
              }

              report = (
                await request(
                  `${path}${encodeURIComponent(report.id)}/`,
                  data,
                )
              ).report
            }

            throw new Error('Превышено число этапов подтверждения.')
          } catch (error) {
            console.error(
              `${account.name}: приём жалобы не подтверждён`,
              error,
            )
            return false
          }
        }),
      )

      const confirmed = results.filter(Boolean).length
      const text =
        `Подтверждено: ${confirmed}. ` +
        `Не подтверждено: ${results.length - confirmed}.`

      if (confirmed === results.length) {
        message.success(text)
      } else {
        message.warning(text)
      }
    } catch (error) {
      message.error(
        error instanceof Error
          ? error.message
          : 'Не удалось запустить отправку.',
      )
    } finally {
      window.clearTimeout(timeout)
      sendingRef.current = false
      setSending(false)
    }
  }

  return (
    <Modal
      open
      title="Массовый репорт"
      width={600}
      onCancel={onClose}
      footer={
        <>
          <Button onClick={onClose}>
            Закрыть
          </Button>
          <Button
            onClick={() => saveDraft()}
            title="Сохранить поля формы в этом браузере"
          >
            Сохранить черновик
          </Button>
          <Button
            type="primary"
            loading={sending}
            disabled={!complete || sending}
            title={!complete ? 'Заполни все поля и подтверди данные' : undefined}
            onClick={massReport}
          >
            Отправить жалобы
          </Button>
        </>
      }
    >
      <Form
        form={form}
        component={false}
        layout="vertical"
        initialValues={initialValues}
        disabled={sending}
      >
        <FormField
          name="accountIds"
          label="Аккаунты"
          required
          extra={
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                Выбрано: {accountIds.length}. Готовых аккаунтов: {ready.length}.
              </span>
              <Button
                size="small"
                type="link"
                disabled={!ready.length || sending}
                title="Выбрать все готовые аккаунты"
                onClick={() => form.setFieldsValue({
                  accountIds: ready.map((account) => account.id),
                  confirmed: false,
                })}
              >
                Выбрать всех
              </Button>
            </div>
          }
        >
          <Select<string[]>
            mode="multiple"
            allowClear
            optionFilterProp="label"
            maxTagCount="responsive"
            placeholder={ready.length ? 'Выбери аккаунты' : 'Нет готовых аккаунтов'}
            disabled={!ready.length || sending}
            options={ready.map((account) => ({
              value: account.id,
              label: `${account.name} · ${account.phone}`,
            }))}
          />
        </FormField>

        <FormField label="Количество аккаунтов">
          <NumberInput
            className="w-full"
            value={accountIds.length}
            readOnly
            controls={false}
            aria-label="Количество выбранных аккаунтов"
          />
        </FormField>

        <FormField
          name="kind"
          label="На что подать жалобу"
          required
        >
          <Select
            options={[
              { value: 'peer', label: 'Аккаунт или чат' },
              { value: 'message', label: 'Сообщение' },
            ]}
          />
        </FormField>

        <FormField
          name="target"
          label={
            kind === 'message'
              ? 'Ссылка на сообщение'
              : 'Username или ссылка на аккаунт/чат'
          }
          required
        >
          <Input
            maxLength={512}
            placeholder={
              kind === 'message'
                ? 'https://t.me/channel/123'
                : '@username или https://t.me/username'
            }
          />
        </FormField>

        <FormField name="reason" label="Причина" required>
          <Select
            options={reasonOptions}
            placeholder="Выбери причину"
          />
        </FormField>

        <FormField name="comment" label="Пояснение" required>
          <TextArea
            maxLength={1000}
            showCount
            autoSize={{ minRows: 3, maxRows: 6 }}
            placeholder="Опиши нарушение"
          />
        </FormField>

        <FormField
          name="duration"
          label="Период отправки, минут"
          required
        >
          <NumberInput
            className="w-full"
            min={1}
            max={1440}
            precision={0}
            addonAfter="мин"
          />
        </FormField>

        <FormField name="confirmed" valuePropName="checked">
          <Checkbox>
            Подтверждаю указанные данные
          </Checkbox>
        </FormField>
      </Form>
    </Modal>
  )
}