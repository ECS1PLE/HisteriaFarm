import { useState } from 'react'
import { App, Form } from 'antd'
import { Button, FormField, Input, Notice } from '../UI'
import { api } from '../../services/api'
export default function TelegramSettingsForm({
  configured,
  onSaved,
}: {
  configured: boolean
  onSaved: () => Promise<void>
}) {
  const [form] = Form.useForm()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const { message } = App.useApp()
  const submit = async (values: { apiId: string; apiHash: string }) => {
    setBusy(true)
    setError('')
    try {
      await api('telegram/settings/', { method: 'POST', body: values })
      form.resetFields()
      await onSaved()
      message.success('Ключи Telegram сохранены на сервере')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка настройки')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="telegram-settings">
      <h3>Подключение Telegram</h3>
      <Notice
        className="mb-4"
        title={configured ? 'API-ключи настроены' : 'Укажи ключи приложения'}
        description={
          <>
            Получи API ID и API Hash на{' '}
            <a
              href="https://my.telegram.org/apps"
              target="_blank"
              rel="noreferrer"
            >
              my.telegram.org
            </a>
            . Они сохраняются зашифрованными на сервере. Уже подключённые
            аккаунты используют свои сохранённые ключи.
          </>
        }
      />
      <Form form={form} layout="vertical" onFinish={submit}>
        <FormField
          name="apiId"
          label="API ID"
          rules={[
            { required: true, message: 'Введи API ID' },
            { pattern: /^\d+$/, message: 'Только цифры' },
          ]}
        >
          <Input inputMode="numeric" autoComplete="off" />
        </FormField>
        <FormField
          name="apiHash"
          label="API Hash"
          rules={[
            { required: true, message: 'Введи API Hash' },
            {
              pattern: /^[a-fA-F0-9]{32}$/,
              message: '32 шестнадцатеричных символа',
            },
          ]}
        >
          <Input type="password" autoComplete="off" />
        </FormField>
        {error && <Notice type="error" title={error} className="mb-4" />}
        <Button block type="primary" htmlType="submit" loading={busy}>
          Сохранить API-ключи
        </Button>
      </Form>
    </section>
  )
}
