import { Button, Empty, Progress } from 'antd'
import {
  CheckOutlined,
  CommentOutlined,
  HeartOutlined,
  PauseOutlined,
  PlayCircleOutlined,
  RobotOutlined,
  StopOutlined,
  UserAddOutlined,
} from '@ant-design/icons'
import type { Task } from '../types'
import { modeLabels } from '../data'
const icons = {
  comments: <CommentOutlined aria-hidden="true" />,
  reactions: <HeartOutlined aria-hidden="true" />,
  subscriptions: <UserAddOutlined aria-hidden="true" />,
  scenario: <RobotOutlined aria-hidden="true" />,
}
const taskLabels = {
  running: 'Выполняется',
  paused: 'На паузе',
  completed: 'Завершена',
  cancelled: 'Отменена',
}
export default function TasksView({
  tasks,
  onToggle,
  onStop,
  onCreate,
}: {
  tasks: Task[]
  onToggle: (id: string) => void
  onStop: (id: string) => void
  onCreate: () => void
}) {
  return (
    <section className="panel tasks-panel">
      <div className="panel-heading">
        <h2>
          Очередь задач <span className="count-tag">{tasks.length}</span>
        </h2>
        <span className="muted-text">Демонстрация выполнения</span>
      </div>
      {!tasks.length ? (
        <div className="task-empty">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="Здесь появятся твои задачи"
          />
          <p>Выбери режим и аккаунты, чтобы запустить первую демонстрацию.</p>
          <Button
            type="primary"
            icon={<PlayCircleOutlined aria-hidden="true" />}
            onClick={onCreate}
          >
            Создать задачу
          </Button>
        </div>
      ) : (
        <div className="task-list">
          {tasks.map((t) => (
            <div className="task-row" key={t.id}>
              <span
                className={`task-mode-icon ${t.status === 'completed' ? 'complete' : ''}`}
              >
                {t.status === 'completed' ? (
                  <CheckOutlined aria-hidden="true" />
                ) : (
                  icons[t.mode]
                )}
              </span>
              <div className="task-info">
                <strong>{t.name}</strong>
                <small>
                  {modeLabels[t.mode]} · {t.accountIds.length} аккаунтов ·{' '}
                  {t.createdAt}
                </small>
                <small>
                  {t.mode === 'scenario'
                    ? t.config.bot
                    : `${t.config.targets.length} площадки`}{' '}
                  · интервал {t.config.interval} сек.
                </small>
              </div>
              <div className="task-progress">
                <span className={`task-state task-state-${t.status}`}>
                  {taskLabels[t.status]}
                </span>
                <Progress
                  percent={Math.floor(t.progress)}
                  strokeColor={t.status === 'cancelled' ? '#777c77' : '#a9e879'}
                  size="small"
                />
              </div>
              <div className="flex gap-2">
                {(t.status === 'running' || t.status === 'paused') && (
                  <>
                    <Button
                      aria-label={
                        t.status === 'paused'
                          ? 'Продолжить задачу'
                          : 'Приостановить задачу'
                      }
                      icon={
                        t.status === 'paused' ? (
                          <PlayCircleOutlined aria-hidden="true" />
                        ) : (
                          <PauseOutlined aria-hidden="true" />
                        )
                      }
                      onClick={() => onToggle(t.id)}
                    />
                    <Button
                      aria-label="Остановить задачу"
                      icon={<StopOutlined aria-hidden="true" />}
                      onClick={() => onStop(t.id)}
                    />
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
