interface Props {
  reaction: string
  selected: boolean
  onClick: () => void
}
export default function ReactionButton({ reaction, selected, onClick }: Props) {
  return (
    <button
      type="button"
      aria-label={`Реакция ${reaction}`}
      aria-pressed={selected}
      className={selected ? 'selected' : ''}
      onClick={onClick}
    >
      {reaction}
    </button>
  )
}
