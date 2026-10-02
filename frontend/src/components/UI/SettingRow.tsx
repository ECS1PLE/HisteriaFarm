import { Switch } from 'antd'
import type { ReactNode } from 'react'
interface Props {
  label: string
  description: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
}
export default function SettingRow({
  label,
  description,
  checked,
  onChange,
}: Props) {
  return (
    <div className="setting-row">
      <div>
        <strong>{label}</strong>
        <small>{description}</small>
      </div>
      <Switch aria-label={label} checked={checked} onChange={onChange} />
    </div>
  )
}
