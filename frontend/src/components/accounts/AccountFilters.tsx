import { DownOutlined, FilterOutlined } from '@ant-design/icons'
import { SearchInput, Select } from '../UI'
import GroupSelect from '../common/GroupSelect'
import { statusLabels } from '../../data'
interface Props {
  search: string
  status: string
  group: string
  onSearch: (value: string) => void
  onStatus: (value: string) => void
  onGroup: (value: string) => void
}
export default function AccountFilters({
  search,
  status,
  group,
  onSearch,
  onStatus,
  onGroup,
}: Props) {
  return (
    <div className="table-toolbar">
      <SearchInput
        className="account-search"
        placeholder="Поиск по имени, телефону или username"
        value={search}
        onChange={(e) => onSearch(e.target.value)}
        aria-label="Поиск аккаунтов"
      />
      <div className="table-filters">
        <Select
          aria-label="Фильтр по статусу"
          value={status}
          onChange={onStatus}
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
        <GroupSelect
          aria-label="Фильтр по группе"
          includeAll
          value={group}
          onChange={onGroup}
        />
      </div>
    </div>
  )
}
