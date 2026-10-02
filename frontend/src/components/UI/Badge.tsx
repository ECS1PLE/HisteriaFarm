import type { ReactNode } from 'react'
const classes = {
  count: 'count-tag',
  group: 'group-tag',
  percent: 'stat-percent',
  attention: 'attention-tag',
  nav: 'nav-count',
  version: 'footer-version',
}
export default function Badge({
  variant = 'count',
  children,
}: {
  variant?: keyof typeof classes
  children: ReactNode
}) {
  return <span className={classes[variant]}>{children}</span>
}
