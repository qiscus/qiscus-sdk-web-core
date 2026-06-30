import { test, expect } from 'vitest'
import { IQUser } from './model'
import * as t from './api'

const o = {
  baseUrl: 'http://base-url.com',
  headers: {
    'qiscus-sdk-app-id': 'sample',
    'qiscus-sdk-token': 'token',
    'qiscus-sdk-user-id': 'user-id',
    'qiscus-sdk-version': 'version',
  },
}

const expectBaseUrl = (url: { baseUrl?: string }) => expect(url.baseUrl).toBe(o.baseUrl)
const expectHeaders = (url: { headers?: Record<string, string> }) => expect(url.headers).toEqual(o.headers)

test('loginOrRegister', () => {
  let data = {
    userId: 'user-id',
    userKey: 'passkey',
    avatarUrl: 'avatar-url',
    deviceToken: '123',
    extras: { value: 1 },
    username: 'username',
  }
  let r = t.loginOrRegister({
    ...o,
    ...data,
  })

  expectBaseUrl(r)
  expectHeaders(r)

  expect(r.url).toBe('/login_or_register')
  expect(r.method).toBe('post')
  expect(r.params).toBeUndefined()
  expect(r.body).toEqual({
    email: data.userId,
    password: data.userKey,
    avatar_url: data.avatarUrl,
    device_token: data.deviceToken,
    username: data.username,
    extras: { value: 1 },
  })
})

test('getNonce', () => {
  let r = t.getNonce(o)

  expectBaseUrl(r)
  expectHeaders(r)
  expect(r.url).toBe('/auth/nonce')
  expect(r.method).toBe('post')
  expect(r.body).toBeUndefined()
  expect(r.params).toBeUndefined()
})

test('verifyIdentityToken', () => {
  let data = { identityToken: 'token' }
  let r = t.verifyIdentityToken({ ...o, ...data })

  expectBaseUrl(r)
  expectHeaders(r)
  expect(r.url).toBe('/auth/verify_identity_token')
  expect(r.method).toBe('post')
  expect(r.body).toEqual({
    identity_token: data.identityToken,
  })
  expect(r.params).toBeUndefined()
})

test('getProfile', () => {
  let r = t.getProfile(o)

  expectBaseUrl(r)
  expectHeaders(r)
  expect(r.method).toBe('get')
  expect(r.url).toBe('/my_profile')
  expect(r.body).toBeUndefined()
  expect(r.params).toBeUndefined()
})

test('patchProfile', () => {
  let data: Partial<IQUser> = {
    name: 'name-updated',
    avatarUrl: 'avatar-updated',
    extras: { value: 'updated' },
  }
  let r = t.patchProfile({ ...o, ...data })

  expectBaseUrl(r)
  expectHeaders(r)

  expect(r.method).toBe('patch')
  expect(r.url).toBe('/my_profile')
  expect(r.params).toBeUndefined()
  expect(r.body).toEqual({
    name: data.name,
    avatar_url: data.avatarUrl,
    extras: data.extras,
  })
})

test('getUserList', () => {
  let p = { page: 1, limit: 10, query: undefined }
  let r = t.getUserList({ ...o, ...p })

  expectBaseUrl(r)
  expectHeaders(r)

  expect(r.method).toBe('get')
  expect(r.url).toBe('get_user_list')
  expect(r.params).toEqual({
    page: p.page,
    limit: p.limit,
    query: p.query,
  })
  expect(r.body).toBeUndefined()
})

test('blockUsers', () => {
  let d = {
    userId: 'user-id',
  }
  let r = t.blockUser({ ...o, ...d })

  expectBaseUrl(r)
  expectHeaders(r)

  expect(r.method).toBe('post')
  expect(r.url).toBe('/block_user')
  expect(r.params).toBeUndefined()
  expect(r.body).toEqual({
    user_email: d.userId,
  })
})

test('unblockUser', () => {
  let d = {
    userId: 'user-id',
  }
  let r = t.unblockUser({ ...o, ...d })

  expectBaseUrl(r)
  expectHeaders(r)

  expect(r.method).toBe('post')
  expect(r.url).toBe('/unblock_user')
  expect(r.params).toBeUndefined()
  expect(r.body).toEqual({
    user_email: d.userId,
  })
})

test('getBlockedUsers', () => {
  let p = {
    page: 1,
    limit: 10,
  }
  let r = t.getBlockedUsers({ ...o, ...p })

  expectBaseUrl(r)
  expectHeaders(r)

  expect(r.method).toBe('get')
  expect(r.url).toBe('/get_blocked_users')
  expect(r.params).toEqual({
    page: `${p.page}`,
    limit: `${p.limit}`,
  })
  expect(r.body).toBeUndefined()
})

test('getTotalUnreadCount', () => {
  let r = t.getTotalUnreadCount(o)

  expectBaseUrl(r)
  expectHeaders(r)

  expect(r.method).toBe('get')
  expect(r.url).toBe('/total_unread_count')
  expect(r.params).toBeUndefined()
  expect(r.body).toBeUndefined()
})
