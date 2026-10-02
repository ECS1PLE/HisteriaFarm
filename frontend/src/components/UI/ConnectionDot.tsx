export type DotTone = 'default' | 'blue' | 'amber' | 'bad' | 'muted'
export default function ConnectionDot({
  tone = 'default',
}: {
  tone?: DotTone
}) {
  return (
    <span
      className={`connection-dot${tone === 'default' ? '' : ` ${tone}`}`}
      aria-hidden="true"
    />
  )
}
