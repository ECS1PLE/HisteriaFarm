import { Descriptions } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { Button, Drawer, Field, Notice } from '../UI'
import ProfileEditor from './ProfileEditor'
import AccountProfile from './AccountProfile'
import GroupSelect from '../common/GroupSelect'
import type { Account, Task } from '../../types'
interface Props {
  account?: Account
  tasks: Task[]
  onSaved: () => Promise<void>
  onBusy: (busy: boolean) => void
  busy: boolean
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
  onSaved,
  onBusy,
  busy,
}: Props) {
  return (
    <Drawer
      title="Аккаунт"
      open={!!account}
      onClose={onClose}
      destroyOnHidden
      closable={!busy}
      maskClosable={!busy}
      keyboard={!busy}
    >
      {account && (
        <>
          <AccountProfile account={account} />
          {account.error && <Notice className="mb-4" type="warning" title={account.error} />}
          <Descriptions
            column={1}
            items={[
              { key: 'phone', label: 'Телефон', children: account.phone },
              { key: 'proxy', label: 'Прокси', children: account.proxy },
              {
                key: 'country',
                label: 'Страна',
                children: account.country || 'Не определена',
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
              disabled={busy}
              className="w-full"
              value={account.group}
              onChange={(group) => onGroupChange(account, group)}
            />
          </Field>
          <ProfileEditor
            key={account.id}
            account={account}
            onSaved={onSaved}
            onBusy={onBusy}
          />
          <div className="detail-actions">
            <Button
              block
              icon={<ReloadOutlined aria-hidden="true" />}
              disabled={busy || account.status === 'working'}
              onClick={() => onCheck(account)}
            >
              Проверить аккаунт
            </Button>

            <Button
              block
              danger
              disabled={busy || account.status === 'working'}
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
