import { expect, test } from 'vitest'
import getTokenRefreshScheduler, { startTokenRefresh, stopTokenRefresh } from './token-refresh'
import { storageFactory } from '../storage'
import { QiscusDeps } from '../usecases/types'

/**
 * Expired-token auto-refresh scheduler (docs/v2-full-shell-plan.md "NEXT
 * ITEM — Expired-token auto-refresh scheduler"). This is a mechanical lift
 * of v2's `lib/adapters/expired-token.js` `ExpiredTokenAdapter` timer +
 * lifecycle — these tests pin the exact observable behavior that moved,
 * including two v2 quirks that MUST be preserved byte-for-byte: (1) the
 * `onTokenRefreshed` callback receives the OLD `expiredAt`, not the new one;
 * (2) an already-expired token does NOT trigger an immediate refresh.
 *
 * NOTE: this repo pins vitest 0.25.8, which lacks async fake-timer helpers
 * — like `adapters/sync.test.ts`, these tests use REAL timers with tiny
 * delays instead of `vi.useFakeTimers()`.
 */

function makeStubUserAdapter(response: any) {
  const calls: { refreshToken: any[]; logout: any[] } = { refreshToken: [], logout: [] }
  const userAdapter = {
    refreshToken(userId: string, refreshToken: string) {
      calls.refreshToken.push({ userId, refreshToken })
      return Promise.resolve(response)
    },
    logout(userId: string, token: string) {
      calls.logout.push({ userId, token })
      return Promise.resolve({ status: 200 })
    },
  }
  return { userAdapter, calls }
}

function makeStubStorage(initialToken: string) {
  let token = initialToken
  return {
    getToken: () => token,
    setToken: (t: string) => {
      token = t
    },
  }
}

test('guard: getAuthenticationStatus() === false resolves undefined and does not call the stub', async () => {
  const { userAdapter, calls } = makeStubUserAdapter({
    results: { token: 'new', refresh_token: 'newrt', token_expires_at: null },
  })
  const storage = makeStubStorage('old')

  const scheduler = getTokenRefreshScheduler({
    getUserAdapter: () => userAdapter,
    getStorage: () => storage,
    userId: 'u1',
    refreshToken: 'rt-1',
    expiredAt: null,
    getAuthenticationStatus: () => false,
  })

  const res = await scheduler.refreshAuthToken()

  expect(res).toBeUndefined()
  expect(calls.refreshToken).toHaveLength(0)
})

test('guard: refreshToken === null resolves undefined and does not call the stub', async () => {
  const { userAdapter, calls } = makeStubUserAdapter({
    results: { token: 'new', refresh_token: 'newrt', token_expires_at: null },
  })
  const storage = makeStubStorage('old')

  const scheduler = getTokenRefreshScheduler({
    getUserAdapter: () => userAdapter,
    getStorage: () => storage,
    userId: 'u1',
    refreshToken: null,
    expiredAt: null,
    getAuthenticationStatus: () => true,
  })

  const res = await scheduler.refreshAuthToken()

  expect(res).toBeUndefined()
  expect(calls.refreshToken).toHaveLength(0)
})

test('happy path: calls stub with (userId, refreshToken), rotates refresh token, calls onTokenRefreshed with the OLD expiredAt + old storage token, writes new token to storage', async () => {
  const oldExpiredAt = new Date(Date.now() + 60_000).toJSON()
  const newExpiredAt = new Date(Date.now() + 120_000).toJSON()
  const { userAdapter, calls } = makeStubUserAdapter({
    results: { token: 'new', refresh_token: 'newrt', token_expires_at: newExpiredAt },
  })
  const storage = makeStubStorage('old-token')

  const onTokenRefreshedCalls: any[] = []
  const scheduler = getTokenRefreshScheduler({
    getUserAdapter: () => userAdapter,
    getStorage: () => storage,
    userId: 'u1',
    refreshToken: 'rt-1',
    expiredAt: oldExpiredAt,
    onTokenRefreshed: (token, refreshToken, expiredAt, oldToken) => {
      onTokenRefreshedCalls.push({ token, refreshToken, expiredAt, oldToken })
    },
    getAuthenticationStatus: () => true,
  })

  const res = await scheduler.refreshAuthToken()

  expect(calls.refreshToken).toEqual([{ userId: 'u1', refreshToken: 'rt-1' }])
  expect(res).toEqual({ token: 'new', refresh_token: 'newrt', token_expires_at: newExpiredAt })

  expect(onTokenRefreshedCalls).toHaveLength(1)
  expect(onTokenRefreshedCalls[0].token).toBe('new')
  expect(onTokenRefreshedCalls[0].refreshToken).toBe('newrt')
  expect(onTokenRefreshedCalls[0].oldToken).toBe('old-token')
  // The OLD expiredAt — preserved-on-purpose v2 quirk.
  expect(onTokenRefreshedCalls[0].expiredAt?.toJSON()).toBe(oldExpiredAt)

  expect(storage.getToken()).toBe('new')
  expect(scheduler.refreshToken).toBe('newrt')
  expect(scheduler.expiredAt?.toJSON()).toBe(newExpiredAt)

  scheduler.dispose()
})

test("refreshToken: '' is treated as null — isEnabled is false and the guard blocks refresh", async () => {
  const { userAdapter, calls } = makeStubUserAdapter({
    results: { token: 'new', refresh_token: 'newrt', token_expires_at: null },
  })
  const storage = makeStubStorage('old')

  const scheduler = getTokenRefreshScheduler({
    getUserAdapter: () => userAdapter,
    getStorage: () => storage,
    userId: 'u1',
    refreshToken: '',
    expiredAt: new Date(Date.now() + 60_000).toJSON(),
    getAuthenticationStatus: () => true,
  })

  expect(scheduler.isEnabled).toBe(false)

  const res = await scheduler.refreshAuthToken()
  expect(res).toBeUndefined()
  expect(calls.refreshToken).toHaveLength(0)
})

test('already-expired token does NOT trigger an automatic refresh', async () => {
  const { userAdapter, calls } = makeStubUserAdapter({
    results: { token: 'new', refresh_token: 'newrt', token_expires_at: null },
  })
  const storage = makeStubStorage('old')

  getTokenRefreshScheduler({
    getUserAdapter: () => userAdapter,
    getStorage: () => storage,
    userId: 'u1',
    refreshToken: 'rt-1',
    expiredAt: new Date(Date.now() - 60_000).toJSON(), // already in the past
    getAuthenticationStatus: () => true,
  })

  await new Promise((r) => setTimeout(r, 60))

  expect(calls.refreshToken).toHaveLength(0)
})

test('timer fires: expiredAt ~20ms ahead triggers exactly one automatic refresh after ~60ms', async () => {
  const { userAdapter, calls } = makeStubUserAdapter({
    results: { token: 'new', refresh_token: 'newrt', token_expires_at: null },
  })
  const storage = makeStubStorage('old')

  const scheduler = getTokenRefreshScheduler({
    getUserAdapter: () => userAdapter,
    getStorage: () => storage,
    userId: 'u1',
    refreshToken: 'rt-1',
    expiredAt: new Date(Date.now() + 20).toJSON(),
    getAuthenticationStatus: () => true,
  })

  await new Promise((r) => setTimeout(r, 60))

  expect(calls.refreshToken).toHaveLength(1)
  scheduler.dispose()
})

test('logout() calls the stub with (userId, currentTokenFromStorage)', async () => {
  const { userAdapter, calls } = makeStubUserAdapter({
    results: { token: 'new', refresh_token: 'newrt', token_expires_at: null },
  })
  const storage = makeStubStorage('current-token')

  const scheduler = getTokenRefreshScheduler({
    getUserAdapter: () => userAdapter,
    getStorage: () => storage,
    userId: 'u1',
    refreshToken: 'rt-1',
    expiredAt: null,
    getAuthenticationStatus: () => true,
  })

  await scheduler.logout()

  expect(calls.logout).toEqual([{ userId: 'u1', token: 'current-token' }])
})

test('dispose() prevents a pending timer from firing', async () => {
  const { userAdapter, calls } = makeStubUserAdapter({
    results: { token: 'new', refresh_token: 'newrt', token_expires_at: null },
  })
  const storage = makeStubStorage('old')

  const scheduler = getTokenRefreshScheduler({
    getUserAdapter: () => userAdapter,
    getStorage: () => storage,
    userId: 'u1',
    refreshToken: 'rt-1',
    expiredAt: new Date(Date.now() + 20).toJSON(),
    getAuthenticationStatus: () => true,
  })

  scheduler.dispose()

  await new Promise((r) => setTimeout(r, 60))

  expect(calls.refreshToken).toHaveLength(0)
})

/**
 * version-3 wiring: `startTokenRefresh`/`stopTokenRefresh` (see
 * `usecases/user.ts`'s `setUser`/`setUserWithIdentityToken`/`clearUser`).
 * Enablement rule under test: the scheduler starts iff-and-only-if BOTH
 * `refreshToken` and `tokenExpiresAt` are present in storage AND there is a
 * current user — no config-flag gate.
 */

function makeDeps(opts: {
  refreshToken?: string | null
  tokenExpiresAt?: string | null
  hasCurrentUser?: boolean
  refreshTokenImpl?: (userId: string, refreshToken: string) => Promise<any>
  withRealtimeAdapter?: boolean
}) {
  const storage = storageFactory()
  storage.setToken('old-token')
  if (opts.hasCurrentUser !== false) {
    storage.setCurrentUser({
      id: 'user-id',
      lastMessageId: 1,
      lastSyncEventId: '1',
      name: 'user-name',
      avatarUrl: 'avatar-url',
      extras: {},
    })
  }
  if (opts.refreshToken !== undefined) storage.setRefreshToken(opts.refreshToken)
  if (opts.tokenExpiresAt !== undefined) storage.setTokenExpiresAt(opts.tokenExpiresAt)

  const userAdapter = {
    refreshToken: opts.refreshTokenImpl ?? (() => Promise.reject(new Error('refreshToken not stubbed'))),
  }

  const mqttCalls: string[] = []
  const mqtt = {
    unsubscribe: (topic: string) => mqttCalls.push(`unsubscribe:${topic}`),
    subscribeUser: (token: string) => mqttCalls.push(`subscribeUser:${token}`),
  }

  const deps = {
    storage,
    userAdapter,
    realtimeAdapter: opts.withRealtimeAdapter === false ? undefined : { mqtt },
  } as unknown as QiscusDeps

  return { deps, storage, mqttCalls }
}

test('startTokenRefresh returns null when refresh token is missing', () => {
  const { deps } = makeDeps({ refreshToken: null, tokenExpiresAt: new Date(Date.now() + 60_000).toJSON() })
  expect(startTokenRefresh(deps)).toBeNull()
})

test('startTokenRefresh returns null when token expiry is missing', () => {
  const { deps } = makeDeps({ refreshToken: 'rt-1', tokenExpiresAt: null })
  expect(startTokenRefresh(deps)).toBeNull()
})

test('startTokenRefresh returns null when there is no current user', () => {
  const { deps } = makeDeps({
    refreshToken: 'rt-1',
    tokenExpiresAt: new Date(Date.now() + 60_000).toJSON(),
    hasCurrentUser: false,
  })
  expect(startTokenRefresh(deps)).toBeNull()
})

test('startTokenRefresh returns a scheduler when refresh token, expiry, and current user are all present', () => {
  const { deps } = makeDeps({ refreshToken: 'rt-1', tokenExpiresAt: new Date(Date.now() + 60_000).toJSON() })
  const scheduler = startTokenRefresh(deps)
  expect(scheduler).not.toBeNull()
  scheduler?.dispose()
})

test('a fired refresh persists the new token/refresh-token/expiry and re-subscribes the MQTT user channel', async () => {
  const newExpiresAt = new Date(Date.now() + 60_000).toJSON()
  const { deps, storage, mqttCalls } = makeDeps({
    refreshToken: 'rt-1',
    tokenExpiresAt: new Date(Date.now() + 20).toJSON(),
    refreshTokenImpl: () =>
      Promise.resolve({
        results: { token: 'new', refresh_token: 'newrt', token_expires_at: newExpiresAt },
      }),
  })

  const scheduler = startTokenRefresh(deps)
  expect(scheduler).not.toBeNull()

  await new Promise((r) => setTimeout(r, 80))

  expect(storage.getToken()).toBe('new')
  expect(storage.getRefreshToken()).toBe('newrt')
  expect(storage.getTokenExpiresAt()).toBe(newExpiresAt)

  expect(mqttCalls).toEqual([
    'unsubscribe:old-token/c',
    'unsubscribe:old-token/n',
    'unsubscribe:old-token/update',
    'subscribeUser:new',
  ])

  scheduler?.dispose()
})

test('stopTokenRefresh prevents a pending scheduled refresh from firing', async () => {
  const refreshCalls: any[] = []
  const { deps } = makeDeps({
    refreshToken: 'rt-1',
    tokenExpiresAt: new Date(Date.now() + 20).toJSON(),
    refreshTokenImpl: (userId, refreshToken) => {
      refreshCalls.push({ userId, refreshToken })
      return Promise.resolve({ results: { token: 'new', refresh_token: 'newrt', token_expires_at: null } })
    },
  })

  const scheduler = startTokenRefresh(deps)
  expect(scheduler).not.toBeNull()

  stopTokenRefresh(deps)

  await new Promise((r) => setTimeout(r, 60))

  expect(refreshCalls).toHaveLength(0)
})

test('startTokenRefresh does not throw when realtimeAdapter is undefined, including when a refresh fires', async () => {
  const { deps, storage } = makeDeps({
    refreshToken: 'rt-1',
    tokenExpiresAt: new Date(Date.now() + 20).toJSON(),
    withRealtimeAdapter: false,
    refreshTokenImpl: () =>
      Promise.resolve({ results: { token: 'new', refresh_token: 'newrt', token_expires_at: null } }),
  })

  expect(() => startTokenRefresh(deps)).not.toThrow()
  const scheduler = startTokenRefresh(deps)

  await new Promise((r) => setTimeout(r, 60))

  expect(storage.getToken()).toBe('new')
  scheduler?.dispose()
})
