import { beforeEach, test, beforeAll, afterAll, expect } from 'vitest'
import { getMessageAdapter, MessageAdapter } from './message'
import { Storage } from '../storage'
import { ApiRequester, makeApiRequest } from '../api'
import { handlers } from '../mocks/handlers'
import { setupServer } from 'msw/node'
import { getMockedStorage } from '../utils/test-utils'

let s: Storage
let api: ApiRequester
let t: MessageAdapter
let server = setupServer(...handlers)

beforeEach(() => {
  s = getMockedStorage()
  api = makeApiRequest(s)
  t = getMessageAdapter(s, api)
  server.resetHandlers()
})

beforeAll(() => server.listen())
afterAll(() => server.close())

test('getMessages', async () => {
  let roomId = 1
  let lastMessageId = 1
  let limit = 10
  let after = true

  let r = await t.getMessages(roomId, lastMessageId, limit, after)
  let m = r.at(0)

  expect(m?.chatRoomId).eq(1)
  expect(m?.id).eq(1)
  expect(m?.payload).toBeNull()
  expect(m?.previousMessageId).eq(1)
  expect(m?.extras).toStrictEqual({})
  expect(m?.status).eq('read')
  expect(m?.text).eq('qwe')
  expect(m?.type).eq('text')
  expect(m?.uniqueId).eq('qwerty')
  expect(m?.sender).toStrictEqual({ avatarUrl: undefined, extras: {}, id: 'asd', name: 'qwe' })
})
