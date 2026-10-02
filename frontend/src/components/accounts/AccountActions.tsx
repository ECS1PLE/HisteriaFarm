import {
  CheckCircleOutlined,
  DeleteOutlined,
  ExportOutlined,
} from '@ant-design/icons'
import { ActionMenu } from '../UI'
import type { Account } from '../../types'
interface Props {
  account: Account
  onDetails: (account: Account) => void
  onCheck: (account: Account) => void
  onDelete: (account: Account) => void
}
export default function AccountActions({
  account,
  onDetails,
  onCheck,
  onDelete,
}: Props) {
  return (
    <ActionMenu
      label={`Действия: ${account.name}`}
      items={[
        {
          key: 'details',
          label: 'Открыть аккаунт',
          icon: <ExportOutlined aria-hidden="true" />,
          onClick: () => onDetails(account),
        },
        {
          key: 'check',
          label: 'Проверить (демо)',
          icon: <CheckCircleOutlined aria-hidden="true" />,
          disabled: account.status === 'working',
          onClick: () => onCheck(account),
        },
        { type: 'divider' },
        {
          key: 'delete',
          label: 'Удалить аккаунт',
          icon: <DeleteOutlined aria-hidden="true" />,
          danger: true,
          disabled: account.status === 'working',
          onClick: () => onDelete(account),
        },
      ]}
    />
  )
}
