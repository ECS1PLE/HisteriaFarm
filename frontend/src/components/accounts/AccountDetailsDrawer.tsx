import { Descriptions, Tooltip } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { Button, Drawer, Field } from '../UI'
import AccountProfile from './AccountProfile'
import GroupSelect from '../common/GroupSelect'
import type { Account, Task } from '../../types'
interface Props {
  account?: Account
  tasks: Task[]
  onClose: () => void
  onCheck: (account: Account) => void
  onDelete: (account: Account) => void
  onGroupChange: (account: Account, group: string) => void
}
export default function AccountDetailsDrawer({
  account,
  tasks,
  onClose,
  onCheck,
  onDelete,
  onGroupChange,
}: Props) {
  return (
    <Drawer title="Аккаунт" open={!!account} onClose={onClose}>
      {account && (
        <>
          <AccountProfile account={account} />
          <Descriptions
            column={1}
            items={[
              { key: 'phone', label: 'Телефон', children: account.phone },
              { key: 'proxy', label: 'Прокси', children: account.proxy },
              {
                key: 'country',
                label: 'Страна',
                children: account.country === 'RU' ? 'Россия' : 'Германия',
              },
              {
                key: 'premium',
                label: 'Premium',
                children: account.premium ? 'Да' : 'Нет',
              },
              {
                key: 'completed',
                label: 'Выполнено задач',
                children: account.completed,
              },
              {
                key: 'active',
                label: 'Активность',
                children: account.lastActive,
              },
              {
                key: 'task',
                label: 'Текущая задача',
                children:
                  tasks.find((t) => t.accountIds.includes(account.id))?.name ??
                  'Нет активной задачи',
              },
            ]}
          />
          <Field label="Группа аккаунта" labelClassName="mt-4">
            <GroupSelect
              className="w-full"
              value={account.group}
              onChange={(group) => onGroupChange(account, group)}
            />
          </Field>
          <div className="detail-actions">
            <Tooltip title="Локальный сброс статуса без обращения к Telegram">
              <Button
                block
                icon={<ReloadOutlined aria-hidden="true" />}
                disabled={account.status === 'working'}
                onClick={() => onCheck(account)}
              >
                Проверить аккаунт (демо)
              </Button>
            </Tooltip>
            <Button
              block
              danger
              disabled={account.status === 'working'}
              onClick={() => onDelete(account)}
            >
              Удалить аккаунт
            </Button>
          </div>
        </>
      )}
    </Drawer>
  )
}
