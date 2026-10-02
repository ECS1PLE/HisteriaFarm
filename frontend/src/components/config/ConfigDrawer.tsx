import { useState } from 'react'
import { App } from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import { Drawer, FormActions } from '../UI'
import ModeSelector from './ModeSelector'
import CommentEditor from './CommentEditor'
import ReactionPicker from './ReactionPicker'
import TargetsEditor from './TargetsEditor'
import ScenarioEditor from './ScenarioEditor'
import IntervalField from './IntervalField'
import ConfigSummary from './ConfigSummary'
import type { ConfigSection, TaskConfig } from '../../types'
interface Props {
  open: boolean
  section: ConfigSection
  config: TaskConfig
  onClose: () => void
  onSave: (config: TaskConfig) => void
}
const titles = {
  text: 'Тексты комментариев',
  targets: 'Каналы и чаты',
  mode: 'Настройка режима',
}
export default function ConfigDrawer({
  open,
  section,
  config,
  onClose,
  onSave,
}: Props) {
  const [draft, setDraft] = useState(config)
  const { message } = App.useApp()
  const change = <Key extends keyof TaskConfig>(
    key: Key,
    value: TaskConfig[Key],
  ) => setDraft((prev) => ({ ...prev, [key]: value }))
  const save = () => {
    if (draft.mode === 'comments' && !draft.comment.trim()) {
      message.warning('Добавь текст комментария')
      return
    }
    if (draft.mode !== 'scenario' && !draft.targets.length) {
      message.warning('Добавь хотя бы один канал или чат')
      return
    }
    if (
      draft.mode === 'scenario' &&
      (!/^@[a-zA-Z0-9_]{5,}$/.test(draft.bot) ||
        !draft.steps.length ||
        draft.steps.some((step) => !step.trim()))
    ) {
      message.warning('Укажи @username бота и заполни шаги')
      return
    }
    onSave(draft)
    onClose()
    message.success('Конфигурация сохранена')
  }
  return (
    <Drawer
      title={titles[section]}
      open={open}
      onClose={onClose}
      size={480}
      className="config-drawer"
      footer={
        <FormActions
          onCancel={onClose}
          onSubmit={save}
          submitText="Сохранить настройки"
          submitIcon={<SaveOutlined aria-hidden="true" />}
        />
      }
    >
      <p className="drawer-description">
        Подготовь конфигурацию для следующей задачи.
      </p>
      {section === 'mode' && (
        <ModeSelector
          value={draft.mode}
          onChange={(mode) => change('mode', mode)}
        />
      )}
      {(section === 'text' ||
        (section === 'mode' && draft.mode === 'comments')) && (
        <CommentEditor
          value={draft.comment}
          onChange={(comment) => change('comment', comment)}
        />
      )}
      {section === 'mode' && draft.mode === 'reactions' && (
        <ReactionPicker
          value={draft.reaction}
          onChange={(reaction) => change('reaction', reaction)}
        />
      )}
      {(section === 'targets' ||
        (section === 'mode' && draft.mode !== 'scenario')) && (
        <TargetsEditor
          targets={draft.targets}
          onChange={(targets) => change('targets', targets)}
        />
      )}
      {section === 'mode' && draft.mode === 'scenario' && (
        <ScenarioEditor
          bot={draft.bot}
          steps={draft.steps}
          onBotChange={(bot) => change('bot', bot)}
          onStepsChange={(steps) => change('steps', steps)}
        />
      )}
      {section === 'mode' && (
        <IntervalField
          value={draft.interval}
          onChange={(interval) => change('interval', interval)}
        />
      )}
      <ConfigSummary mode={draft.mode} />
    </Drawer>
  )
}
