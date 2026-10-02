import type { SelectProps } from 'antd'
import { Select } from '../UI'
import { groups } from '../../data'
interface Props extends SelectProps<string> {
  includeAll?: boolean
}
export default function GroupSelect({ includeAll = false, ...props }: Props) {
  return (
    <Select
      options={[
        ...(includeAll ? [{ value: 'all', label: 'Все группы' }] : []),
        ...groups.map((group) => ({ value: group, label: group })),
      ]}
      {...props}
    />
  )
}
