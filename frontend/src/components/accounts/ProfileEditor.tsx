import { useState } from 'react'
import { App } from 'antd'
import { ThunderboltOutlined } from '@ant-design/icons'
import { Button, Field, Input, Notice, TextArea } from '../UI'
import AvatarUpload from '../UI/AvatarUpload'
import {
  randomAvatar,
  randomBio,
  randomFields,
  randomName,
  randomUsername,
} from '../../utils/profileGenerator'
import { saveProfile } from '../../services/accounts'
import type { Account, ProfileFields } from '../../types'
export default function ProfileEditor({
  account,
  onSaved,
  onBusy,
}: {
  account: Account
  onSaved: () => Promise<void>
  onBusy: (busy: boolean) => void
}) {
  const { message } = App.useApp()
  const [fields, setFields] = useState<ProfileFields>({
    firstName: account.firstName ?? account.name,
    lastName: account.lastName ?? '',
    username: account.username,
    bio: account.bio ?? '',
  })
  const [photo, setPhoto] = useState<File>()
  const [preview, setPreview] = useState(account.avatarUrl)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [generating, setGenerating] = useState(false)
  const patch = (field: keyof ProfileFields, value: string) =>
    setFields((prev) => ({ ...prev, [field]: value }))
  const generate = async (all: boolean) => {
    setGenerating(true)
    try {
      const avatar = await randomAvatar()
      setPhoto(avatar.file)
      setPreview(avatar.preview)
      if (all) setFields(randomFields())
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Ошибка генерации')
    } finally {
      setGenerating(false)
    }
  }
  const save = async () => {
    setBusy(true)
    onBusy(true)
    setErrors([])
    try {
      const result = await saveProfile(account.id, fields, photo)
      setErrors(result.errors)
      if (!result.errors.length) {
        setPhoto(undefined)
        setPreview(result.account.avatarUrl)
        setFields({
          firstName: result.account.firstName ?? result.account.name,
          lastName: result.account.lastName ?? '',
          username: result.account.username,
          bio: result.account.bio ?? '',
        })
        message.success('Профиль обновлён в Telegram')
      }
      await onSaved()
    } catch (e) {
      setErrors([e instanceof Error ? e.message : 'Ошибка обновления'])
      await onSaved().catch(() => undefined)
    } finally {
      setBusy(false)
      onBusy(false)
    }
  }
  return (
    <section className="profile-editor">
      <h3>Профиль Telegram</h3>
      <AvatarUpload
        src={preview}
        name={fields.firstName}
        disabled={busy || generating}
        onChange={(file, url) => {
          setPhoto(file)
          setPreview(url)
        }}
        onError={(text) => message.error(text)}
      />
      <div className="profile-generate-buttons">
        <Button
          size="small"
          loading={generating}
          disabled={busy}
          onClick={() => void generate(false)}
        >
          Случайная аватарка
        </Button>
        <Button
          size="small"
          disabled={busy || generating}
          icon={<ThunderboltOutlined aria-hidden="true" />}
          onClick={() => void generate(true)}
        >
          Сгенерировать всё
        </Button>
      </div>
      <fieldset disabled={busy || generating}>
        <Field
          htmlFor="profile-first-name"
          label={
            <span className="field-with-action">
              Имя{' '}
              <Button
                size="small"
                type="text"
                onClick={() => patch('firstName', randomName())}
              >
                Случайное
              </Button>
            </span>
          }
        >
          <Input
            id="profile-first-name"
            maxLength={64}
            value={fields.firstName}
            onChange={(e) => patch('firstName', e.target.value)}
          />
        </Field>
        <Field htmlFor="profile-last-name" label="Фамилия">
          <Input
            id="profile-last-name"
            maxLength={64}
            value={fields.lastName}
            onChange={(e) => patch('lastName', e.target.value)}
          />
        </Field>
        <Field
          htmlFor="profile-username"
          label={
            <span className="field-with-action">
              Username{' '}
              <Button
                size="small"
                type="text"
                onClick={() => patch('username', randomUsername())}
              >
                Случайный
              </Button>
            </span>
          }
          help="Латиница, цифры и подчёркивание, 5–32 символа. Пустое поле убирает username."
        >
          <Input
            id="profile-username"
            prefix="@"
            maxLength={32}
            value={fields.username}
            onChange={(e) =>
              patch('username', e.target.value.replace(/^@/, ''))
            }
          />
        </Field>
        <Field
          htmlFor="profile-bio"
          label={
            <span className="field-with-action">
              Описание{' '}
              <Button
                size="small"
                type="text"
                onClick={() => patch('bio', randomBio())}
              >
                Случайное
              </Button>
            </span>
          }
        >
          <TextArea
            id="profile-bio"
            rows={3}
            maxLength={account.premium ? 140 : 70}
            showCount
            value={fields.bio}
            onChange={(e) => patch('bio', e.target.value)}
          />
        </Field>
      </fieldset>
      {errors.length > 0 && (
        <Notice
          className="mt-4"
          type="warning"
          title="Проверь результат сохранения"
          description={errors.join(' ')}
        />
      )}
      <Button
        block
        className="mt-6"
        type="primary"
        loading={busy}
        disabled={generating || !fields.firstName.trim()}
        onClick={() => void save()}
      >
        Сохранить в Telegram
      </Button>
    </section>
  )
}
