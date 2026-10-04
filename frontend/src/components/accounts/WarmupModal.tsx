import { useState } from 'react'
import { App } from 'antd'
import { Modal, Notice, TextArea } from '../UI'
import { api } from '../../services/api'
import type { Account } from '../../types'

const defaults = [
  'Автосообщение: привет! Как проходит день?',
  'Автосообщение: всё хорошо, спасибо! Какие планы на сегодня?',
  'Автосообщение: небольшой перерыв. Хорошего дня!',
  'Автосообщение: спасибо за сообщение, на связи.',
].join('\n')

export default function WarmupModal({ accounts, selected, onClose, onStarted }: {
  accounts: Account[]
  selected: boolean
  onClose: () => void
  onStarted: () => Promise<void>
}) {
  const { message } = App.useApp()
  const [texts, setTexts] = useState(defaults)
  const [busy, setBusy] = useState(false)
  const messages = texts.split('\n').map((line) => line.trim()).filter(Boolean)
  const valid = accounts.length >= 2 && accounts.length <= 100 && accounts.every((a) => a.status === 'ready') && messages.length >= 1 && messages.length <= 50 && messages.every((text) => text.length <= 1000)
  const start = async () => {
    setBusy(true)
    try {
      await api('warmups/', { method: 'POST', body: { accountIds: accounts.map((a) => a.id), messages } })
      message.success('Прогрев запущен на 24 часа')
      onClose()
      await onStarted()
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Не удалось запустить прогрев')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open title="Прогреть аккаунты" okText="Запустить на 24 часа" confirmLoading={busy}
      okButtonProps={{ disabled: !valid }} cancelButtonProps={{ disabled: busy }} closable={!busy}
      maskClosable={!busy} keyboard={!busy} onCancel={onClose} onOk={() => void start()}>
      <p>{selected ? 'Выбранные аккаунты' : 'Все аккаунты'}: {accounts.length}. {accounts.map((a) => a.name).join(', ')}</p>
      <Notice title="Личные сообщения между участниками" description="Каждый аккаунт отправляет одно сообщение случайному участнику раз в 40–80 минут. Первый интервал тоже случайный. Через 24 часа отправка прекратится. Можно закрыть вкладку; сервер должен оставаться включённым." />
      <p>Тексты сообщений — по одному на строку. Для каждой отправки выбирается случайная строка.</p>
      <TextArea aria-label="Тексты сообщений для прогрева" value={texts} onChange={(e) => setTexts(e.target.value)} autoSize={{ minRows: 5, maxRows: 10 }} />
      <p className="muted-text">От 2 до 100 готовых аккаунтов и от 1 до 50 текстов до 1000 символов каждый. Если Telegram отклонит сообщение, задача остановится. Получателю нужен актуальный username или доступный для поиска номер.</p>
    </Modal>
  )
}
