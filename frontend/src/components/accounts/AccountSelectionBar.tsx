import { ThunderboltOutlined } from '@ant-design/icons'
import { Button } from '../UI'
export default function AccountSelectionBar({
  count,
  onClear,
  onLaunch,
}: {
  count: number
  onClear: () => void
  onLaunch: () => void
}) {
  if (!count) return null
  return (
    <div className="selection-bar">
      <span>
        Выбрано аккаунтов: <strong>{count}</strong>
      </span>
      <Button size="small" type="text" onClick={onClear}>
        Снять выбор
      </Button>
      <Button
        size="small"
        disabled
        title="Выполнение задач ещё не подключено"
        type="primary"
        icon={<ThunderboltOutlined aria-hidden="true" />}
        onClick={onLaunch}
      >
        Создать задачу
      </Button>
    </div>
  )
}
