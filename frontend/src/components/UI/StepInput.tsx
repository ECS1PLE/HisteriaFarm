import { ArrowDownOutlined, DeleteOutlined } from '@ant-design/icons'
import Input from './Input'
import IconButton from './IconButton'
interface Props {
  number: number
  value: string
  hasNext: boolean
  onChange: (value: string) => void
  onRemove: () => void
}
export default function StepInput({
  number,
  value,
  hasNext,
  onChange,
  onRemove,
}: Props) {
  return (
    <div className="scenario-step">
      <span className="step-number">{number}</span>
      <Input
        aria-label={`Шаг ${number}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <IconButton
        type="text"
        danger
        icon={<DeleteOutlined aria-hidden="true" />}
        label={`Удалить шаг ${number}`}
        onClick={onRemove}
      />
      {hasNext && (
        <ArrowDownOutlined aria-hidden="true" className="step-arrow" />
      )}
    </div>
  )
}
