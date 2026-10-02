import { Avatar as AntAvatar } from 'antd'
import type { AvatarProps } from 'antd'
interface Props extends AvatarProps {
  name?: string
  color?: string
  bordered?: boolean
  tint?: string
}
export default function Avatar({
  name,
  color,
  bordered = false,
  tint = '22',
  style,
  children,
  ...props
}: Props) {
  return (
    <AntAvatar
      {...props}
      style={{
        ...(color
          ? {
              background: `${color}${tint}`,
              color,
              ...(bordered ? { border: `1px solid ${color}30` } : {}),
            }
          : {}),
        ...style,
      }}
    >
      {children ??
        name
          ?.split(' ')
          .map((word) => word[0])
          .join('')}
    </AntAvatar>
  )
}
