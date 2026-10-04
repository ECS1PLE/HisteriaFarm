import { api } from './api'

export type PublicationMode = 'messages' | 'comments'

export interface PublicationDelivery {
  id: string
  accountId: string
  name: string
  targetIndex: number
  state: 'pending' | 'sending' | 'sent' | 'failed' | 'unknown' | 'skipped'
  messageId: number | null
  error: string
}

export interface Publication {
  id: string
  mode: PublicationMode
  text: string
  expiresAt: string
  cancelled: boolean
  error: string
  targets: { link: string; title: string; discussionTitle: string | null }[]
  deliveries: PublicationDelivery[]
}

export function preparePublication(body: {
  mode: PublicationMode
  text: string
  targets: string[]
  accountIds: string[]
}) {
  return api<{ publication: Publication }>('publications/', { method: 'POST', body })
}

export function getPublication(id: string) {
  return api<{ publication: Publication }>(`publications/${id}/`)
}

export function cancelPublication(id: string) {
  return api<{ publication: Publication }>(`publications/${id}/`, { method: 'DELETE' })
}

export function sendPublicationDelivery(batchId: string, deliveryId: string) {
  return api<{ delivery: PublicationDelivery; stop: boolean }>(
    `publications/${batchId}/deliveries/${deliveryId}/`,
    { method: 'POST', body: { confirmed: true } },
  )
}
