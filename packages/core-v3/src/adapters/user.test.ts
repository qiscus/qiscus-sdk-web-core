import { beforeEach, test, expect } from 'vitest'
import getUserAdapter, { UserAdapter } from './user'
import { Storage } from '../storage'
import { ApiRequester, Api } from '../api'
import { getMockedStorage } from '../utils/test-utils'

/**
 * Decoded user adapter (`./user.ts`) persistence coverage for the
 * token-refresh enablement rule: `login`/`setUserFromIdentityToken` must
 * persist `refresh_token`/`token_expires_at` from the response into storage
 * (consumed later by `adapters/token-refresh.ts#startTokenRefresh`), while
 * `storage.getToken()` keeps working exactly as before (regression).
 */

let s: Storage
let cannedBody: any
let api: ApiRequester
let t: UserAdapter

beforeEach(() => {
  s = getMockedStorage()
  cannedBody = undefined
  api = {
    request: () => Promise.resolve(cannedBody),
  }
  t = getUserAdapter(s, api)
})

function makeUserJson(extra: Record<string, any> = {}) {
  return {
    avatar_url: 'avatar-url',
    email: 'user@qiscus.com',
    extras: {},
    id: 1,
    id_str: '1',
    last_comment_id: 10,
    last_comment_id_str: '10',
    last_sync_event_id: 20,
    pn_android_configured: false,
    pn_ios_configured: false,
    rtKey: 'rt-key',
    token: 'the-token',
    username: 'a-username',
    ...extra,
  }
}

test('login persists refresh_token/token_expires_at and still sets the token (regression)', async () => {
  cannedBody = {
    status: 200,
    results: {
      user: makeUserJson({
        refresh_token: 'a-refresh-token',
        token_expires_at: '2026-01-01T00:00:00Z',
      }),
    },
  }

  const account = await t.login('user-id', 'user-key', {} as any)

  expect(account.id).toBe('user@qiscus.com')
  expect(s.getToken()).toBe('the-token')
  expect(s.getRefreshToken()).toBe('a-refresh-token')
  expect(s.getTokenExpiresAt()).toBe('2026-01-01T00:00:00Z')
})

test('login persists null refresh_token/token_expires_at when absent from the response', async () => {
  cannedBody = {
    status: 200,
    results: { user: makeUserJson() },
  }

  await t.login('user-id', 'user-key', {} as any)

  expect(s.getToken()).toBe('the-token')
  expect(s.getRefreshToken()).toBeNull()
  expect(s.getTokenExpiresAt()).toBeNull()
})

test('setUserFromIdentityToken persists refresh_token/token_expires_at and still sets the token (regression)', async () => {
  cannedBody = {
    status: 200,
    results: {
      user: makeUserJson({
        refresh_token: 'identity-refresh-token',
        token_expires_at: '2026-02-01T00:00:00Z',
      }),
    },
  }

  const account = await t.setUserFromIdentityToken('identity-token')

  expect(account.id).toBe('user@qiscus.com')
  expect(s.getToken()).toBe('the-token')
  expect(s.getRefreshToken()).toBe('identity-refresh-token')
  expect(s.getTokenExpiresAt()).toBe('2026-02-01T00:00:00Z')
})

test('refreshToken/logout are thin pass-throughs returning the raw body', async () => {
  cannedBody = { status: 200, results: { token: 'new', refresh_token: 'newrt', token_expires_at: 'later' } }
  const refreshResult = await t.refreshToken('user-id', 'rt')
  expect(refreshResult).toStrictEqual(cannedBody)

  cannedBody = { status: 200, results: {} }
  const logoutResult = await t.logout('user-id', 'tok')
  expect(logoutResult).toStrictEqual(cannedBody)
})
