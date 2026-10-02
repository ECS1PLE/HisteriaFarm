import type { ReactNode } from 'react'
interface Props {
  icon: ReactNode
  title: ReactNode
  description: ReactNode
  note?: ReactNode
  action?: ReactNode
}
export default function InfoStrip({
  icon,
  title,
  description,
  note,
  action,
}: Props) {
  return (
    <div className="mode-strip">
      <span className="mode-strip-icon">{icon}</span>
      <div>
        <strong>{title}</strong>
        <span>{description}</span>
      </div>
      {note && (
        <>
          <span className="mode-strip-divider" />
          <span className="mode-strip-note">{note}</span>
        </>
      )}
      {action}
    </div>
  )
}
