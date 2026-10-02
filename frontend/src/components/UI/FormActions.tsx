import type { ReactNode } from 'react'
import Button from './Button'
interface Props {
  onCancel: () => void
  onSubmit: () => void
  submitText: string
  submitIcon?: ReactNode
}
export default function FormActions({
  onCancel,
  onSubmit,
  submitText,
  submitIcon,
}: Props) {
  return (
    <div className="flex justify-end gap-2">
      <Button onClick={onCancel}>Отмена</Button>
      <Button type="primary" icon={submitIcon} onClick={onSubmit}>
        {submitText}
      </Button>
    </div>
  )
}
