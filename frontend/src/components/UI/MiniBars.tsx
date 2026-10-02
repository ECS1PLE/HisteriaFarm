const defaultValues = [35, 48, 38, 64, 52, 76, 70, 90, 82, 100]
export default function MiniBars({
  values = defaultValues,
}: {
  values?: number[]
}) {
  return (
    <div className="mini-bars" aria-hidden="true">
      {values.map((value, index) => (
        <i key={index} style={{ height: `${value}%` }} />
      ))}
    </div>
  )
}
