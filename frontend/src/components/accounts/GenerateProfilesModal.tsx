import { useEffect, useRef, useState } from 'react'
import { Checkbox, Progress } from 'antd'
import { Button, Modal, Notice } from '../UI'
import GeneratedProfileCard from './GeneratedProfileCard'
import type {
  GeneratedProfile,
  GenerationOptions,
} from './GeneratedProfileCard'
import { randomAvatar, randomFields } from '../../utils/profileGenerator'
import { ApiError } from '../../services/api'
import { saveProfile } from '../../services/accounts'
import type { Account, ProfileFields } from '../../types'
async function draftsFor(accounts: Account[]) {
  const usernames = new Set(accounts.map((a) => a.username))
  return Promise.all(
    accounts.map(async (account) => {
      const fields = randomFields()
      while (usernames.has(fields.username))
        fields.username = randomFields().username
      usernames.add(fields.username)
      const avatar = await randomAvatar()
      return {
        account,
        fields,
        avatar: avatar.file,
        preview: avatar.preview,
        status: 'pending' as const,
      }
    }),
  )
}
export default function GenerateProfilesModal({
  accounts,
  selected,
  onClose,
  onApplied,
}: {
  accounts: Account[]
  selected: boolean
  onClose: () => void
  onApplied: () => Promise<void>
}) {
  const [targets] = useState(accounts)
  const [drafts, setDrafts] = useState<GeneratedProfile[]>([])
  const [options, setOptions] = useState<GenerationOptions>({
    name: true,
    username: true,
    bio: true,
    avatar: true,
  })
  const [generating, setGenerating] = useState(true)
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)
  const [error, setError] = useState('')
  const stop = useRef(false)
  useEffect(() => {
    let active = true
    draftsFor(targets)
      .then((result) => {
        if (active) {
          setDrafts(result)
          setGenerating(false)
        }
      })
      .catch((e) => {
        if (active) {
          setError(String(e))
          setGenerating(false)
        }
      })
    return () => {
      active = false
    }
  }, [targets])
  const regenerate = async () => {
    setGenerating(true)
    setError('')
    setFinished(false)
    try {
      setDrafts(await draftsFor(targets))
    } catch (e) {
      setError(String(e))
    } finally {
      setGenerating(false)
    }
  }
  const mark = (
    id: string,
    status: GeneratedProfile['status'],
    error?: string,
  ) =>
    setDrafts((prev) =>
      prev.map((d) => (d.account.id === id ? { ...d, status, error } : d)),
    )
  const apply = async () => {
    setRunning(true)
    setError('')
    stop.current = false
    for (const draft of drafts) {
      if (stop.current) {
        mark(draft.account.id, 'skipped')
        continue
      }
      mark(draft.account.id, 'saving')
      const fields: Partial<ProfileFields> = {}
      if (options.name) {
        fields.firstName = draft.fields.firstName
        fields.lastName = draft.fields.lastName
      }
      if (options.username) fields.username = draft.fields.username
      if (options.bio) fields.bio = draft.fields.bio
      try {
        const result = await saveProfile(
          draft.account.id,
          fields,
          options.avatar ? draft.avatar : undefined,
        )
        mark(
          draft.account.id,
          result.errors.length ? 'error' : 'success',
          result.errors.join(' '),
        )
        if (result.errors.some((text) => text.includes('подождать')))
          stop.current = true
      } catch (e) {
        const text = e instanceof Error ? e.message : 'Ошибка сохранения'
        mark(draft.account.id, 'error', text)
        if (
          (e instanceof ApiError && (e.status === 401 || e.status === 0)) ||
          text.includes('подождать')
        )
          stop.current = true
      }
    }
    try {
      await onApplied()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось обновить список')
    }
    setRunning(false)
    setFinished(true)
  }
  const completed = drafts.filter(
    (d) => !['pending', 'saving'].includes(d.status),
  ).length
  const successes = drafts.filter((d) => d.status === 'success').length
  return (
    <Modal
      title={`Новые профили · ${targets.length} аккаунтов`}
      open
      width={900}
      onCancel={onClose}
      closable={!running}
      maskClosable={!running}
      keyboard={!running}
      footer={
        <div className="generator-footer">
          {running ? (
            <Button
              onClick={() => {
                stop.current = true
              }}
            >
              Остановить после текущего
            </Button>
          ) : (
            <Button onClick={onClose}>Закрыть</Button>
          )}
          <Button
            disabled={running}
            loading={generating}
            onClick={() => void regenerate()}
          >
            Перегенерировать
          </Button>
          <Button
            type="primary"
            loading={running}
            disabled={
              generating ||
              finished ||
              !drafts.length ||
              !Object.values(options).some(Boolean)
            }
            onClick={() => void apply()}
          >
            Применить {selected ? 'выбранным' : 'всем'} ({targets.length})
          </Button>
        </div>
      }
    >
      <p className="modal-description">
        Проверь новые профили перед сохранением в Telegram. Фото — случайные
        абстрактные композиции.
      </p>
      <div className="generator-options">
        {(['name', 'username', 'bio', 'avatar'] as const).map((key, i) => (
          <Checkbox
            key={key}
            disabled={running || finished}
            checked={options[key]}
            onChange={(e) =>
              setOptions((prev) => ({ ...prev, [key]: e.target.checked }))
            }
          >
            {['Имя', 'Username', 'Описание', 'Аватарка'][i]}
          </Checkbox>
        ))}
      </div>
      {error && <Notice type="error" title={error} className="mb-4" />}
      {(running || finished) && (
        <>
          <Progress
            percent={Math.round((completed / Math.max(drafts.length, 1)) * 100)}
          />
          <p className="field-help">
            Обработано {completed} из {drafts.length} · полностью сохранено{' '}
            {successes}
          </p>
        </>
      )}
      {finished && (
        <Notice
          className="mb-4"
          title="Обработка завершена"
          description="Результат каждого аккаунта указан ниже. Уже выполненные изменения остаются в Telegram."
        />
      )}
      <div className="generated-profile-grid">
        {drafts.map((d) => (
          <GeneratedProfileCard
            key={d.account.id}
            draft={d}
            options={options}
          />
        ))}
      </div>
      {generating && <p className="muted-text">Генерируем профили…</p>}
    </Modal>
  )
}
