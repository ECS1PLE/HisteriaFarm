import { useState } from 'react'
import { Checkbox, Form, Segmented } from 'antd'
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
  const [register, setRegister] = useState(false)
  const [form] = Form.useForm()
  const login = async (fields: { username: string; password: string }) => {
    setBusy(true)
    setError('')
    try {
      await api(register ? 'register/' : 'login/', { method: 'POST', body: fields })
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
        <p className="muted-text">Управляй аккаунтами и автоматизируй ответы в Telegram.</p>
        <Segmented block className="mb-6" value={register ? 'register' : 'login'} disabled={busy}
          options={[{ label: 'Войти', value: 'login' }, { label: 'Создать аккаунт', value: 'register' }]}
          onChange={(value) => { setRegister(value === 'register'); setError(''); form.resetFields() }} />
        <Form form={form} layout="vertical" onFinish={login} disabled={busy}>
          <FormField
            name="username"
            label="Логин панели"
            rules={[{ required: true, message: 'Введи логин' }, ...(register ? [{ pattern: /^[A-Za-z0-9_]{3,32}$/, message: '3–32 символа: латиница, цифры, _' }] : [])]}
          >
            <Input autoComplete="username" />
          </FormField>
          {register && <FormField name="email" label="Email" rules={[{ required: true, type: 'email', message: 'Введи корректный email' }]}>
            <Input type="email" autoComplete="email" maxLength={254} />
          </FormField>}
          <FormField
            name="password"
            label="Пароль панели"
            rules={[{ required: true, message: 'Введи пароль' }]}
          >
            <Input type="password" maxLength={128} autoComplete={register ? 'new-password' : 'current-password'} />
          </FormField>
          {register && <>
            <p className="field-help">Не меньше 8 символов. Не используй простой пароль, только цифры или свой логин.</p>
            <FormField name="passwordConfirm" label="Повтори пароль" dependencies={['password']}
              rules={[{ required: true, message: 'Повтори пароль' }, ({ getFieldValue }) => ({ validator(_, value) {
                return !value || value === getFieldValue('password') ? Promise.resolve() : Promise.reject(new Error('Пароли не совпадают'))
              } })]}>
              <Input type="password" autoComplete="new-password" maxLength={128} />
            </FormField>
            <Notice className="mb-4" title="Начни с Free" description="Все функции на своих аккаунтах. Premium за 100 ₽ на 30 дней открывает все сессии панели." />
            <Form.Item name="sharingAccepted" valuePropName="checked" rules={[{ validator: (_, value) => value ? Promise.resolve() : Promise.reject(new Error('Подтверди условия общего доступа')) }]}>
              <Checkbox>Понимаю, что добавленные мной Telegram-сессии доступны пользователям Premium, включая отправку сообщений и изменение профиля.</Checkbox>
            </Form.Item>
          </>}
          {error && <Notice type="error" title={error} className="mb-4" />}
          <Button
            block
            type="primary"
            htmlType="submit"
            loading={busy}
            icon={<LockOutlined aria-hidden="true" />}
          >
            {register ? 'Создать аккаунт Free' : 'Войти'}
          </Button>
        </Form>
      </Panel>
    </div>
  )
}
