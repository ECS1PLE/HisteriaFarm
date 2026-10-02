import { InputNumber } from 'antd'
import type { InputNumberProps } from 'antd'
export default function NumberInput(props: InputNumberProps<number>) {
  return <InputNumber<number> {...props} />
}
