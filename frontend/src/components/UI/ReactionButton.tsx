interface Props {
  reaction: string
  selected: boolean
  disabled?: boolean
  onClick: () => void
}
export default function ReactionButton({ reaction, selected, disabled = false, onClick }: Props) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-label={`Реакция ${reaction}`}
      aria-pressed={selected}
      className={selected ? 'selected' : ''}
      onClick={onClick}
    >
      {reaction}
    </button>
  )
}
