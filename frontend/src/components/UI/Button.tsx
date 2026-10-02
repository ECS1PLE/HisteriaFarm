import { Button as AntButton } from 'antd'
import type { ComponentPropsWithRef } from 'react'
export type ButtonProps = ComponentPropsWithRef<typeof AntButton>
export default function Button(props: ButtonProps) {
  const label = props['aria-label'] ?? (typeof props.children === 'string' ? props.children : undefined)
  return <AntButton htmlType="button" {...props} aria-label={label} />
}
