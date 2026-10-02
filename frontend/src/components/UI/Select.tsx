import { Select as AntSelect } from 'antd'
import type { SelectProps } from 'antd'
export default function Select<Value = string>(props: SelectProps<Value>) {
  return <AntSelect<Value> {...props} />
}
