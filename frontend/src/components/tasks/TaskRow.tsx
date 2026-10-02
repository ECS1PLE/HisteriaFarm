import { CheckOutlined } from '@ant-design/icons'
import { ProgressStatus } from '../UI'
import ModeIcon from '../common/ModeIcon'
import TaskActions from './TaskActions'
import { modeLabels } from '../../data'
import type { Task } from '../../types'
const taskLabels = {
  running: 'Выполняется',
  paused: 'На паузе',
  completed: 'Завершена',
  cancelled: 'Отменена',
}
interface Props {
  task: Task
  onToggle: (id: string) => void
  onStop: (id: string) => void
}
export default function TaskRow({ task, onToggle, onStop }: Props) {
  return (
    <div className="task-row">
      <span
        className={`task-mode-icon ${task.status === 'completed' ? 'complete' : ''}`}
      >
        {task.status === 'completed' ? (
          <CheckOutlined aria-hidden="true" />
        ) : (
          <ModeIcon mode={task.mode} />
        )}
      </span>
      <div className="task-info">
        <strong>{task.name}</strong>
        <small>
          {modeLabels[task.mode]} · {task.accountIds.length} аккаунтов ·{' '}
          {task.createdAt}
        </small>
        <small>
          {task.mode === 'scenario'
            ? task.config.bot
            : `${task.config.targets.length} площадки`}{' '}
          · интервал {task.config.interval} сек.
        </small>
      </div>
      <ProgressStatus
        label={taskLabels[task.status]}
        status={task.status}
        percent={task.progress}
        cancelled={task.status === 'cancelled'}
      />
      <TaskActions task={task} onToggle={onToggle} onStop={onStop} />
    </div>
  )
}
