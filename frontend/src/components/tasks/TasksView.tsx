import { PlayCircleOutlined } from '@ant-design/icons'
import { Button, EmptyState, Panel, PanelHeading } from '../UI'
import TaskRow from './TaskRow'
import type { Task } from '../../types'
interface Props {
  tasks: Task[]
  onToggle: (id: string) => void
  onStop: (id: string) => void
  onCreate: () => void
}
export default function TasksView({
  tasks,
  onToggle,
  onStop,
  onCreate,
}: Props) {
  return (
    <Panel className="tasks-panel">
      <PanelHeading
        title="Очередь задач"
        count={tasks.length}
        action={
          <span className="muted-text">Выполнение ещё не подключено</span>
        }
      />
      {!tasks.length ? (
        <EmptyState
          className="task-empty"
          description="Здесь появятся твои задачи"
          help="Управление задачами появится после подключения исполнителя."
          action={
            <Button
              type="primary"
              icon={<PlayCircleOutlined aria-hidden="true" />}
              onClick={onCreate}
            >
              Создать задачу
            </Button>
          }
        />
      ) : (
        <div className="task-list">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onToggle={onToggle}
              onStop={onStop}
            />
          ))}
        </div>
      )}
    </Panel>
  )
}
