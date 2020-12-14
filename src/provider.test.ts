import { Storage, storageFactory } from './storage'
import { withCredentials, withHeaders } from './provider'

let storage: Storage
beforeEach(() => {
  storage = storageFactory()
})

test('withHeaders', () => {
  storage.setAppId('sdksample')
  storage.setVersion('1.0.0')

  const r = withHeaders(storage)
  expect(r.headers).not.toBeNull()
  expect(r.headers['qiscus-sdk-app-id']).toBe('sdksample')
  expect(r.headers['qiscus-sdk-version']).toBe('1.0.0')
})

test('withCredentials', () => {
  storage.setAppId('sdksample')
  storage.setVersion('1.0.0')
  storage.setCurrentUser({
    id: 'user-id',
    name: 'user id',
    avatarUrl: 'some-avatar-url',
    extras: {},
    lastMessageId: 0,
    lastSyncEventId: '0',
  })
  storage.setToken('some-token')

  const r = withCredentials(storage)
  expect(r.headers).not.toBeNull()
  expect(r.headers['qiscus-sdk-app-id']).toBe('sdksample')
  expect(r.headers['qiscus-sdk-version']).toBe('1.0.0')
  expect(r.headers['qiscus-sdk-token']).toBe('some-token')
  expect(r.headers['qiscus-sdk-user-id']).toBe('user-id')
})
