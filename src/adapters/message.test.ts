import { beforeEach, test, beforeAll, afterAll, expect } from 'vitest'
import { getMessageAdapter, MessageAdapter } from './message'
import { Storage, storageFactory } from '../storage'
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

  expect(m).toMatchInlineSnapshot(`
    {
      "__roomType": "qwe",
      "chatRoomId": 1,
      "extras": {},
      "id": 1,
      "payload": null,
      "previousMessageId": 1,
      "sender": {
        "avatarUrl": undefined,
        "extras": {},
        "id": "asd",
        "name": "qwe",
      },
      "status": "read",
      "text": "qwe",
      "timestamp": 1970-01-01T00:27:51.518Z,
      "type": "text",
      "uniqueId": "qwerty",
    }
  `)
})
