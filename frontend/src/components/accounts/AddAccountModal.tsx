import { useState } from 'react'
import { Form, Steps } from 'antd'
import { Button, FormField, Input, Modal, Notice } from '../UI'
import GroupSelect from '../common/GroupSelect'
import { api } from '../../services/api'
interface Props {
  onClose: () => void
  onAdded: () => Promise<void>
}
interface Attempt {
  attemptId: string
  delivery: string
  step: 'code'
}
export default function AddAccountModal({ onClose, onAdded }: Props) {
  const [form] = Form.useForm()
  const [step, setStep] = useState<'phone' | 'code' | 'password'>('phone')
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (values: {
    phone?: string
    group?: string
    code?: string
    password?: string
  }) => {
    setBusy(true)
    setError('')
    try {
      if (step === 'phone') {
        const next = await api<Attempt>('telegram/login/', {
          method: 'POST',
          body: values,
        })
        setAttempt(next)
        setStep('code')
        form.resetFields(['code', 'password'])
      } else {
        const result = await api<{ step: 'password' | 'done' }>(
          `telegram/login/${attempt!.attemptId}/`,
          {
            method: 'POST',
            body:
              step === 'code'
                ? { code: values.code }
                : { password: values.password },
          },
        )
        form.resetFields(['code', 'password'])
        if (result.step === 'password') setStep('password')
        else {
          await onAdded()
          onClose()
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка входа')
    } finally {
      setBusy(false)
    }
  }
  const close = async () => {
    if (busy) return
    if (attempt)
      await api(`telegram/login/${attempt.attemptId}/`, {
        method: 'DELETE',
      }).catch(() => undefined)
    form.resetFields()
    onClose()
  }
  const restart = async () => {
    if (attempt)
      await api(`telegram/login/${attempt.attemptId}/`, {
        method: 'DELETE',
      }).catch(() => undefined)
    setAttempt(null)
    setStep('phone')
    setError('')
    form.resetFields(['code', 'password'])
  }
  return (
    <Modal
      title="Подключить аккаунт Telegram"
      open
      onCancel={() => void close()}
      onOk={() => form.submit()}
      okText={step === 'phone' ? 'Получить код' : 'Подтвердить вход'}
      confirmLoading={busy}
      cancelButtonProps={{ disabled: busy }}
      closable={!busy}
      maskClosable={!busy}
      keyboard={!busy}
    >
      <Steps
        className="mb-6"
        size="small"
        current={step === 'phone' ? 0 : step === 'code' ? 1 : 2}
        items={[{ title: 'Телефон' }, { title: 'Код' }, { title: '2FA' }]}
      />
      <Form
        form={form}
        layout="vertical"
        initialValues={{ group: 'Основная' }}
        onFinish={submit}
        disabled={busy}
      >
        {step === 'phone' && (
          <>
            <p className="modal-description">
              Подключи существующий аккаунт. Панель сохранит сессию на сервере.
            </p>
            <FormField
              name="phone"
              label="Телефон с кодом страны"
              rules={[
                { required: true, message: 'Введи номер' },
                {
                  pattern: /^\+[\d ()-]{7,24}$/,
                  message: 'Номер должен начинаться с + и кода страны',
                },
              ]}
            >
              <Input placeholder="+79991234567" autoComplete="tel" />
            </FormField>
            <FormField name="group" label="Группа">
              <GroupSelect />
            </FormField>
          </>
        )}
        {step === 'code' && (
          <>
            <Notice
              className="mb-4"
              title="Введи код входа"
              description={
                attempt?.delivery.includes('App')
                  ? 'Код отправлен в приложение Telegram на одном из подключённых устройств.'
                  : 'Telegram выбрал способ доставки кода. Проверь приложение Telegram и сообщения на телефоне.'
              }
            />
            <FormField
              name="code"
              label="Код подтверждения"
              rules={[
                { required: true, message: 'Введи код' },
                { pattern: /^\d{4,8}$/, message: 'Код содержит 4–8 цифр' },
              ]}
            >
              <Input
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
              />
            </FormField>
          </>
        )}
        {step === 'password' && (
          <>
            <p className="modal-description">
              На аккаунте включена двухэтапная проверка. Пароль используется
              только для этого входа.
            </p>
            <FormField
              name="password"
              label="Пароль 2FA Telegram"
              rules={[{ required: true, message: 'Введи пароль 2FA' }]}
            >
              <Input type="password" autoFocus autoComplete="off" />
            </FormField>
          </>
        )}
        {error && <Notice type="error" title={error} className="mb-4" />}
        {step !== 'phone' && (
          <Button type="link" disabled={busy} onClick={() => void restart()}>
            Начать вход заново
          </Button>
        )}
      </Form>
    </Modal>
  )
}
