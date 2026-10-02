import type { ReactNode } from 'react'
export default function PageHeading({
  title,
  description,
  actions,
}: {
  title: string
  description: string
  actions: ReactNode
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">ТВОЙ ЦЕНТР УПРАВЛЕНИЯ</div>
        <h1>
          {title}
          <span className="heading-dot">.</span>
        </h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{actions}</div>
    </div>
  )
}
