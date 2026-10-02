import { useState } from 'react'
import { Form } from 'antd'
import { LockOutlined } from '@ant-design/icons'
import { Button, FormField, Input, Notice, Panel } from '../UI'
import { api } from '../../services/api'
export default function PanelLogin({
  onLogin,
}: {
  onLogin: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const login = async (fields: { username: string; password: string }) => {
    setBusy(true)
    setError('')
    try {
      await api('login/', { method: 'POST', body: fields })
      await onLogin()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка входа')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="connection-screen">
      <Panel className="connection-panel">
        <span className="login-brand">
          histeria<span> workspace</span>
        </span>
        <h1>Твоё рабочее пространство</h1>
        <p className="muted-text">Войди в панель управления аккаунтами.</p>
        <Form layout="vertical" onFinish={login}>
          <FormField
            name="username"
            label="Логин панели"
            rules={[{ required: true, message: 'Введи логин' }]}
          >
            <Input autoComplete="username" />
          </FormField>
          <FormField
            name="password"
            label="Пароль панели"
            rules={[{ required: true, message: 'Введи пароль' }]}
          >
            <Input type="password" autoComplete="current-password" />
          </FormField>
          {error && <Notice type="error" title={error} className="mb-4" />}
          <Button
            block
            type="primary"
            htmlType="submit"
            loading={busy}
            icon={<LockOutlined aria-hidden="true" />}
          >
            Войти
          </Button>
        </Form>
        <p className="field-help">
          При первом запуске создай пользователя командой createsuperuser в
          backend.
        </p>
      </Panel>
    </div>
  )
}
