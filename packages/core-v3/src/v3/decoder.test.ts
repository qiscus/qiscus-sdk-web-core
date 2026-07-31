import { expect, test } from 'vitest'
import * as Decoder from './decoder'

/**
 * Regression coverage for `Decoder.account`'s tuple shape after adding
 * `refresh_token`/`token_expires_at` pass-through (see
 * `adapters/token-refresh.ts` / `startTokenRefresh`'s enablement rule, which
 * depends on both fields being captured here). Element 0 (IQAccount) and
 * element 1 (token) must stay exactly as before — only elements 2/3 are new.
 */

const baseJson = {
  avatar_url: 'avatar-url',
  email: 'user@qiscus.com',
  extras: { role: 'admin' },
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
}

test('account() returns the same IQAccount + token as before when refresh_token/token_expires_at are absent', () => {
  const [account, token, refreshToken, tokenExpiresAt] = Decoder.account(baseJson)

  expect(account).toEqual({
    name: 'a-username',
    avatarUrl: 'avatar-url',
    extras: { role: 'admin' },
    id: 'user@qiscus.com',
    lastMessageId: 10,
    lastSyncEventId: '20',
  })
  expect(token).toBe('the-token')
  expect(refreshToken).toBeUndefined()
  expect(tokenExpiresAt).toBeUndefined()
})

test('account() captures refresh_token/token_expires_at as tuple elements 2/3 when present', () => {
  const json = {
    ...baseJson,
    refresh_token: 'a-refresh-token',
    token_expires_at: '2026-01-01T00:00:00Z',
  }

  const [account, token, refreshToken, tokenExpiresAt] = Decoder.account(json)

  expect(account).toEqual({
    name: 'a-username',
    avatarUrl: 'avatar-url',
    extras: { role: 'admin' },
    id: 'user@qiscus.com',
    lastMessageId: 10,
    lastSyncEventId: '20',
  })
  expect(token).toBe('the-token')
  expect(refreshToken).toBe('a-refresh-token')
  expect(tokenExpiresAt).toBe('2026-01-01T00:00:00Z')
})
