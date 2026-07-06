import { test, expect } from 'vitest'
import { parseRealtimeEvent } from './realtime-parser'

/**
 * Unit tests for the shared realtime parser (Fable review 2026-07-06). Pins the
 * canonical classification + deserialization + raw-string field capture that
 * BOTH shells adapt. This is step 1 of the realtime single-source sequence — no
 * shell changes yet; the v3 and v2 adapters (steps 2-3) are gated by the 74
 * core-v3 tests and phase4.mqtt-characterization.test.js respectively.
 */

test('direct message (x/c) → message with parsed payload', () => {
  expect(parseRealtimeEvent('room-token/c', JSON.stringify({ id: 5, message: 'hi' }))).toEqual({
    kind: 'message',
    rawComment: { id: 5, message: 'hi' },
  })
})

test('channel message (x/y/c) → channel-message with channelUniqueId', () => {
  expect(parseRealtimeEvent('appid/uniqueid/c', JSON.stringify({ id: 7 }))).toEqual({
    kind: 'channel-message',
    rawComment: { id: 7 },
    channelUniqueId: 'uniqueid',
  })
})

test('notification (x/n) exposes action_topic + delete arrays intact', () => {
  const payload = {
    action_topic: 'delete_message',
    payload: { data: { deleted_messages: [{ room_id: '10', message_unique_ids: ['u1', 'u2'] }] } },
  }
  expect(parseRealtimeEvent('token/n', JSON.stringify(payload))).toEqual({
    kind: 'notification',
    actionTopic: 'delete_message',
    deletedMessages: [{ room_id: '10', message_unique_ids: ['u1', 'u2'] }],
    deletedRooms: [],
  })
})

test('notification clear_room exposes deleted_rooms (full objects)', () => {
  const payload = { action_topic: 'clear_room', payload: { data: { deleted_rooms: [{ id: 3, unique_id: 'uq-3' }] } } }
  expect(parseRealtimeEvent('token/n', JSON.stringify(payload))).toEqual({
    kind: 'notification',
    actionTopic: 'clear_room',
    deletedMessages: [],
    deletedRooms: [{ id: 3, unique_id: 'uq-3' }],
  })
})

test('typing (r/rid/rid/uid/t) → raw string roomId/userId + raw payload', () => {
  expect(parseRealtimeEvent('r/5/5/other/t', '1')).toEqual({ kind: 'typing', roomId: '5', userId: 'other', payload: '1' })
})

test('room-typing (r/rid/typing) → roomId + parsed payload', () => {
  expect(parseRealtimeEvent('r/123/typing', JSON.stringify({ status: 'typing_on', sender_id: 'bot' }))).toEqual({
    kind: 'room-typing',
    roomId: '123',
    parsed: { status: 'typing_on', sender_id: 'bot' },
  })
})

test('delivered/read (.../d, .../r) split the payload, keep ids as strings', () => {
  expect(parseRealtimeEvent('r/5/5/other/d', '42:uniq-42')).toEqual({
    kind: 'delivered',
    roomId: '5',
    userId: 'other',
    messageId: '42',
    messageUniqueId: 'uniq-42',
  })
  expect(parseRealtimeEvent('r/5/5/other/r', '43:uniq-43')).toEqual({
    kind: 'read',
    roomId: '5',
    userId: 'other',
    messageId: '43',
    messageUniqueId: 'uniq-43',
  })
})

test('presence (u/uid/s) retains the raw payload string', () => {
  expect(parseRealtimeEvent('u/guest-1002/s', '1:1693999999')).toEqual({
    kind: 'presence',
    userId: 'guest-1002',
    payload: '1:1693999999',
  })
})

test('message-updated (x/update) → parsed payload', () => {
  expect(parseRealtimeEvent('token/update', JSON.stringify({ id: 9, message: 'edited' }))).toEqual({
    kind: 'message-updated',
    rawComment: { id: 9, message: 'edited' },
  })
})

test('custom-event (r/rid/rid/e) → roomId + parsed payload', () => {
  expect(parseRealtimeEvent('r/9/9/e', JSON.stringify({ type: 'x', payload: { a: 1 } }))).toEqual({
    kind: 'custom-event',
    roomId: '9',
    payload: { type: 'x', payload: { a: 1 } },
  })
})

test('userId containing a slash is captured whole (matches v2 `.+`)', () => {
  expect(parseRealtimeEvent('r/5/5/a/b/t', '1')).toEqual({ kind: 'typing', roomId: '5', userId: 'a/b', payload: '1' })
})

test('unhandled topic → null', () => {
  expect(parseRealtimeEvent('some/weird/topic', 'x')).toEqual(null)
  expect(parseRealtimeEvent('r/5/nope', 'x')).toEqual(null)
})
