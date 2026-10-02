import { Divider } from 'antd'
import { Field, NumberInput } from '../UI'
export default function IntervalField({
  value,
  onChange,
}: {
  value: number
  onChange: (value: number) => void
}) {
  return (
    <>
      <Divider />
      <Field
        label="Интервал между действиями"
        help="Пауза между действиями для будущего исполнителя задач."
      >
        <div className="flex items-center gap-3">
          <NumberInput
            min={1}
            max={3600}
            value={value}
            onChange={(interval) => onChange(interval ?? 5)}
            aria-label="Интервал"
          />
          <span className="muted-text">секунд</span>
        </div>
      </Field>
    </>
  )
}
