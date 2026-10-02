import { Button as AntButton } from 'antd'
import type { ComponentPropsWithRef } from 'react'
export type ButtonProps = ComponentPropsWithRef<typeof AntButton>
export default function Button(props: ButtonProps) {
  return <AntButton htmlType="button" {...props} />
}
