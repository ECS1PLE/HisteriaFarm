import type { TableColumnsType } from 'antd'
import { ExportOutlined } from '@ant-design/icons'
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Panel,
  PanelHeading,
} from '../UI'
import AccountIdentity from './AccountIdentity'
import ProxyCell from './ProxyCell'
import AccountActions from './AccountActions'
import AccountFilters from './AccountFilters'
import AccountSelectionBar from './AccountSelectionBar'
import AccountTableCaption from './AccountTableCaption'
import AccountStatusBadge from '../common/AccountStatusBadge'
import { useAccountFilters } from '../../hooks/useAccountFilters'
import { downloadJson } from '../../utils/download'
import type { Account } from '../../types'
export interface AccountTableProps {
  accounts: Account[]
  selected: string[]
  compact: boolean
  onSelect: (ids: string[]) => void
  onDetails: (account: Account) => void
  onDelete: (account: Account) => void
  onCheck: (account?: Account) => void
  onLaunch: () => void
}
export default function AccountTable({
  accounts,
  selected,
  compact,
  onSelect,
  onDetails,
  onDelete,
  onCheck,
  onLaunch,
}: AccountTableProps) {
  const filters = useAccountFilters(accounts)
  const exportAccounts = () =>
    downloadJson(
      'histeria-accounts.json',
      filters.filtered.map(
        ({ id, name, username, phone, group, status, proxy }) => ({
          id,
          name,
          username,
          phone,
          group,
          status,
          proxy,
        }),
      ),
    )
  const columns: TableColumnsType<Account> = [
    {
      title: 'АККАУНТ',
      dataIndex: 'name',
      width: 255,
      render: (_, account) => (
        <AccountIdentity account={account} onClick={() => onDetails(account)} />
      ),
    },
    {
      title: 'ТЕЛЕФОН',
      dataIndex: 'phone',
      width: 175,
      render: (value) => <span className="phone-number">{value}</span>,
    },
    {
      title: 'СТАТУС',
      dataIndex: 'status',
      width: 185,
      render: (value) => <AccountStatusBadge status={value} />,
    },
    {
      title: 'ПРОКСИ',
      dataIndex: 'proxy',
      width: 166,
      render: (_, account) => <ProxyCell account={account} />,
    },
    {
      title: 'ГРУППА',
      dataIndex: 'group',
      width: 110,
      render: (value) => <Badge variant="group">{value}</Badge>,
    },
    {
      title: 'АКТИВНОСТЬ',
      dataIndex: 'lastActive',
      width: 125,
      render: (value) => <span className="muted-text">{value}</span>,
    },
    {
      title: '',
      key: 'actions',
      width: 46,
      render: (_, account) => (
        <AccountActions
          account={account}
          onDetails={onDetails}
          onCheck={onCheck}
          onDelete={onDelete}
        />
      ),
    },
  ]
  return (
    <Panel className="account-panel">
      <PanelHeading
        title="Все аккаунты"
        count={accounts.length}
        separateCount
        action={
          <Button
            icon={<ExportOutlined aria-hidden="true" />}
            onClick={exportAccounts}
          >
            Экспорт
          </Button>
        }
      />
      <AccountFilters
        search={filters.search}
        status={filters.status}
        group={filters.group}
        onSearch={filters.changeSearch}
        onStatus={filters.changeStatus}
        onGroup={filters.changeGroup}
      />
      <AccountSelectionBar
        count={selected.length}
        onClear={() => onSelect([])}
        onLaunch={onLaunch}
      />
      <DataTable<Account>
        columns={columns}
        dataSource={filters.filtered}
        rowKey="id"
        size={compact ? 'small' : 'middle'}
        rowSelection={{
          selectedRowKeys: selected,
          onChange: (keys) => onSelect(keys.map(String)),
          getCheckboxProps: (account) => ({
            disabled: account.status !== 'ready',
            'aria-label': `Выбрать ${account.name}`,
          }),
        }}
        pagination={{
          current: filters.page,
          pageSize: 8,
          onChange: filters.setPage,
          showSizeChanger: false,
          showTotal: (total, range) =>
            `${range[0]}–${range[1]} из ${total} аккаунтов`,
        }}
        scroll={{ x: 1050 }}
        locale={{ emptyText: <EmptyState description="Аккаунты не найдены" /> }}
      />
      <AccountTableCaption />
    </Panel>
  )
}
