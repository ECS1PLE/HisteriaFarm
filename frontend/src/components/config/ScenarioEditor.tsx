import { PlusOutlined, RobotOutlined } from '@ant-design/icons'
import { Button, Field, Input, Notice, StepInput } from '../UI'
interface Props {
  bot: string
  steps: string[]
  onBotChange: (bot: string) => void
  onStepsChange: (steps: string[]) => void
}
export default function ScenarioEditor({
  bot,
  steps,
  onBotChange,
  onStepsChange,
}: Props) {
  return (
    <>
      <Field label="Telegram-бот" htmlFor="bot">
        <Input
          id="bot"
          prefix={<RobotOutlined aria-hidden="true" />}
          value={bot}
          onChange={(e) => onBotChange(e.target.value)}
          placeholder="@example_bot"
        />
      </Field>
      <Field label="Шаги сценария" labelClassName="mt-6">
        <div className="scenario-steps">
          {steps.map((step, index) => (
            <StepInput
              key={index}
              number={index + 1}
              value={step}
              hasNext={index < steps.length - 1}
              onChange={(value) =>
                onStepsChange(steps.map((s, i) => (i === index ? value : s)))
              }
              onRemove={() =>
                onStepsChange(steps.filter((_, i) => i !== index))
              }
            />
          ))}
        </div>
        <Button
          block
          icon={<PlusOutlined aria-hidden="true" />}
          onClick={() => onStepsChange([...steps, ''])}
        >
          Добавить шаг
        </Button>
      </Field>
      <Notice
        className="mt-6"
        title="Сценарий — визуальный прототип"
        description="Выполнение действий в боте и Mini App будет подключено на следующем этапе. Здесь можно составить последовательность шагов."
      />
    </>
  )
}
