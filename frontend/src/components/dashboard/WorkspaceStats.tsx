import {
  CheckCircleOutlined,
  CheckOutlined,
  SafetyCertificateOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Badge, ConnectionDot, MiniBars, StatCard } from '../UI'
import { groups } from '../../data'
interface Props {
  total: number
  ready: number
  working: number
  attention: number
  activeTasks: number
}
export default function WorkspaceStats({
  total,
  ready,
  working,
  attention,
  activeTasks,
}: Props) {
  const percent = total ? (ready / total) * 100 : 0
  return (
    <div className="stats-grid">
      <StatCard
        label="Всего аккаунтов"
        icon={<UserOutlined aria-hidden="true" />}
        value={total}
        suffix={<span className="stat-caption">в пространстве</span>}
        footer={
          <>
            <span className="stat-mini-icon">
              <CheckOutlined aria-hidden="true" />
            </span>{' '}
            {groups.length} группы аккаунтов <MiniBars />
          </>
        }
      />
      <StatCard
        label="Готовы к работе"
        icon={<CheckCircleOutlined aria-hidden="true" />}
        value={ready}
        suffix={<Badge variant="percent">{Math.round(percent)}%</Badge>}
        highlighted
        progress={percent}
        footer={
          <>
            <ConnectionDot /> Можно запускать задачи
          </>
        }
      />
      <StatCard
        label="Выполняют задачи"
        icon={<ThunderboltOutlined aria-hidden="true" />}
        value={working}
        suffix={<span className="stat-caption">аккаунтов</span>}
        footer={
          <>
            <ConnectionDot tone="blue" /> Активных задач: {activeTasks}
          </>
        }
      />
      <StatCard
        label="Требуют внимания"
        icon={<SafetyCertificateOutlined aria-hidden="true" />}
        value={attention}
        suffix={
          <Badge variant="attention">
            {attention ? 'Проверить' : 'Всё хорошо'}
          </Badge>
        }
        footer={
          <>
            <ConnectionDot tone={attention ? 'amber' : 'default'} /> Ошибки и
            отключённые аккаунты
          </>
        }
      />
    </div>
  )
}
