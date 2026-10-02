import { Empty } from 'antd'
import type { ReactNode } from 'react'
interface Props {
  description: string
  help?: ReactNode
  action?: ReactNode
  className?: string
}
export default function EmptyState({
  description,
  help,
  action,
  className,
}: Props) {
  const content = (
    <>
      <Empty description={description} image={Empty.PRESENTED_IMAGE_SIMPLE} />
      {help && <p>{help}</p>}
      {action}
    </>
  )
  return className ? <div className={className}>{content}</div> : content
}
