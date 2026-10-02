import { Divider, Segmented } from 'antd'
import { Field } from '../UI'
import ModeIcon from '../common/ModeIcon'
import type { Mode } from '../../types'
export default function ModeSelector({
  value,
  onChange,
}: {
  value: Mode
  onChange: (mode: Mode) => void
}) {
  return (
    <>
      <Field label="Режим работы">
        <Segmented
          block
          value={value}
          onChange={(mode) => onChange(mode as Mode)}
          options={[
            {
              value: 'comments',
              label: 'Текст',
              icon: <ModeIcon mode="comments" />,
            },
            {
              value: 'reactions',
              label: 'Реакции',
              icon: <ModeIcon mode="reactions" />,
            },
            {
              value: 'subscriptions',
              label: 'Подписки',
              icon: <ModeIcon mode="subscriptions" />,
            },
            {
              value: 'scenario',
              label: 'Сценарий',
              icon: <ModeIcon mode="scenario" />,
            },
          ]}
        />
      </Field>
      <Divider />
    </>
  )
}
