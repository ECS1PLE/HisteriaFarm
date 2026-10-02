import { Progress } from 'antd'
interface Props {
  label: string
  status: string
  percent: number
  cancelled?: boolean
}
export default function ProgressStatus({
  label,
  status,
  percent,
  cancelled = false,
}: Props) {
  return (
    <div className="task-progress">
      <span className={`task-state task-state-${status}`}>{label}</span>
      <Progress
        percent={Math.floor(percent)}
        strokeColor={cancelled ? '#777c77' : '#a9e879'}
        size="small"
      />
    </div>
  )
}
