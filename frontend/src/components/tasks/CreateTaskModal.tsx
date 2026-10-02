import { Form } from 'antd'
import type { FormInstance } from 'antd'
import { FormField, Input, Modal, Notice } from '../UI'
import TaskAccountSelect from './TaskAccountSelect'
import TaskPreview from './TaskPreview'
import { modeLabels } from '../../data'
import type { Account, TaskConfig, TaskFields } from '../../types'
interface Props {
  open: boolean
  form: FormInstance<TaskFields>
  ready: Account[]
  config: TaskConfig
  onClose: () => void
  onSubmit: (fields: TaskFields) => void
}
export default function CreateTaskModal({
  open,
  form,
  ready,
  config,
  onClose,
  onSubmit,
}: Props) {
  const mode = config.mode
  return (
    <Modal
      title="Новая задача"
      open={open}
      onCancel={() => onClose()}
      onOk={() => form.submit()}
      okText="Запустить"
      cancelText="Отмена"
      okButtonProps={{ disabled: true }}
    >
      <p className="modal-description">
        Режим <strong>{modeLabels[mode]}</strong> ·{' '}
        {mode === 'scenario'
          ? `${config.steps.length} шага`
          : `${config.targets.length} площадки`}
      </p>
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <FormField
          name="name"
          label="Название задачи"
          rules={[
            { required: true, whitespace: true, message: 'Введи название' },
            { max: 80, message: 'До 80 символов' },
          ]}
        >
          <Input placeholder="Моя первая задача" />
        </FormField>
        <TaskAccountSelect form={form} accounts={ready} />

        <TaskPreview config={config} />
        <Notice
          className="mt-4"
          title="Выполнение задач ещё не подключено"
          description="Сейчас доступны подключение аккаунтов и редактирование профилей."
          type="info"
          showIcon
        />
      </Form>
    </Modal>
  )
}
