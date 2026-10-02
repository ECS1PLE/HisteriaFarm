import { useState } from 'react'
import type { Account } from '../types'
export function useAccountFilters(accounts: Account[]) {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [group, setGroup] = useState('all')
  const [page, setPage] = useState(1)
  const filtered = accounts.filter(
    (account) =>
      (status === 'all' || account.status === status) &&
      (group === 'all' || account.group === group) &&
      `${account.name} ${account.username} ${account.phone} ${account.id}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  )
  const changeSearch = (value: string) => {
    setSearch(value)
    setPage(1)
  }
  const changeStatus = (value: string) => {
    setStatus(value)
    setPage(1)
  }
  const changeGroup = (value: string) => {
    setGroup(value)
    setPage(1)
  }
  return {
    search,
    status,
    group,
    page,
    setPage,
    filtered,
    changeSearch,
    changeStatus,
    changeGroup,
  }
}
