import { Input as AntInput } from 'antd'
import type { ComponentPropsWithRef } from 'react'
export type InputProps = ComponentPropsWithRef<typeof AntInput>
export default function Input(props: InputProps) {
  return <AntInput {...props} />
}
