import { beforeEach, expect, test } from 'vitest'
import getSyncAdapter from './sync'
import { ApiRequester, Api } from '../api'
import { Storage } from '../storage'
import { getMockedStorage } from '../utils/test-utils'

let s: Storage

beforeEach(() => {
  s = getMockedStorage()
  // Keep the automatic poll loop's message-sync side dormant by default —
  // `getSyncAdapter` fires its FIRST poll tick synchronously on subscribe
  // (see `IntervalProducer.start`), which would otherwise double-count
  // alongside a manually-driven `synchronize()` call in the tests below.
  // Sync-event polling is already off by default (`getIsSyncEventEnabled`
  // defaults to `false`), so only the message side needs this.
  s.setIsSyncEnabled(false)
})

function makeApi(canned: { sync?: any; syncEvent?: any }): {
  api: ApiRequester
  requestCount: () => number
} {
  let count = 0
  const api: ApiRequester = {
    request: (apiConfig: Partial<Api>) => {
      count++
      if ((apiConfig.url ?? '').includes('sync_event')) {
        return Promise.resolve(canned.syncEvent)
      }
      return Promise.resolve(canned.sync)
    },
  }
  return { api, requestCount: () => count }
}

test('onRawMessages fires with the RAW comments array (un-decoded) and the correct lastMessageId', async () => {
  const rawComment = {
    id: 100,
    id_str: '100',
    chat_type: 'single', // raw-only field name; decoded messages don't carry it
    message: 'hello',
    room_id: 10,
    room_id_str: '10',
    unique_temp_id: 'u-100',
    unix_nano_timestamp: Date.now() * 1e6,
    email: 'someone@example.com',
    user_id: 1,
    user_id_str: '1',
    username: 'someone',
    status: 'sent',
    comment_before_id: 0,
  }
  const { api } = makeApi({
    sync: {
      status: 200,
      results: {
        comments: [rawComment],
        meta: { last_received_comment_id: 100 },
      },
    },
  })

  const adapter = getSyncAdapter({
    s,
    api,
    isMqttConnected: () => false,
    logger: () => {},
  })

  const received: { lastMessageId: any; comments: any[] }[] = []
  adapter.onRawMessages((data) => received.push(data))

  adapter.synchronize(0)
  await new Promise((r) => setTimeout(r, 0))

  expect(received).toHaveLength(1)
  expect(received[0].lastMessageId).toBe(100)
  expect(received[0].comments).toHaveLength(1)
  // Raw-only field survives untouched — proof this is NOT the decoded shape.
  expect(received[0].comments[0].chat_type).toBe('single')
  expect(received[0].comments[0].id).toBe(100)
})

test('onRawEvents fires with the raw event buckets (un-decoded)', async () => {
  const events = [
    { id: 1, action_topic: 'delivered', payload: { data: { comment_id: 1, comment_unique_id: 'u1', email: 'a@b.com', room_id: 10 } } },
    { id: 2, action_topic: 'read', payload: { data: { comment_id: 2, comment_unique_id: 'u2', email: 'b@c.com', room_id: 10 } } },
    {
      id: 3,
      action_topic: 'delete_message',
      payload: { data: { deleted_messages: [{ message_unique_ids: ['u3'], room_id: '10' }], is_hard_delete: false } },
    },
    {
      id: 4,
      action_topic: 'clear_room',
      payload: { data: { deleted_rooms: [{ id: 10, id_str: '10', chat_type: 'single', room_name: 'room' }] } },
    },
  ]
  const { api } = makeApi({
    syncEvent: { events, is_start_event_id_found: true },
  })

  const adapter = getSyncAdapter({
    s,
    api,
    isMqttConnected: () => false,
    logger: () => {},
  })

  const received: { lastId: any; delivered: any[]; read: any[]; deleted: any[]; cleared: any[] }[] = []
  adapter.onRawEvents((data) => received.push(data))

  adapter.synchronizeEvent('0')
  await new Promise((r) => setTimeout(r, 0))

  expect(received).toHaveLength(1)
  expect(received[0].lastId).toBe(4)
  expect(received[0].delivered).toEqual([{ comment_id: 1, comment_unique_id: 'u1', email: 'a@b.com', room_id: 10 }])
  expect(received[0].read).toEqual([{ comment_id: 2, comment_unique_id: 'u2', email: 'b@c.com', room_id: 10 }])
  expect(received[0].deleted).toEqual([{ deleted_messages: [{ message_unique_ids: ['u3'], room_id: '10' }], is_hard_delete: false }])
  expect(received[0].cleared).toEqual([{ deleted_rooms: [{ id: 10, id_str: '10', chat_type: 'single', room_name: 'room' }] }])
})

test('existing decoded emits (message.new / message.delivered / message.read / message.deleted / room.cleared) still fire — no regression', async () => {
  const rawComment = {
    id: 200,
    id_str: '200',
    chat_type: 'single',
    message: 'hi again',
    room_id: 11,
    room_id_str: '11',
    unique_temp_id: 'u-200',
    unix_nano_timestamp: Date.now() * 1e6,
    email: 'x@example.com',
    user_id: 2,
    user_id_str: '2',
    username: 'x',
    status: 'sent',
    comment_before_id: 0,
  }
  const events = [
    { id: 1, action_topic: 'delivered', payload: { data: { comment_id: 1, comment_unique_id: 'u1', email: 'a@b.com', room_id: 10 } } },
    { id: 2, action_topic: 'read', payload: { data: { comment_id: 2, comment_unique_id: 'u2', email: 'b@c.com', room_id: 10 } } },
    {
      id: 3,
      action_topic: 'delete_message',
      payload: { data: { deleted_messages: [{ message_unique_ids: ['u3'], room_id: '10' }], is_hard_delete: false } },
    },
    {
      id: 4,
      action_topic: 'clear_room',
      payload: { data: { deleted_rooms: [{ id: 10, id_str: '10', chat_type: 'single', room_name: 'room' }] } },
    },
  ]
  const { api } = makeApi({
    sync: { status: 200, results: { comments: [rawComment], meta: { last_received_comment_id: 200 } } },
    syncEvent: { events, is_start_event_id_found: true },
  })

  const adapter = getSyncAdapter({ s, api, isMqttConnected: () => false, logger: () => {} })

  const newMessages: any[] = []
  const delivered: any[] = []
  const read: any[] = []
  const deleted: any[] = []
  const cleared: any[] = []
  const rawMessages: any[] = []
  const rawEvents: any[] = []
  adapter.onNewMessage((m) => newMessages.push(m))
  adapter.onMessageDelivered((m) => delivered.push(m))
  adapter.onMessageRead((m) => read.push(m))
  adapter.onMessageDeleted((m) => deleted.push(m))
  adapter.onRoomCleared((r) => cleared.push(r))
  adapter.onRawMessages((d) => rawMessages.push(d))
  adapter.onRawEvents((d) => rawEvents.push(d))

  adapter.synchronize(0)
  adapter.synchronizeEvent('0')
  await new Promise((r) => setTimeout(r, 0))

  expect(newMessages).toHaveLength(1)
  expect(newMessages[0].id).toBe(200)
  expect(delivered).toHaveLength(1)
  expect(read).toHaveLength(1)
  expect(deleted).toHaveLength(1)
  expect(cleared).toHaveLength(1)
  // Both decoded AND raw emits fire from the same synchronize call.
  expect(rawMessages).toHaveLength(1)
  expect(rawEvents).toHaveLength(1)
})

test('syncOnlyWhenDisconnected guards the automatic poll loop: no sync while MQTT connected, sync resumes once disconnected', async () => {
  // Re-enable the automatic message-sync loop (dormant by default in this
  // file — see beforeEach) and make it tick fast + deterministically.
  s.setIsSyncEnabled(true)
  s.setAccSyncInterval(5)
  s.setSyncInterval(5)
  s.setSyncIntervalWhenConnected(5)

  const { api, requestCount } = makeApi({
    sync: { status: 200, results: { comments: [], meta: { last_received_comment_id: 0 } } },
  })

  let mqttConnected = true
  getSyncAdapter({
    s,
    api,
    isMqttConnected: () => mqttConnected,
    logger: () => {},
    syncOnlyWhenDisconnected: true,
  })

  // While "connected", the guard must suppress the automatic sync entirely,
  // including the very first (synchronous-on-subscribe) tick.
  await new Promise((r) => setTimeout(r, 60))
  expect(requestCount()).toBe(0)

  // Once "disconnected", the automatic sync must resume.
  mqttConnected = false
  await new Promise((r) => setTimeout(r, 60))
  expect(requestCount()).toBeGreaterThan(0)
})

test('syncOnlyWhenDisconnected defaults to off (undefined) — v3 behavior unchanged: sync still happens while MQTT connected', async () => {
  s.setIsSyncEnabled(true)
  s.setAccSyncInterval(5)
  s.setSyncInterval(5)
  s.setSyncIntervalWhenConnected(5)

  const { api, requestCount } = makeApi({
    sync: { status: 200, results: { comments: [], meta: { last_received_comment_id: 0 } } },
  })

  getSyncAdapter({
    s,
    api,
    isMqttConnected: () => true,
    logger: () => {},
    // syncOnlyWhenDisconnected intentionally omitted
  })

  await new Promise((r) => setTimeout(r, 60))
  expect(requestCount()).toBeGreaterThan(0)
})
