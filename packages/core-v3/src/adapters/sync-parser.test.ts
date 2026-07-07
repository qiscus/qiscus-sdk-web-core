import { test, expect } from 'vitest'
import { classifySyncEvents } from './sync-parser'

const ev = (id: number, action_topic: string, data: any) => ({ id, action_topic, payload: { data } })

test('classifies each action_topic into its bucket (payload.data)', () => {
  const events = [
    ev(3, 'delivered', { d: 1 }),
    ev(5, 'read', { r: 1 }),
    ev(7, 'clear_room', { deleted_rooms: [{ id: 1 }] }),
  ]
  expect(classifySyncEvents(events)).toEqual({
    lastId: 7,
    messageDelivered: [{ d: 1 }],
    messageRead: [{ r: 1 }],
    messageDeleted: [],
    roomCleared: [{ deleted_rooms: [{ id: 1 }] }],
  })
})

test('accepts BOTH delete_message and deleted_message (the v2/v3 divergence fix)', () => {
  const events = [
    ev(1, 'delete_message', { a: 1 }),
    ev(2, 'deleted_message', { b: 2 }),
  ]
  expect(classifySyncEvents(events).messageDeleted).toEqual([{ a: 1 }, { b: 2 }])
})

test('lastId is the max id regardless of order; undefined for empty', () => {
  expect(classifySyncEvents([ev(9, 'read', {}), ev(2, 'read', {}), ev(5, 'read', {})]).lastId).toEqual(9)
  expect(classifySyncEvents([]).lastId).toEqual(undefined)
})

test('ignores unknown action topics', () => {
  const c = classifySyncEvents([ev(1, 'something_else', { x: 1 })])
  expect(c.messageDelivered).toEqual([])
  expect(c.messageRead).toEqual([])
  expect(c.messageDeleted).toEqual([])
  expect(c.roomCleared).toEqual([])
})
