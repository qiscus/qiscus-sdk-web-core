import { expect, test } from 'vitest'
import getTokenRefreshScheduler from './token-refresh'

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
