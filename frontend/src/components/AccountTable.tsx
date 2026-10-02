import {
  Avatar,
  Button,
  Dropdown,
  Empty,
  Input,
  Select,
  Table,
  Tooltip,
} from 'antd'
import {
  CheckCircleOutlined,
  CrownFilled,
  DeleteOutlined,
  DownOutlined,
  EllipsisOutlined,
  ExportOutlined,
  FilterOutlined,
  SearchOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons'
import { useState } from 'react'
import type { TableColumnsType } from 'antd'
import { groups, statusLabels } from '../data'
import type { Account } from '../types'
import StatusBadge from './StatusBadge'
interface Props {
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
}: Props) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [group, setGroup] = useState('all')
  const [page, setPage] = useState(1)
  const filtered = accounts.filter(
    (a) =>
      (status === 'all' || a.status === status) &&
      (group === 'all' || a.group === group) &&
      `${a.name} ${a.username} ${a.phone} ${a.id}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  )
  const exportAccounts = () => {
    const data = filtered.map(
      ({
        id,
        name,
        username,
        phone,
        group: accountGroup,
        status: accountStatus,
        proxy,
      }) => ({
        id,
        name,
        username,
        phone,
        group: accountGroup,
        status: accountStatus,
        proxy,
      }),
    )
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
    )
    const a = document.createElement('a')
    a.href = url
    a.download = 'histeria-accounts.json'
    a.click()
    URL.revokeObjectURL(url)
  }
  const columns: TableColumnsType<Account> = [
    {
      title: 'АККАУНТ',
      dataIndex: 'name',
      width: 255,
      render: (_, a) => (
        <button className="account-cell" onClick={() => onDetails(a)}>
          <Avatar
            size={36}
            style={{
              background: `${a.color}22`,
              color: a.color,
              border: `1px solid ${a.color}30`,
            }}
          >
            {a.name
              .split(' ')
              .map((n) => n[0])
              .join('')}
          </Avatar>
          <span>
            <strong>
              {a.name}
              {a.premium && (
                <Tooltip title="Telegram Premium">
                  <CrownFilled aria-hidden="true" className="premium-icon" />
                </Tooltip>
              )}
            </strong>
            <small>@{a.username}</small>
          </span>
        </button>
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
      render: (value) => <StatusBadge status={value} />,
    },
    {
      title: 'ПРОКСИ',
      dataIndex: 'proxy',
      width: 166,
      render: (_, a) => (
        <div className="proxy-cell">
          <span
            className={`connection-dot ${a.status === 'error' ? 'bad' : a.status === 'offline' ? 'muted' : ''}`}
          />
          <span>
            {a.proxy}
            <small>
              {a.country === 'RU' ? 'Россия' : 'Германия'} <span>· SOCKS5</span>
            </small>
          </span>
        </div>
      ),
    },
    {
      title: 'ГРУППА',
      dataIndex: 'group',
      width: 110,
      render: (value) => <span className="group-tag">{value}</span>,
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
      render: (_, a) => (
        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              {
                key: 'details',
                label: 'Открыть аккаунт',
                icon: <ExportOutlined aria-hidden="true" />,
                onClick: () => onDetails(a),
              },
              {
                key: 'check',
                label: 'Проверить (демо)',
                icon: <CheckCircleOutlined aria-hidden="true" />,
                disabled: a.status === 'working',
                onClick: () => onCheck(a),
              },
              { type: 'divider' },
              {
                key: 'delete',
                label: 'Удалить аккаунт',
                icon: <DeleteOutlined aria-hidden="true" />,
                danger: true,
                disabled: a.status === 'working',
                onClick: () => onDelete(a),
              },
            ],
          }}
        >
          <Button
            type="text"
            aria-label={`Действия: ${a.name}`}
            icon={<EllipsisOutlined aria-hidden="true" />}
          />
        </Dropdown>
      ),
    },
  ]
  return (
    <section className="panel account-panel">
      <div className="panel-heading">
        <div className="flex items-center gap-3">
          <h2>Все аккаунты</h2>
          <span className="count-tag">{accounts.length}</span>
        </div>
        <Button
          icon={<ExportOutlined aria-hidden="true" />}
          onClick={exportAccounts}
        >
          Экспорт
        </Button>
      </div>
      <div className="table-toolbar">
        <Input
          className="account-search"
          placeholder="Поиск по имени, телефону или username"
          prefix={<SearchOutlined aria-hidden="true" />}
          value={search}
          allowClear
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          aria-label="Поиск аккаунтов"
        />
        <div className="table-filters">
          <Select
            aria-label="Фильтр по статусу"
            value={status}
            onChange={(v) => {
              setStatus(v)
              setPage(1)
            }}
            suffixIcon={<DownOutlined aria-hidden="true" />}
            options={[
              {
                value: 'all',
                label: (
                  <>
                    <FilterOutlined aria-hidden="true" /> Все статусы
                  </>
                ),
              },
              ...Object.entries(statusLabels).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
          />
          <Select
            aria-label="Фильтр по группе"
            value={group}
            onChange={(v) => {
              setGroup(v)
              setPage(1)
            }}
            options={[
              { value: 'all', label: 'Все группы' },
              ...groups.map((g) => ({ value: g, label: g })),
            ]}
          />
        </div>
      </div>
      {selected.length > 0 && (
        <div className="selection-bar">
          <span>
            Выбрано аккаунтов: <strong>{selected.length}</strong>
          </span>
          <Button size="small" type="text" onClick={() => onSelect([])}>
            Снять выбор
          </Button>
          <Button
            size="small"
            type="primary"
            icon={<ThunderboltOutlined aria-hidden="true" />}
            onClick={onLaunch}
          >
            Создать задачу
          </Button>
        </div>
      )}
      <Table<Account>
        columns={columns}
        dataSource={filtered}
        rowKey="id"
        size={compact ? 'small' : 'middle'}
        rowSelection={{
          selectedRowKeys: selected,
          onChange: (keys) => onSelect(keys.map(String)),
          getCheckboxProps: (a) => ({
            disabled: a.status !== 'ready',
            'aria-label': `Выбрать ${a.name}`,
          }),
        }}
        pagination={{
          current: page,
          pageSize: 8,
          onChange: setPage,
          showSizeChanger: false,
          showTotal: (total, range) =>
            `${range[0]}–${range[1]} из ${total} аккаунтов`,
        }}
        scroll={{ x: 1050 }}
        locale={{
          emptyText: (
            <Empty
              description="Аккаунты не найдены"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ),
        }}
      />
      <div className="table-caption">
        <span>
          <span className="connection-dot" /> Статусы обновляются в демо-режиме
        </span>
        <span>Выбор доступен для готовых аккаунтов</span>
      </div>
    </section>
  )
}
