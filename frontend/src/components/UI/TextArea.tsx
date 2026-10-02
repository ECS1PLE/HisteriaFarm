import { Input } from 'antd'
import type { ComponentPropsWithRef } from 'react'
export default function TextArea(
  props: ComponentPropsWithRef<typeof Input.TextArea>,
) {
  return <Input.TextArea {...props} />
}
