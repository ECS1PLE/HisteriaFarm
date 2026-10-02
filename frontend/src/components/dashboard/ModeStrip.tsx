import { ArrowRightOutlined } from '@ant-design/icons'
import { Button, InfoStrip } from '../UI'
import ModeIcon from '../common/ModeIcon'
import { modeLabels } from '../../data'
import type { TaskConfig } from '../../types'
export default function ModeStrip({
  config,
  onConfigure,
}: {
  config: TaskConfig
  onConfigure: () => void
}) {
  return (
    <InfoStrip
      icon={<ModeIcon mode={config.mode} />}
      title={`Режим: ${modeLabels[config.mode]}`}
      description={
        config.mode === 'scenario'
          ? `${config.steps.length} шага · ${config.bot}`
          : `${config.targets.length} площадки · интервал ${config.interval} сек.`
      }
      note="Конфигурация для следующей задачи"
      action={
        <Button
          type="text"
          icon={<ArrowRightOutlined aria-hidden="true" />}
          iconPlacement="end"
          onClick={onConfigure}
        >
          Настроить
        </Button>
      }
    />
  )
}
