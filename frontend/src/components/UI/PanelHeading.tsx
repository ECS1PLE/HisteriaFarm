import type { ReactNode } from 'react'
import Badge from './Badge'
interface Props {
  title: ReactNode
  count?: number
  action?: ReactNode
  separateCount?: boolean
}
export default function PanelHeading({
  title,
  count,
  action,
  separateCount = false,
}: Props) {
  const heading = (
    <h2>
      {title}
      {count !== undefined && !separateCount && (
        <>
          {' '}
          <Badge>{count}</Badge>
        </>
      )}
    </h2>
  )
  return (
    <div className="panel-heading">
      {separateCount ? (
        <div className="flex items-center gap-3">
          {heading}
          {count !== undefined && <Badge>{count}</Badge>}
        </div>
      ) : (
        heading
      )}
      {action}
    </div>
  )
}
