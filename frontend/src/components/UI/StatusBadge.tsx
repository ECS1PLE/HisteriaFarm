interface Props {
  label: string
  variant: string
}
export default function StatusBadge({ label, variant }: Props) {
  return (
    <span className={`status-badge status-${variant}`}>
      <span aria-hidden="true" />
      {label}
    </span>
  )
}
