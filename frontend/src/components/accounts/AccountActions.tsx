import {
  CheckCircleOutlined,
  DeleteOutlined,
  ExportOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import { ActionMenu } from '../UI'
import type { Account, CheckKind } from '../../types'
interface Props {
  account: Account
  busy: boolean
  onDetails: (account: Account) => void
  onCheck: (account: Account, kind?: CheckKind) => void
  onDelete: (account: Account) => void
}
export default function AccountActions({
  account,
  busy,
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
          label: 'Проверить сессию',
          icon: <CheckCircleOutlined aria-hidden="true" />,
          disabled: busy || account.status === 'working',
          onClick: () => onCheck(account, 'session'),
        },
        {
          key: 'spam',
          label: 'Проверить спамблок',
          icon: <SafetyCertificateOutlined aria-hidden="true" />,
          disabled: busy || account.status === 'working',
          onClick: () => onCheck(account, 'spam'),
        },
        { type: 'divider' },
        {
          key: 'delete',
          label: 'Удалить аккаунт',
          icon: <DeleteOutlined aria-hidden="true" />,
          danger: true,
          disabled: busy || account.status === 'working',
          onClick: () => onDelete(account),
        },
      ]}
    />
  )
}
