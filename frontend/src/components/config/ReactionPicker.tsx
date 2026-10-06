import { Field, ReactionButton } from '../UI'
import { reactionOptions } from '../../data'
export default function ReactionPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <Field
      label="Выбери реакцию"
      help="Одна выбранная реакция от каждого аккаунта. Реакция заменит предыдущий выбор аккаунта на этом сообщении."
    >
      <div className="reaction-picker">
        {reactionOptions.map((reaction) => (
          <ReactionButton
            key={reaction}
            reaction={reaction}
            selected={value === reaction}
            disabled={disabled}
            onClick={() => onChange(reaction)}
          />
        ))}
      </div>
    </Field>
  )
}
