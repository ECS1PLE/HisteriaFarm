import { api } from './api'
import type { Account, ProfileFields } from '../types'
export interface ProfileResult {
  account: Account
  errors: string[]
}
export function saveProfile(
  id: string,
  fields: Partial<ProfileFields>,
  avatar?: File,
) {
  const body = new FormData()
  body.set('profile', JSON.stringify(fields))
  if (avatar) body.set('avatar', avatar)
  return api<ProfileResult>(`accounts/${id}/profile/`, {
    method: 'POST',
    body,
  })
}
