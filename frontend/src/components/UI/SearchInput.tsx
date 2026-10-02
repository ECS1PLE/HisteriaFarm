import { SearchOutlined } from '@ant-design/icons'
import Input from './Input'
import type { InputProps } from './Input'
export default function SearchInput(props: InputProps) {
  return (
    <Input
      allowClear
      prefix={<SearchOutlined aria-hidden="true" />}
      {...props}
    />
  )
}
