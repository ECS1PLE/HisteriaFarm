import type { ReactNode } from 'react'
interface Props {
  label: ReactNode
  htmlFor?: string
  labelClassName?: string
  help?: ReactNode
  children: ReactNode
}
export default function Field({
  label,
  htmlFor,
  labelClassName = '',
  help,
  children,
}: Props) {
  return (
    <>
      <label className={`field-label ${labelClassName}`} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {help && <p className="field-help">{help}</p>}
    </>
  )
}
