import { beforeEach, test, expect } from 'vitest'
import { getMessageAdapterRaw, MessageAdapterRaw } from './message.raw'
import { Storage } from '../storage'
import { ApiRequester, Api } from '../api'
import { getMockedStorage } from '../utils/test-utils'

let s: Storage
let captured: Partial<Api> | undefined
let cannedBody: any
let api: ApiRequester
let t: MessageAdapterRaw

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
  t = getMessageAdapterRaw(s, api)
})

test('synchronize builds a request carrying last_received_comment_id and resolves the canned body', async () => {
  cannedBody = {
    status: 200,
    results: {
      comments: [{ id: 1 }],
      meta: { last_received_comment_id: 42 },
    },
  }

  const result = await t.synchronize(42)

  expect(captured?.params).toStrictEqual({ last_received_comment_id: 42, limit: undefined })
  expect(result).toStrictEqual(cannedBody)
})

test('synchronizeEvent builds a request carrying start_event_id and resolves the canned body', async () => {
  cannedBody = { events: [{ id: 9, action_topic: 'read', payload: { data: {} } }] }

  const result = await t.synchronizeEvent('e9')

  expect(captured?.params).toStrictEqual({ start_event_id: 'e9' })
  expect(result).toStrictEqual(cannedBody)
})
