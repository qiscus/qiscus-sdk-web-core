import { EventEmitter as NodeEventEmitter } from 'events'
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { storageFactory, type Storage } from '../storage'

// Fake `mqtt` client + `connect()` so the adapter's facade (heartbeat,
// clientId/will, buffering, subscribeRoom topics) can be characterized
// without opening a real socket.
//
// NOTE: this uses `vi.doMock` + a dynamic `import('./mqtt')` in `beforeAll`,
// NOT the usual static `vi.mock(...)` + top-level `import`. This vitest
// version's static-hoisting transform (which normally rewrites a top-level
// `vi.mock('mqtt', factory)` to run before the `import ... from './mqtt'`
// that transitively pulls in the real 'mqtt') does not fire in this repo's
// install — verified by reproduction: even a trivial one-line factory
// mocking a local relative module was silently ignored. `vi.doMock` applies
// immediately/imperatively (no hoisting requirement) and is documented as
// the explicit, order-dependent counterpart to `vi.mock`, so it sidesteps
// the issue entirely.
function createFakeClient() {
  const emitter = new NodeEventEmitter()
  const client: any = {
    _resubscribeTopics: {},
    addListener: (event: string, cb: (...a: any[]) => void) => {
      emitter.on(event, cb)
      return client
    },
    removeAllListeners: () => {
      emitter.removeAllListeners()
      return client
    },
    // Test-only helper to simulate the underlying mqtt.js client firing an
    // event (e.g. 'connect') — not part of the real mqtt.js API.
    emitEvent: (event: string, ...args: any[]) => emitter.emit(event, ...args),
    end: vi.fn(() => client),
    subscribe: vi.fn(() => client),
    unsubscribe: vi.fn(() => client),
    publish: vi.fn(() => client),
  }
  return client
}

let lastClient: any = null
const connectMock = vi.fn((_url: string, _opts: any) => {
  lastClient = createFakeClient()
  return lastClient
})
const getLastClient = () => lastClient

let getMqttAdapter: typeof import('./mqtt').default

beforeAll(async () => {
  vi.doMock('mqtt', () => ({ connect: connectMock }))
  const mod = await import('./mqtt')
  getMqttAdapter = mod.default
})

function makeStorage(withUser = true): Storage {
  const s = storageFactory()
  s.setAppId('sdksample')
  s.setToken('some-token')
  s.setVersion('1.0.0-mock')
  if (withUser) {
    s.setCurrentUser({
      id: 'user-id',
      lastMessageId: 1,
      lastSyncEventId: '1',
      name: 'user-name',
      avatarUrl: 'avatar-url',
      extras: {},
    })
  }
  return s
}

beforeEach(() => {
  lastClient = null
  connectMock.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('enableHeartbeat', () => {
  test('false: no timed presence publish after 3.5s', () => {
    vi.useFakeTimers()
    const s = makeStorage()
    const adapter = getMqttAdapter(s, { enableHeartbeat: false })
    adapter.conneck()
    const client = getLastClient()
    client.publish.mockClear()

    vi.advanceTimersByTime(4000)

    expect(client.publish).not.toHaveBeenCalled()
  })

  test('default (true): publishes presence every 3.5s', () => {
    vi.useFakeTimers()
    const s = makeStorage()
    const adapter = getMqttAdapter(s)
    adapter.conneck()
    const client = getLastClient()
    client.publish.mockClear()

    vi.advanceTimersByTime(3500)

    expect(client.publish).toHaveBeenCalledWith('u/user-id/s', '1', expect.objectContaining({ retain: true }))
  })
})

test('conneck() does not stack duplicate heartbeat intervals', () => {
  vi.useFakeTimers()
  const s = makeStorage()
  const adapter = getMqttAdapter(s)

  adapter.conneck()
  adapter.conneck()
  const client = getLastClient()
  client.publish.mockClear()

  vi.advanceTimersByTime(3500)

  // With the stacked-interval bug this fires twice (one per leaked interval).
  expect(client.publish).toHaveBeenCalledTimes(1)
})

describe('_getClientId / null-user tolerance', () => {
  test('uses the injected getClientId when provided', () => {
    const s = makeStorage()
    const adapter = getMqttAdapter(s, { getClientId: () => 'custom-client-id' })

    adapter.conneck()

    const [, opts] = connectMock.mock.calls[connectMock.mock.calls.length - 1]
    expect(opts.clientId).toBe('custom-client-id')
  })

  test('with no current user, clientId + will topic tolerate the null user (no throw)', () => {
    const s = makeStorage(false)
    const adapter = getMqttAdapter(s)

    expect(() => adapter.conneck()).not.toThrow()

    const [, opts] = connectMock.mock.calls[connectMock.mock.calls.length - 1]
    expect(opts.clientId).toMatch(/^sdksample_undefined_\d+$/)
    expect(opts.will.topic).toBe('u/undefined/s')
  })
})

test('buffers subscribe/publish issued before mqtt exists and flushes on the connect event', () => {
  const s = makeStorage()
  const adapter = getMqttAdapter(s)

  // Issued before any `conneck()`/`open()` — mirrors v2 calling
  // mqttAdapter.publish/subscribe pre-login, before the client exists.
  adapter.subscribe('some/topic')
  adapter.publish('some/topic', 'payload')

  adapter.conneck()
  const client = getLastClient()

  // Not flushed yet — the underlying client hasn't reported 'connect'.
  expect(client.subscribe).not.toHaveBeenCalled()
  expect(client.publish).not.toHaveBeenCalled()

  client.emitEvent('connect')

  expect(client.subscribe).toHaveBeenCalledWith('some/topic')
  expect(client.publish).toHaveBeenCalledWith('some/topic', 'payload', undefined)
})

test('subscribeRoom / unsubscribeRoom (un)subscribe all 4 topics, incl. r/{id}/typing', () => {
  const s = makeStorage()
  const adapter = getMqttAdapter(s)
  adapter.conneck()
  const client = getLastClient()

  adapter.subscribeRoom(42)
  expect(client.subscribe.mock.calls.map((c: any[]) => c[0])).toEqual([
    'r/42/typing',
    'r/42/42/+/t',
    'r/42/42/+/d',
    'r/42/42/+/r',
  ])

  client.subscribe.mockClear()
  adapter.unsubscribeRoom(42)
  expect(client.unsubscribe.mock.calls.map((c: any[]) => c[0])).toEqual([
    'r/42/typing',
    'r/42/42/+/t',
    'r/42/42/+/d',
    'r/42/42/+/r',
  ])
})
