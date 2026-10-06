import { api } from './api'

export type PublicationMode = 'messages' | 'comments' | 'direct' | 'reactions' | 'subscriptions'

export interface PublicationDelivery {
  id: string
  accountId: string
  name: string
  targetIndex: number
  state: 'pending' | 'sending' | 'sent' | 'requested' | 'failed' | 'unknown' | 'skipped'
  messageId: number | null
  error: string
}

export interface DeliveryResult {
  delivery: PublicationDelivery
  stop: boolean
  skippedAccountId?: string | null
}

export interface Publication {
  id: string
  mode: PublicationMode
  text: string
  reaction: string | null
  expiresAt: string
  cancelled: boolean
  error: string
  targets: { link: string; title: string; discussionTitle: string | null; messagePreview?: string | null; requestNeeded?: boolean }[]
  deliveries: PublicationDelivery[]
}

export function preparePublication(body: {
  mode: PublicationMode
  text: string
  reaction?: string
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
  return api<DeliveryResult>(
    `publications/${batchId}/deliveries/${deliveryId}/`,
    { method: 'POST', body: { confirmed: true } },
  )
}

export function skipPublicationAccount(batchId: string, deliveryId: string) {
  return api<DeliveryResult>(`publications/${batchId}/deliveries/${deliveryId}/skip-account/`, {
    method: 'POST', body: { confirmed: true },
  })
}
