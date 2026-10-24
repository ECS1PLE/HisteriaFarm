import { useState } from 'react'
import { App, Form, Popconfirm, Tag } from 'antd'
import { Button, FormField, Input, Notice, Panel, Select, TextArea } from '../UI'
import { api } from '../../services/api'
import type { Account, MonitorRule } from '../../types'

interface Fields { mode: 'channel' | 'chat'; accountId: string; target: string; keyword?: string; text: string }
export default function MonitoringView({ accounts, rules, online, onChanged }: {
  accounts: Account[]; rules: MonitorRule[]; online: boolean; onChanged: () => Promise<void>
}) {
  const [form] = Form.useForm<Fields>()
  const mode = Form.useWatch('mode', form) ?? 'channel'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { message } = App.useApp()
  const execute = async (action: () => Promise<void>) => {
    setBusy(true); setError('')
    try { await action(); await onChanged() }
    catch (e) { setError(e instanceof Error ? e.message : 'Ошибка операции') }
    finally { setBusy(false) }
  }
  const create = (fields: Fields) => void execute(async () => {
    await api('monitors/', { method: 'POST', body: fields })
    form.resetFields(['target', 'keyword', 'text'])
    message.success('Отслеживание включено для новых сообщений')
  })
  const change = (rule: MonitorRule, action: 'pause' | 'resume' | 'delete') => void execute(async () => {
    await api(`monitors/${rule.id}/`, { method: action === 'delete' ? 'DELETE' : 'PATCH', body: action === 'delete' ? undefined : { action } })
  })
  return <div className="monitoring-layout">
    <Panel className="monitor-form">
      <h2>Новое правило</h2>
      <p className="muted-text">Комментарии под новыми постами канала или ответ на ключевую фразу в группе.</p>
      {!online && <Notice className="mb-4" type="warning" title="Исполнитель отслеживания отключён" description="Правила сохранены. Для автоматических ответов администратору нужно запустить серверный исполнитель." />}
      <Form form={form} layout="vertical" initialValues={{ mode: 'channel' }} onFinish={create} disabled={busy}>
        <FormField name="mode" label="Что отслеживать"><Select options={[{ value: 'channel', label: 'Новые посты канала' }, { value: 'chat', label: 'Ключевая фраза в чате' }]} /></FormField>
        <FormField name="accountId" label="Отправитель" rules={[{ required: true, message: 'Выбери аккаунт' }]}>
          <Select placeholder="Выбери Telegram-аккаунт" options={accounts.filter(a => a.status === 'ready').map(a => ({ value: a.id, label: `${a.name}${a.owned === false ? ' · общий' : ' · свой'}` }))} />
        </FormField>
        <FormField name="target" label={mode === 'channel' ? 'Канал' : 'Группа'} rules={[{ required: true, message: 'Укажи адресата' }]}>
          <Input placeholder="@username, https://t.me/channel или -100…" maxLength={255} />
        </FormField>
        {mode === 'chat' && <FormField name="keyword" label="Ключевая фраза" rules={[{ required: true, whitespace: true, message: 'Введи фразу' }]}>
          <Input placeholder="Например: сколько стоит" maxLength={200} />
        </FormField>}
        <FormField name="text" label={mode === 'channel' ? 'Текст комментария' : 'Текст ответа'} rules={[{ required: true, whitespace: true, message: 'Введи текст' }]}>
          <TextArea rows={4} maxLength={4000} showCount />
        </FormField>
        <p className="field-help">Ответ отправляет выбранный аккаунт. Ключевая фраза ищется в тексте без учёта регистра. Сообщения ботов и аккаунтов панели пропускаются.</p>
        <Notice className="mb-4" title="Только новые сообщения" description="Старые посты при создании не обрабатываются. Каналу нужна группа обсуждений, отправителю — доступ к чату и право писать. После паузы обрабатываются пропущенные сообщения. Неопределённые отправки не повторяются." />
        <Button type="primary" htmlType="submit" loading={busy} disabled={!accounts.some(a => a.status === 'ready')}>Включить отслеживание</Button>
      </Form>
    </Panel>
    <div className="monitor-rules" aria-live="polite">
      {error && <Notice type="error" title={error} />}
      {!rules.length && <Panel className="monitor-form"><h2>Пока нет правил</h2><p className="muted-text">Создай первое правило. Оно будет работать на сервере и при закрытой вкладке.</p></Panel>}
      {rules.map(rule => <Panel className="monitor-form" key={rule.id}>
        <div className="membership-heading"><h3>{rule.title}</h3><Tag color={rule.status === 'running' ? 'green' : 'default'}>{rule.status === 'running' ? 'Работает' : 'Пауза'}</Tag></div>
        <p className="muted-text">{rule.target} · {rule.accountName} · {rule.mode === 'channel' ? 'Новые посты' : `Фраза: «${rule.keyword}»`}</p>
        <p className="monitor-text">{rule.text}</p>
        <p>Отправлено: {rule.sent}{rule.failed > 0 && ` · Ошибок: ${rule.failed}`}{rule.uncertain > 0 && ` · Не подтверждено: ${rule.uncertain}`}</p>
        {rule.error && <Notice className="mb-4" type="warning" title={rule.error} />}
        <div className="monitor-actions">
          <Button disabled={busy} onClick={() => change(rule, rule.status === 'running' ? 'pause' : 'resume')}>{rule.status === 'running' ? 'Приостановить' : 'Продолжить'}</Button>
          <Popconfirm title="Удалить правило отслеживания?" okText="Удалить" cancelText="Отмена" onConfirm={() => change(rule, 'delete')}><Button danger disabled={busy}>Удалить</Button></Popconfirm>
        </div>
      </Panel>)}
    </div>
  </div>
}
