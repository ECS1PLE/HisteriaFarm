import { useState } from 'react'
import type { TableColumnsType } from 'antd'
import { ExportOutlined, FlagOutlined, SendOutlined, MessageOutlined, LikeOutlined, UserAddOutlined } from '@ant-design/icons'
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Panel,
  PanelHeading,
} from '../UI'
import AccountIdentity from './AccountIdentity'
import AccountHealth from './AccountHealth'
import AccountActions from './AccountActions'
import AccountFilters from './AccountFilters'
import AccountSelectionBar from './AccountSelectionBar'
import AccountTableCaption from './AccountTableCaption'
import BulkReportMockupModal from './BulkReportMockupModal'
import OwnedPublicationModal from './OwnedPublicationModal'
import type { PublicationMode } from '../../services/publications'
import AccountStatusBadge from '../common/AccountStatusBadge'
import { useAccountFilters } from '../../hooks/useAccountFilters'
import { downloadJson } from '../../utils/download'
import type { Account, CheckKind } from '../../types'
export interface AccountTableProps {
  accounts: Account[]
  draftOwner: string
  selected: string[]
  compact: boolean
  busy: boolean
  onSelect: (ids: string[]) => void
  onDetails: (account: Account) => void
  onDelete: (account: Account) => void
  onCheck: (account?: Account, kind?: CheckKind) => void
  onLaunch: () => void
  onPublished: () => Promise<void>
}
export default function AccountTable({
  accounts,
  draftOwner,
  selected,
  compact,
  busy,
  onSelect,
  onDetails,
  onDelete,
  onCheck,
  onLaunch,
  onPublished,
}: AccountTableProps) {
  const filters = useAccountFilters(accounts)
  const [bulkReportOpen, setBulkReportOpen] = useState(false)
  const [publicationMode, setPublicationMode] = useState<PublicationMode | null>(null)
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
      title: 'СЕССИЯ',
      key: 'session',
      width: 185,
      render: (_, account) => <AccountHealth account={account} kind="session" />,
    },
    {
      title: 'СПАМБЛОК',
      key: 'spam',
      width: 190,
      render: (_, account) => <AccountHealth account={account} kind="spam" />,
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
          busy={busy}
          onDetails={onDetails}
          onCheck={onCheck}
          onDelete={onDelete}
        />
      ),
    },
  ]
  return (
    <Panel className="account-panel">
      {bulkReportOpen && <BulkReportMockupModal key={draftOwner} draftOwner={draftOwner} accounts={accounts} selected={selected} onClose={() => setBulkReportOpen(false)} />}
      {publicationMode && <OwnedPublicationModal accounts={accounts} selected={selected} initialMode={publicationMode} onClose={() => setPublicationMode(null)} onPublished={onPublished} />}
      <PanelHeading
        title="Все аккаунты"
        count={accounts.length}
        separateCount
        action={
          <div className="account-heading-actions">
            <Button icon={<UserAddOutlined aria-hidden="true" />} disabled={busy || !accounts.some((account) => account.status === 'ready')} onClick={() => setPublicationMode('subscriptions')}>
              Подписаться
            </Button>
            <Button icon={<LikeOutlined aria-hidden="true" />} disabled={busy || !accounts.some((account) => account.status === 'ready')} onClick={() => setPublicationMode('reactions')}>
              Реакции
            </Button>
            <Button icon={<MessageOutlined aria-hidden="true" />} disabled={busy || !accounts.some((account) => account.status === 'ready')} onClick={() => setPublicationMode('direct')}>
              В личку
            </Button>
            <Button icon={<SendOutlined aria-hidden="true" />} disabled={busy || !accounts.some((account) => account.status === 'ready')} onClick={() => setPublicationMode('messages')}>
              Сообщения / комментарии
            </Button>
            <Button icon={<FlagOutlined aria-hidden="true" />} onClick={() => setBulkReportOpen(true)}>
              Массовый репорт
            </Button>
            <Button
              icon={<ExportOutlined aria-hidden="true" />}
              onClick={exportAccounts}
            >
              Экспорт
            </Button>
          </div>
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
            disabled: account.status === 'working',
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
        scroll={{ x: 1210 }}
        locale={{ emptyText: <EmptyState description="Аккаунты не найдены" /> }}
      />
      <AccountTableCaption />
    </Panel>
  )
}
