import type { ReactNode } from 'react'
interface Props {
  label: ReactNode
  htmlFor?: string
  labelClassName?: string
  action?: ReactNode
  help?: ReactNode
  children: ReactNode
}
export default function Field({ label, htmlFor, labelClassName = '', action, help, children }: Props) {
  const caption = <label className={`field-label ${labelClassName}`} htmlFor={htmlFor}>{label}</label>
  return <>
    {action ? <div className="field-with-action">{caption}{action}</div> : caption}
    {children}
    {help && <p className="field-help">{help}</p>}
  </>
}
