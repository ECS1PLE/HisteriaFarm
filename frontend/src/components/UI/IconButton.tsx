import type { ReactNode } from 'react'
import Button from './Button'
import type { ButtonProps } from './Button'
interface Props extends Omit<ButtonProps, 'children' | 'aria-label' | 'icon'> {
  label: string
  icon: ReactNode
}
export default function IconButton({ label, icon, ...props }: Props) {
  return <Button {...props} aria-label={label} icon={icon} />
}
