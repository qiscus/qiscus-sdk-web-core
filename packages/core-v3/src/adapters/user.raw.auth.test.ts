import { beforeEach, test, expect } from 'vitest'
import getUserAdapterRaw, { UserAdapterRaw } from './user.raw'
import { Storage } from '../storage'
import { ApiRequester, Api } from '../api'
import { getMockedStorage } from '../utils/test-utils'

let s: Storage
let captured: Partial<Api> | undefined
let cannedBody: any
let api: ApiRequester
let t: UserAdapterRaw

beforeEach(() => {
  s = getMockedStorage()
  captured = undefined
  cannedBody = undefined
  api = {
    request: (apiConfig: Partial<Api>) => {
      captured = apiConfig
      return Promise.resolve(cannedBody)
    },
  }
  t = getUserAdapterRaw(s, api)
})

test('refreshToken builds a POST to /refresh_user_token with user_id and refresh_token and resolves the canned body', async () => {
  cannedBody = {
    status: 200,
    results: { token: 'newtok', refresh_token: 'newrt', token_expires_at: '2026-01-01T00:00:00Z' },
  }

  const result = await t.refreshToken('u1', 'rt')

  expect(captured?.method).toBe('post')
  expect(captured?.url).toBe('/refresh_user_token')
  expect(captured?.body).toStrictEqual({ user_id: 'u1', refresh_token: 'rt' })
  expect(result).toStrictEqual(cannedBody)
})

test('logout builds a POST to /logout with user_id and token and resolves the canned body', async () => {
  cannedBody = { status: 200, results: {} }

  const result = await t.logout('u1', 'tok')

  expect(captured?.method).toBe('post')
  expect(captured?.url).toBe('/logout')
  expect(captured?.body).toStrictEqual({ user_id: 'u1', token: 'tok' })
  expect(result).toStrictEqual(cannedBody)
})
