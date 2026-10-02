import {
  Alert,
  App,
  Button,
  Divider,
  Drawer,
  Input,
  InputNumber,
  Segmented,
  Tag,
} from 'antd'
import {
  ArrowDownOutlined,
  CommentOutlined,
  DeleteOutlined,
  HeartOutlined,
  LinkOutlined,
  PlusOutlined,
  RobotOutlined,
  SaveOutlined,
  UserAddOutlined,
} from '@ant-design/icons'
import { useState } from 'react'
import { modeLabels } from '../data'
import type { Mode, TaskConfig } from '../types'
interface Props {
  open: boolean
  section: string
  config: TaskConfig
  onClose: () => void
  onSave: (config: TaskConfig) => void
}
export default function ConfigDrawer({
  open,
  section,
  config,
  onClose,
  onSave,
}: Props) {
  const [draft, setDraft] = useState(config)
  const [target, setTarget] = useState('')
  const { message } = App.useApp()
  const change = <K extends keyof TaskConfig>(key: K, value: TaskConfig[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }))
  const addTarget = () => {
    const value = target.trim()
    if (!/^(https:\/\/t\.me\/[\w+/-]+|@[a-zA-Z0-9_]{5,})$/.test(value)) {
      message.warning('Введи ссылку https://t.me/… или @username')
      return
    }
    if (draft.targets.includes(value)) {
      message.info('Эта площадка уже добавлена')
      return
    }
    change('targets', [...draft.targets, value])
    setTarget('')
  }
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
        draft.steps.some((s) => !s.trim()))
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
      title={
        section === 'text'
          ? 'Тексты комментариев'
          : section === 'targets'
            ? 'Каналы и чаты'
            : 'Настройка режима'
      }
      open={open}
      onClose={onClose}
      size={480}
      className="config-drawer"
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Отмена</Button>
          <Button
            type="primary"
            icon={<SaveOutlined aria-hidden="true" />}
            onClick={save}
          >
            Сохранить настройки
          </Button>
        </div>
      }
    >
      <p className="drawer-description">
        Подготовь конфигурацию для следующей задачи.
      </p>
      {section === 'mode' && (
        <>
          <label className="field-label">Режим работы</label>
          <Segmented
            block
            value={draft.mode}
            onChange={(v) => change('mode', v as Mode)}
            options={[
              {
                value: 'comments',
                icon: <CommentOutlined aria-hidden="true" />,
                label: 'Текст',
              },
              {
                value: 'reactions',
                icon: <HeartOutlined aria-hidden="true" />,
                label: 'Реакции',
              },
              {
                value: 'subscriptions',
                icon: <UserAddOutlined aria-hidden="true" />,
                label: 'Подписки',
              },
              {
                value: 'scenario',
                icon: <RobotOutlined aria-hidden="true" />,
                label: 'Сценарий',
              },
            ]}
          />
          <Divider />
        </>
      )}
      {(section === 'text' ||
        (section === 'mode' && draft.mode === 'comments')) && (
        <>
          <label className="field-label" htmlFor="comment">
            Текст комментария
          </label>
          <Input.TextArea
            id="comment"
            rows={6}
            maxLength={4096}
            showCount
            value={draft.comment}
            onChange={(e) => change('comment', e.target.value)}
            placeholder="Напиши текст комментария…"
          />
          <p className="field-help">
            Текст для сообщений в чатах и комментариев под постами.
          </p>
        </>
      )}
      {section === 'mode' && draft.mode === 'reactions' && (
        <>
          <label className="field-label">Выбери реакцию</label>
          <div className="reaction-picker">
            {['👍', '❤️', '🔥', '👏', '🎉', '🤩'].map((r) => (
              <button
                key={r}
                aria-label={`Реакция ${r}`}
                aria-pressed={draft.reaction === r}
                className={draft.reaction === r ? 'selected' : ''}
                onClick={() => change('reaction', r)}
              >
                {r}
              </button>
            ))}
          </div>
          <p className="field-help">
            Реакция будет применяться к выбранным постам.
          </p>
        </>
      )}
      {(section === 'targets' ||
        (section === 'mode' && draft.mode !== 'scenario')) && (
        <>
          <Divider />
          <label className="field-label">
            Каналы и чаты <Tag>{draft.targets.length}</Tag>
          </label>
          <div className="flex gap-2">
            <Input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              onPressEnter={addTarget}
              placeholder="https://t.me/channel/123"
              aria-label="Новая площадка"
            />
            <Button
              icon={<PlusOutlined aria-hidden="true" />}
              onClick={addTarget}
              aria-label="Добавить площадку"
            />
          </div>
          <div className="target-list">
            {draft.targets.map((t) => (
              <div key={t}>
                <LinkOutlined aria-hidden="true" />
                <span>{t}</span>
                <Button
                  type="text"
                  size="small"
                  danger
                  icon={<DeleteOutlined aria-hidden="true" />}
                  aria-label={`Удалить ${t}`}
                  onClick={() =>
                    change(
                      'targets',
                      draft.targets.filter((x) => x !== t),
                    )
                  }
                />
              </div>
            ))}
          </div>
          <p className="field-help">
            Для поста добавь ссылку с его номером. Для чата или канала — ссылку
            или @username.
          </p>
        </>
      )}
      {section === 'mode' && draft.mode === 'scenario' && (
        <>
          <label className="field-label" htmlFor="bot">
            Telegram-бот
          </label>
          <Input
            id="bot"
            prefix={<RobotOutlined aria-hidden="true" />}
            value={draft.bot}
            onChange={(e) => change('bot', e.target.value)}
            placeholder="@example_bot"
          />
          <label className="field-label mt-6">Шаги сценария</label>
          <div className="scenario-steps">
            {draft.steps.map((step, i) => (
              <div className="scenario-step" key={i}>
                <span className="step-number">{i + 1}</span>
                <Input
                  aria-label={`Шаг ${i + 1}`}
                  value={step}
                  onChange={(e) =>
                    change(
                      'steps',
                      draft.steps.map((s, j) => (j === i ? e.target.value : s)),
                    )
                  }
                />
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined aria-hidden="true" />}
                  aria-label={`Удалить шаг ${i + 1}`}
                  onClick={() =>
                    change(
                      'steps',
                      draft.steps.filter((_, j) => j !== i),
                    )
                  }
                />
                {i < draft.steps.length - 1 && (
                  <ArrowDownOutlined
                    aria-hidden="true"
                    className="step-arrow"
                  />
                )}
              </div>
            ))}
          </div>
          <Button
            block
            icon={<PlusOutlined aria-hidden="true" />}
            onClick={() => change('steps', [...draft.steps, ''])}
          >
            Добавить шаг
          </Button>
          <Alert
            className="mt-6"
            title="Сценарий — визуальный прототип"
            description="Выполнение действий в боте и Mini App будет подключено на следующем этапе. Здесь можно составить последовательность шагов."
            type="info"
            showIcon
          />
        </>
      )}
      {section === 'mode' && (
        <>
          <Divider />
          <label className="field-label">Интервал между действиями</label>
          <div className="flex items-center gap-3">
            <InputNumber
              min={1}
              max={3600}
              value={draft.interval}
              onChange={(v) => change('interval', v ?? 5)}
              aria-label="Интервал"
            />
            <span className="muted-text">секунд</span>
          </div>
          <p className="field-help">
            В демо-режиме определяет скорость прогресса задачи.
          </p>
        </>
      )}
      <div className="config-summary">
        <span className="connection-dot" /> Текущий режим:{' '}
        {modeLabels[draft.mode]}
      </div>
    </Drawer>
  )
}
