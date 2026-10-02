import { DeleteOutlined } from '@ant-design/icons'
import type { ReactNode } from 'react'
import IconButton from './IconButton'
interface Props {
  icon: ReactNode
  children: ReactNode
  removeLabel: string
  onRemove: () => void
}
export default function RemovableItem({
  icon,
  children,
  removeLabel,
  onRemove,
}: Props) {
  return (
    <div>
      {icon}
      <span>{children}</span>
      <IconButton
        type="text"
        size="small"
        danger
        icon={<DeleteOutlined aria-hidden="true" />}
        label={removeLabel}
        onClick={onRemove}
      />
    </div>
  )
}
