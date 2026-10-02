import { Field, ReactionButton } from '../UI'
const reactions = ['👍', '❤️', '🔥', '👏', '🎉', '🤩']
export default function ReactionPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <Field
      label="Выбери реакцию"
      help="Реакция будет применяться к выбранным постам."
    >
      <div className="reaction-picker">
        {reactions.map((reaction) => (
          <ReactionButton
            key={reaction}
            reaction={reaction}
            selected={value === reaction}
            onClick={() => onChange(reaction)}
          />
        ))}
      </div>
    </Field>
  )
}
