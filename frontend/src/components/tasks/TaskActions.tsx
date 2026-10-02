import {
  PauseOutlined,
  PlayCircleOutlined,
  StopOutlined,
} from '@ant-design/icons'
import { IconButton } from '../UI'
import type { Task } from '../../types'
interface Props {
  task: Task
  onToggle: (id: string) => void
  onStop: (id: string) => void
}
export default function TaskActions({ task, onToggle, onStop }: Props) {
  return (
    <div className="flex gap-2">
      {(task.status === 'running' || task.status === 'paused') && (
        <>
          <IconButton
            label={
              task.status === 'paused'
                ? 'Продолжить задачу'
                : 'Приостановить задачу'
            }
            icon={
              task.status === 'paused' ? (
                <PlayCircleOutlined aria-hidden="true" />
              ) : (
                <PauseOutlined aria-hidden="true" />
              )
            }
            onClick={() => onToggle(task.id)}
          />
          <IconButton
            label="Остановить задачу"
            icon={<StopOutlined aria-hidden="true" />}
            onClick={() => onStop(task.id)}
          />
        </>
      )}
    </div>
  )
}
