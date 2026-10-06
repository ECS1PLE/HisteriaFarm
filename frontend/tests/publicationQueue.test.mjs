import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Buffer } from 'node:buffer'
import { URL } from 'node:url'
import { test } from 'node:test'
import ts from 'typescript'

const source = await readFile(new URL('../src/services/publicationQueue.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
const { runPublicationQueue } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)

const deliveries = [
  { id: 'a1', accountId: 'a', name: 'A', targetIndex: 0, state: 'pending', messageId: null, error: '' },
  { id: 'b1', accountId: 'b', name: 'B', targetIndex: 0, state: 'pending', messageId: null, error: '' },
  { id: 'a2', accountId: 'a', name: 'A', targetIndex: 1, state: 'pending', messageId: null, error: '' },
  { id: 'b2', accountId: 'b', name: 'B', targetIndex: 1, state: 'pending', messageId: null, error: '' },
]
const sent = (delivery) => ({ delivery: { ...delivery, state: 'sent', messageId: 10 }, stop: false })

function options(overrides = {}) {
  const calls = [], results = [], skipped = []
  return {
    calls, results, skipped,
    shouldStop: () => false,
    send: async (delivery) => { calls.push(delivery.id); return sent(delivery) },
    skipAccount: async (delivery) => ({ delivery: { ...delivery, state: 'unknown', error: 'Lost response' }, stop: false, skippedAccountId: delivery.accountId }),
    isFatalError: (error) => [401, 403, 404, 409].includes(error.status),
    onSending: () => {},
    onResult: (delivery) => results.push(delivery),
    onSkipped: (id) => skipped.push(id),
    ...overrides,
  }
}

test('sender failure skips its later targets and sends from the other account', async () => {
  const opts = options()
  opts.send = async (delivery) => {
    opts.calls.push(delivery.id)
    return delivery.accountId === 'a' ? { delivery: { ...delivery, state: 'failed', error: 'FloodWait' }, stop: false, skippedAccountId: 'a' } : sent(delivery)
  }
  assert.equal(await runPublicationQueue(deliveries, opts), false)
  assert.deepEqual(opts.calls, ['a1', 'b1', 'b2'])
  assert.deepEqual(opts.skipped, ['a'])
})

test('HTTP 502 recovers the result without retrying and continues the next account', async () => {
  const opts = options()
  opts.send = async (delivery) => { opts.calls.push(delivery.id); if (delivery.id === 'a1') throw { status: 502 }; return sent(delivery) }
  let recoveryCalls = 0
  opts.skipAccount = async (delivery) => { recoveryCalls++; return { ...sent(delivery), skippedAccountId: 'a' } }
  assert.equal(await runPublicationQueue(deliveries, opts), false)
  assert.deepEqual(opts.calls, ['a1', 'b1', 'b2'])
  assert.equal(recoveryCalls, 1)
  assert.equal(opts.results[0].state, 'sent')
})

test('failed recovery preserves an unknown result and still skips only that sender', async () => {
  const opts = options()
  opts.send = async (delivery) => { opts.calls.push(delivery.id); if (delivery.id === 'a1') throw new Error('Network'); return sent(delivery) }
  opts.skipAccount = async () => { throw new Error('Network') }
  assert.equal(await runPublicationQueue(deliveries, opts), false)
  assert.deepEqual(opts.calls, ['a1', 'b1', 'b2'])
  assert.equal(opts.results[0].state, 'unknown')
})

test('manual stop finishes the current operation and does not send the next one', async () => {
  let stop = false
  const opts = options({ shouldStop: () => stop })
  opts.send = async (delivery) => { opts.calls.push(delivery.id); stop = true; return sent(delivery) }
  assert.equal(await runPublicationQueue(deliveries, opts), true)
  assert.deepEqual(opts.calls, ['a1'])
})

test('changed destination or expired panel authorization stops the queue', async () => {
  const opts = options()
  opts.send = async (delivery) => { opts.calls.push(delivery.id); return { delivery: { ...delivery, state: 'failed', error: 'Changed destination' }, stop: true } }
  assert.equal(await runPublicationQueue(deliveries, opts), true)
  assert.deepEqual(opts.calls, ['a1'])
  const unauthorized = options({ send: async () => { throw { status: 401 } } })
  await assert.rejects(runPublicationQueue(deliveries, unauthorized), (error) => error.status === 401)
})
