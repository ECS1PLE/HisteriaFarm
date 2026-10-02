import { Form } from 'antd'
import type { FormInstance } from 'antd'
import { FormField, Input, Modal, Notice } from '../UI'
import GroupSelect from '../common/GroupSelect'
import type { AccountFields } from '../../types'
interface Props {
  open: boolean
  form: FormInstance<AccountFields>
  onClose: () => void
  onSubmit: (fields: AccountFields) => void
}
export default function AddAccountModal({
  open,
  form,
  onClose,
  onSubmit,
}: Props) {
  return (
    <Modal
      title="Добавить аккаунт"
      open={open}
      onCancel={() => onClose()}
      onOk={() => form.submit()}
      okText="Добавить аккаунт"
      cancelText="Отмена"
    >
      <p className="modal-description">
        Создай демо-профиль для настройки интерфейса.
      </p>
      <Form
        form={form}
        layout="vertical"
        initialValues={{ group: 'Основная' }}
        onFinish={onSubmit}
      >
        <FormField
          name="name"
          label="Имя аккаунта"
          rules={[
            { required: true, whitespace: true, message: 'Введи имя' },
            { max: 64, message: 'До 64 символов' },
          ]}
        >
          <Input placeholder="Александр Волков" />
        </FormField>
        <FormField
          name="username"
          label="Username"
          rules={[
            { required: true, message: 'Введи username' },
            {
              pattern: /^@?[a-zA-Z][a-zA-Z0-9_]{4,31}$/,
              message: '5–32 символа: латиница, цифры, подчёркивание',
            },
          ]}
        >
          <Input placeholder="@username" />
        </FormField>
        <FormField
          name="phone"
          label="Номер телефона"
          rules={[
            { required: true, message: 'Введи номер' },
            {
              validator: (_, value: string) =>
                /^\+?[\d ()-]+$/.test(value ?? '') &&
                /^\d{10,15}$/.test((value ?? '').replace(/\D/g, ''))
                  ? Promise.resolve()
                  : Promise.reject(
                      new Error('Введи корректный номер (10–15 цифр)'),
                    ),
            },
          ]}
        >
          <Input placeholder="+7 (999) 123-45-67" />
        </FormField>
        <div className="form-two-cols">
          <FormField name="group" label="Группа">
            <GroupSelect />
          </FormField>
          <FormField
            name="proxy"
            label="Прокси (необязательно)"
            rules={[
              { pattern: /^[\w.-]+:\d{2,5}$/, message: 'Формат host:port' },
            ]}
          >
            <Input placeholder="185.24.42.108:8000" />
          </FormField>
        </div>
        <Notice
          title="Подключение Telegram пока не выполняется"
          type="info"
          showIcon
        />
      </Form>
    </Modal>
  )
}
