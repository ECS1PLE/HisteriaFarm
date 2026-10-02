import type { FormInstance } from 'antd'
import { Button, FormField, Select } from '../UI'
import type { Account, TaskFields } from '../../types'
export default function TaskAccountSelect({
  form,
  accounts,
}: {
  form: FormInstance<TaskFields>
  accounts: Account[]
}) {
  return (
    <>
      <div className="account-select-label">
        <span>Аккаунты для задачи</span>
        <Button
          type="text"
          size="small"
          disabled={!accounts.length}
          onClick={() =>
            form.setFieldValue(
              'accountIds',
              accounts.map((a) => a.id),
            )
          }
        >
          Выбрать все готовые ({accounts.length})
        </Button>
      </div>
      <FormField
        name="accountIds"
        rules={[
          {
            required: true,
            type: 'array',
            min: 1,
            message: 'Выбери хотя бы один готовый аккаунт',
          },
        ]}
      >
        <Select<string[]>
          mode="multiple"
          placeholder="Выбери аккаунты"
          maxTagCount={3}
          optionFilterProp="label"
          options={accounts.map((a) => ({ value: a.id, label: a.name }))}
        />
      </FormField>
    </>
  )
}
