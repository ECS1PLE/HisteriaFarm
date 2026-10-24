import { useEffect, useRef, useState } from 'react'
import { Checkbox, Progress } from 'antd'
import { Button, DataTable, Field, Modal, Notice, Select, TextArea } from '../UI'
import { cancelPublication, getPublication, preparePublication, sendPublicationDelivery, skipPublicationAccount } from '../../services/publications'
import { runPublicationQueue } from '../../services/publicationQueue'
import { ApiError } from '../../services/api'
import type { Publication, PublicationDelivery, PublicationMode } from '../../services/publications'
import type { Account } from '../../types'
import ReactionPicker from '../config/ReactionPicker'
import { reactionOptions } from '../../data'
const stateLabels: Record<PublicationDelivery['state'], string> = {
  pending: 'Ожидает', sending: 'Отправляется', sent: 'Отправлено', requested: 'Заявка отправлена',
  failed: 'Ошибка', unknown: 'Результат неизвестен', skipped: 'Пропущено',
}
export default function OwnedPublicationModal({ accounts, selected, initialMode = 'messages', onClose, onPublished }: {
  accounts: Account[]
  selected: string[]
  initialMode?: PublicationMode
  onClose: () => void
  onPublished: () => Promise<void>
}) {
  const ready = accounts.filter((account) => account.status === 'ready')
  const [mode, setMode] = useState<PublicationMode>(initialMode)
  const [accountIds, setAccountIds] = useState(() => ready.filter((account) => !selected.length || selected.includes(account.id)).map((account) => account.id))
  const [links, setLinks] = useState('')
  const [text, setText] = useState('')
  const [reaction, setReaction] = useState('👍')
  const [publication, setPublication] = useState<Publication>()
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)
  const [error, setError] = useState('')
  const stop = useRef(false)
  const inFlight = useRef(false)
  useEffect(() => () => { stop.current = true }, [])
  const targets = links.split('\n').map((link) => link.trim()).filter(Boolean)
  const valid =
    accountIds.length >= 1 && accountIds.length <= 100 && accountIds.every((id) => ready.some((account) => account.id === id)) &&
    targets.length >= 1 && targets.length <= 10 && targets.every((link) => link.length <= 512) &&
    (mode === 'subscriptions' || (mode === 'reactions' ? reactionOptions.includes(reaction) : !!text.trim() && text.length <= 4096))
  const prepare = async () => {
    if (inFlight.current || !valid) return
    inFlight.current = true
    setBusy(true)
    setError('')
    try {
      const result = await preparePublication({ mode, text, targets, accountIds, reaction: mode === 'reactions' ? reaction : undefined })
      setPublication(result.publication)
      setConfirmed(false)
      setFinished(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось проверить адресатов')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  const close = async () => {
    if (busy || running || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      if (publication) await cancelPublication(publication.id)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось закрыть публикацию')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  const edit = async () => {
    if (!publication || busy || running || inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      await cancelPublication(publication.id)
      setPublication(undefined)
      setConfirmed(false)
      setFinished(false)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось остановить предыдущую публикацию')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }
  const mark = (delivery: PublicationDelivery) => setPublication((previous) => previous ? {
    ...previous, deliveries: previous.deliveries.map((item) => item.id === delivery.id ? delivery : item),
  } : previous)
  const send = async () => {
    if (!publication || !confirmed || inFlight.current || finished || publication.cancelled) return
    inFlight.current = true
    stop.current = false
    setRunning(true)
    setError('')
    try {
      const stopped = await runPublicationQueue(publication.deliveries, {
        shouldStop: () => stop.current,
        send: (delivery) => sendPublicationDelivery(publication.id, delivery.id),
        skipAccount: (delivery) => skipPublicationAccount(publication.id, delivery.id),
        isFatalError: (e) => e instanceof ApiError && [401, 403, 404, 409].includes(e.status),
        onSending: mark,
        onResult: mark,
        onSkipped: (accountId, detail) => setPublication((previous) => previous ? {
          ...previous,
          deliveries: previous.deliveries.map((item) => item.accountId === accountId && item.state === 'pending'
            ? { ...item, state: 'skipped', error: `Аккаунт пропущен: ${detail}` } : item),
        } : previous),
      })
      if (stopped) stop.current = true
    } catch (e) {
      stop.current = true
      setError(e instanceof Error ? e.message : 'Результат отправки неизвестен')
    } finally {
      try {
        const result = stop.current ? await cancelPublication(publication.id) : await getPublication(publication.id)
        setPublication(result.publication)
        if (result.publication.error) setError(result.publication.error)
      } catch {
        setError('Не удалось получить итоговый статус. Результат последнего действия может быть неизвестен. Автоматического повтора не будет.')
      }
      try { await onPublished() } catch { setError((previous) => previous || 'Результаты отправки сохранены, но не удалось обновить панель.') }
      inFlight.current = false
      setRunning(false)
      setFinished(true)
      setConfirmed(false)
    }
  }
  const completed = publication?.deliveries.filter((delivery) => !['pending', 'sending'].includes(delivery.state)).length ?? 0
  const sent = publication?.deliveries.filter((delivery) => delivery.state === 'sent').length ?? 0
  const requested = publication?.deliveries.filter((delivery) => delivery.state === 'requested').length ?? 0
  const frozen = busy || running
  return <Modal open title={mode === 'subscriptions' ? 'Массовая подписка на канал' : mode === 'reactions' ? 'Реакции со всех аккаунтов' : mode === 'direct' ? 'Личные сообщения со всех аккаунтов' : 'Сообщения и комментарии'} width={760}
    onCancel={() => void close()} closable={!frozen} maskClosable={!frozen} keyboard={!frozen}
    footer={<div className="generator-footer">
      {running ? <Button onClick={() => { stop.current = true }}>Остановить после текущего</Button> : <Button disabled={busy} onClick={() => void close()}>Закрыть</Button>}
      {publication && !running && <Button disabled={busy} onClick={() => void edit()}>{finished ? 'Новое действие' : 'Изменить'}</Button>}
      {!finished && <Button type="primary" loading={frozen} disabled={publication ? !confirmed || publication.cancelled : !valid}
        onClick={() => void (publication ? send() : prepare())}>
        {publication ? `${publication.mode === 'subscriptions' ? 'Подписаться' : publication.mode === 'reactions' ? 'Поставить реакции' : 'Отправить'} (${publication.deliveries.length})` : 'Проверить и продолжить'}
      </Button>}
    </div>}>
    {error && <Notice className="mb-4" type="error" title={error} />}
    {!publication ? <>
      <Field label="Что сделать" htmlFor="publication-mode">
        <Select id="publication-mode" className="w-full" disabled={frozen} value={mode} onChange={setMode}
          options={[{ value: 'subscriptions', label: 'Подписка на каналы' }, { value: 'reactions', label: 'Реакции на пост / сообщение' }, { value: 'direct', label: 'Личные сообщения пользователям' }, { value: 'messages', label: 'Сообщения в чаты / каналы' }, { value: 'comments', label: 'Комментарии под постами каналов' }]} />
      </Field>
      <Field label={mode === 'subscriptions' ? 'Аккаунты для подписки' : mode === 'reactions' ? 'Аккаунты для реакций' : 'Аккаунты отправителей'} htmlFor="publication-accounts" action={<Button size="small" disabled={frozen || !ready.length}
        onClick={() => setAccountIds(ready.map((account) => account.id))}>Выбрать всех</Button>} help={`Выбрано: ${accountIds.length} из ${ready.length} готовых. ${mode === 'subscriptions' ? 'Каждый выбранный аккаунт подписывается на указанные каналы.' : mode === 'reactions' ? 'Одна реакция от каждого аккаунта на каждое сообщение.' : `По одному ${mode === 'comments' ? 'комментарию' : 'сообщению'} от каждого аккаунта каждому адресату.`}`}>
        <Select<string[]> id="publication-accounts" className="w-full" mode="multiple" allowClear maxTagCount="responsive" optionFilterProp="label" disabled={frozen}
          value={accountIds} onChange={setAccountIds} options={ready.map((account) => ({ value: account.id, label: `${account.name} · ${account.phone}` }))} />
      </Field>
      <Field label={mode === 'subscriptions' ? 'Ссылки на каналы' : mode === 'reactions' ? 'Ссылка на пост или сообщение' : mode === 'direct' ? 'Получатели личных сообщений' : mode === 'messages' ? 'Ссылки на чаты / каналы' : 'Ссылки на посты каналов'} htmlFor="publication-targets"
        help={mode === 'subscriptions' ? 'От 1 до 10 каналов, по одному на строку: @username, t.me/channel или пригласительная ссылка. Если нужно одобрение, будет отправлена заявка. Платные подписки не поддерживаются.' : mode === 'reactions' ? 'Ссылка на конкретное сообщение в канале или группе. Можно указать до 10 ссылок, по одной на строку. Для приватных сообщений t.me/c аккаунтам нужен доступ к чату.' : mode === 'direct' ? 'От 1 до 10 получателей, по одному на строку: @username, прямая ссылка t.me или телефон с кодом страны. Поиск по телефону зависит от настроек приватности получателя.' : 'От 1 до 10 ссылок, по одной на строку. Аккаунты должны уже иметь необходимый доступ к чатам. Приватная пригласительная ссылка поддерживается для сообщений без автоматического вступления.'}>
        <TextArea id="publication-targets" disabled={frozen} value={links} onChange={(e) => setLinks(e.target.value)} autoSize={{ minRows: 3, maxRows: 6 }}
          placeholder={mode === 'subscriptions' ? 'https://t.me/my_channel\nhttps://t.me/+invite' : mode === 'direct' ? '@username\nhttps://t.me/recipient\n+79991234567' : mode === 'messages' ? 'https://t.me/my_chat\nhttps://t.me/+invite' : 'https://t.me/my_channel/123\nhttps://t.me/c/123456/78'} />
      </Field>
      {mode === 'reactions' ? <ReactionPicker value={reaction} disabled={frozen} onChange={setReaction} /> : mode !== 'subscriptions' && <Field label={mode === 'comments' ? 'Текст комментария' : 'Текст сообщения'} htmlFor="publication-text" help="Одинаковый текст для всех выбранных отправителей. До 4096 символов, без автоматического форматирования.">
        <TextArea id="publication-text" disabled={frozen} maxLength={4096} showCount value={text} onChange={(e) => setText(e.target.value)} autoSize={{ minRows: 4, maxRows: 10 }} />
      </Field>}
      <Notice title={mode === 'subscriptions' ? 'Подписка от выбранных аккаунтов' : mode === 'reactions' ? 'Реакции от выбранных аккаунтов' : 'Отправка от выбранных аккаунтов'} description="Действия выполняются последовательно. При ошибке аккаунт и его оставшиеся действия пропускаются, очередь продолжается со следующим аккаунтом. Неизвестный результат не повторяется. Можно остановиться после текущего действия." />
    </> : <>
      <p>{publication.mode === 'subscriptions' ? 'Подписок' : publication.mode === 'reactions' ? 'Реакций' : publication.mode === 'direct' ? 'Личных сообщений' : 'Отправок'}: <strong>{publication.deliveries.length}</strong> · аккаунтов: <strong>{new Set(publication.deliveries.map((delivery) => delivery.accountId)).size}</strong> · адресатов: <strong>{publication.targets.length}</strong>.</p>
      <ul>{publication.targets.map((target, index) => <li key={index}>{target.title}{target.discussionTitle ? ` → ${target.discussionTitle}` : ''} · {target.link}{target.requestNeeded && ' · Нужно одобрение администратора'}{target.messagePreview && <p className="reaction-message-preview">{target.messagePreview}</p>}</li>)}</ul>
      {publication.mode === 'reactions' ? <Field label="Выбранная реакция"><div className="reaction-preview">{publication.reaction}</div></Field> : publication.mode !== 'subscriptions' && <Field label="Текст для отправки"><div className="whitespace-pre-wrap">{publication.text}</div></Field>}
      {!finished && <p><Checkbox disabled={frozen} checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)}>
        {publication.mode === 'subscriptions' ? 'Подтверждаю подписку на указанные каналы от выбранных аккаунтов.' : publication.mode === 'reactions' ? 'Подтверждаю реакцию, сообщения и выбранные аккаунты.' : 'Подтверждаю текст, адресатов и отправку от указанных аккаунтов.'}
      </Checkbox></p>}
      {(running || finished) && <><Progress percent={Math.round(completed / Math.max(publication.deliveries.length, 1) * 100)} /><p>{publication.mode === 'subscriptions' ? 'Подписаны' : publication.mode === 'reactions' ? 'Реакций поставлено' : 'Отправлено'}: {sent} из {publication.deliveries.length}.{publication.mode === 'subscriptions' && ` Заявок на одобрение: ${requested}.`}</p></>}
      {finished && <Notice className="mb-4" title="Обработка завершена" description="Результаты указаны ниже. При неизвестном результате действие не повторяется." />}
      <DataTable<PublicationDelivery> rowKey="id" size="small" dataSource={publication.deliveries} pagination={{ pageSize: 8, showSizeChanger: false }} scroll={{ x: 560 }}
        columns={[
          { title: 'Аккаунт', dataIndex: 'name' },
          { title: 'Адресат', render: (_, delivery) => publication.targets[delivery.targetIndex]?.title },
          { title: 'Результат', render: (_, delivery) => <span>{!running && delivery.state === 'sending' ? 'Результат неизвестен' : publication.mode === 'subscriptions' && delivery.state === 'sent' ? 'Подписан' : publication.mode === 'subscriptions' && delivery.state === 'sending' ? 'Подписывается' : publication.mode === 'reactions' && delivery.state === 'sent' ? 'Реакция поставлена' : publication.mode === 'reactions' && delivery.state === 'sending' ? 'Применяется' : stateLabels[delivery.state]}{delivery.messageId ? ` · ID ${delivery.messageId}` : ''}{delivery.error && <><br />{delivery.error}</>}</span> },
        ]} />
    </>}
  </Modal>
}
