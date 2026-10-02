import { useState } from 'react'
import { App, Divider, Tag } from 'antd'
import { LinkOutlined, PlusOutlined } from '@ant-design/icons'
import { Field, IconButton, Input, RemovableItem } from '../UI'
export default function TargetsEditor({
  targets,
  onChange,
}: {
  targets: string[]
  onChange: (targets: string[]) => void
}) {
  const [target, setTarget] = useState('')
  const { message } = App.useApp()
  const addTarget = () => {
    const value = target.trim()
    if (!/^(https:\/\/t\.me\/[\w+/-]+|@[a-zA-Z0-9_]{5,})$/.test(value)) {
      message.warning('Введи ссылку https://t.me/… или @username')
      return
    }
    if (targets.includes(value)) {
      message.info('Эта площадка уже добавлена')
      return
    }
    onChange([...targets, value])
    setTarget('')
  }
  return (
    <>
      <Divider />
      <Field
        label={
          <>
            Каналы и чаты <Tag>{targets.length}</Tag>
          </>
        }
        help="Для поста добавь ссылку с его номером. Для чата или канала — ссылку или @username."
      >
        <div className="flex gap-2">
          <Input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            onPressEnter={addTarget}
            placeholder="https://t.me/channel/123"
            aria-label="Новая площадка"
          />
          <IconButton
            icon={<PlusOutlined aria-hidden="true" />}
            onClick={addTarget}
            label="Добавить площадку"
          />
        </div>
        <div className="target-list">
          {targets.map((value) => (
            <RemovableItem
              key={value}
              icon={<LinkOutlined aria-hidden="true" />}
              removeLabel={`Удалить ${value}`}
              onRemove={() => onChange(targets.filter((t) => t !== value))}
            >
              {value}
            </RemovableItem>
          ))}
        </div>
      </Field>
    </>
  )
}
