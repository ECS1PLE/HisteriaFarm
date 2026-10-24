import type { DeliveryResult, PublicationDelivery } from './publications'

interface QueueOptions {
  shouldStop: () => boolean
  send: (delivery: PublicationDelivery) => Promise<DeliveryResult>
  skipAccount: (delivery: PublicationDelivery) => Promise<DeliveryResult>
  isFatalError: (error: unknown) => boolean
  onSending: (delivery: PublicationDelivery) => void
  onResult: (delivery: PublicationDelivery) => void
  onSkipped: (accountId: string, detail: string) => void
}

export async function runPublicationQueue(deliveries: PublicationDelivery[], options: QueueOptions): Promise<boolean> {
  const skipped = new Set<string>()
  for (const delivery of deliveries) {
    if (options.shouldStop()) return true
    if (delivery.state !== 'pending' || skipped.has(delivery.accountId)) continue
    options.onSending({ ...delivery, state: 'sending' })
    let result: DeliveryResult
    try {
      result = await options.send(delivery)
    } catch (error) {
      if (options.isFatalError(error)) throw error
      try {
        // Resolve a lost HTTP response without sending the message again.
        result = await options.skipAccount(delivery)
      } catch (skipError) {
        if (options.isFatalError(skipError)) throw skipError
        result = {
          delivery: { ...delivery, state: 'unknown', error: 'Ответ сервера не получен. Повторной отправки не будет.' },
          stop: false, skippedAccountId: delivery.accountId,
        }
      }
    }
    options.onResult(result.delivery)
    if (result.stop) return true
    if (result.skippedAccountId || ['failed', 'unknown', 'skipped'].includes(result.delivery.state)) {
      const accountId = result.skippedAccountId || delivery.accountId
      skipped.add(accountId)
      options.onSkipped(accountId, result.delivery.error || 'Ответ на предыдущий запрос не получен.')
    }
  }
  return options.shouldStop()
}
