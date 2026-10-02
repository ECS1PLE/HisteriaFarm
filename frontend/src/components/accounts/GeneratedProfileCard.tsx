import { Avatar, Badge } from '../UI'
import type { Account, ProfileFields } from '../../types'
export interface GeneratedProfile {
  account: Account
  fields: ProfileFields
  avatar: File
  preview: string
  status: 'pending' | 'saving' | 'success' | 'error' | 'skipped'
  error?: string
}
export interface GenerationOptions {
  name: boolean
  username: boolean
  bio: boolean
  avatar: boolean
}
export default function GeneratedProfileCard({
  draft,
  options,
}: {
  draft: GeneratedProfile
  options: GenerationOptions
}) {
  const labels = {
    pending: 'Предпросмотр',
    saving: 'Сохраняется…',
    success: 'Сохранён',
    error: 'Есть ошибки',
    skipped: 'Пропущен',
  }
  const name = options.name ? draft.fields.firstName : draft.account.name
  return (
    <article
      className={`generated-profile ${draft.status === 'error' ? 'has-error' : ''}`}
    >
      <div className="generated-profile-head">
        <Avatar
          size={56}
          src={
            (options.avatar ? draft.preview : draft.account.avatarUrl) ||
            undefined
          }
          name={name}
        />
        <div>
          <strong>{name}</strong>
          <small>
            @
            {options.username
              ? draft.fields.username
              : draft.account.username || 'без username'}
          </small>
        </div>
        <Badge variant="group">{labels[draft.status]}</Badge>
      </div>
      <p>
        {(options.bio ? draft.fields.bio : draft.account.bio) || 'Без описания'}
      </p>
      <span className="field-help">{draft.account.phone}</span>
      {draft.error && <div className="profile-result-error">{draft.error}</div>}
    </article>
  )
}
