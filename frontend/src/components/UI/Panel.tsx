import type { ComponentPropsWithoutRef } from 'react'
export default function Panel({
  className = '',
  ...props
}: ComponentPropsWithoutRef<'section'>) {
  return <section className={`panel ${className}`} {...props} />
}
