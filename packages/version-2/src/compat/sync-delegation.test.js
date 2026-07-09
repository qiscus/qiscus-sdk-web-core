import { expect } from 'chai'
import SyncAdapter from '../lib/adapters/sync'

/**
 * Sync-loop unification (docs/v2-full-shell-plan.md "Sync poll loop"): pins
 * that `SyncAdapter` re-shapes core-v3's `getSyncAdapter` RAW firehose
 * (`onRawMessages`/`onRawEvents`/`onSynchronized`) back into v2's exact mitt
 * event names/payloads/order/guards, without starting a real HTTP poll loop.
 * A STUB `_getSyncAdapter` captures the registered callbacks and exposes
 * `fireRawMessages`/`fireRawEvents`/`fireSynchronized` to invoke them
 * directly.
 */
function makeStubCore() {
  const handlers = {}
  const core = {
    synchronize() {},
    synchronizeEvent() {},
    onRawMessages(cb) {
      handlers.rawMessages = cb
      return () => {}
    },
    onRawEvents(cb) {
      handlers.rawEvents = cb
      return () => {}
    },
    onSynchronized(cb) {
      handlers.synchronized = cb
      return () => {}
    },
  }
  return {
    stub: () => core,
    fireRawMessages: (d) => handlers.rawMessages(d),
    fireRawEvents: (d) => handlers.rawEvents(d),
    fireSynchronized: () => handlers.synchronized(),
  }
}

function makeAdapter(stub) {
  return SyncAdapter(() => ({ storage: {}, apiAdapter: {} }), {
    syncInterval: () => 1000,
    syncOnConnect: () => 5000,
    getShouldSync: () => true,
    lastCommentId: () => 0,
    statusLogin: () => true,
    enableSync: () => true,
    enableSyncEvent: () => true,
    isMqttConnected: () => false,
    _getSyncAdapter: stub,
  })
}

describe('sync-delegation (SyncAdapter -> core-v3 getSyncAdapter)', () => {
  describe('onRawMessages -> message.new / last-message-id.new', () => {
    it('emits message.new sorted ASC by id then last-message-id.new, guarded on lastMessageId', () => {
      const { stub, fireRawMessages } = makeStubCore()
      const adapter = makeAdapter(stub)
      const events = []
      adapter.on('message.new', (m) => events.push(['message.new', m]))
      adapter.on('last-message-id.new', (id) => events.push(['last-message-id.new', id]))

      fireRawMessages({ lastMessageId: 5, comments: [{ id: 3 }, { id: 1 }, { id: 2 }] })

      expect(events).to.deep.equal([
        ['message.new', { id: 1 }],
        ['message.new', { id: 2 }],
        ['message.new', { id: 3 }],
        ['last-message-id.new', 5],
      ])

      events.length = 0
      fireRawMessages({ lastMessageId: 5, comments: [{ id: 4 }] })
      expect(events).to.deep.equal([])

      events.length = 0
      fireRawMessages({ lastMessageId: 8, comments: [{ id: 6 }] })
      expect(events).to.deep.equal([
        ['message.new', { id: 6 }],
        ['last-message-id.new', 8],
      ])
    })
  })

  describe('onRawEvents -> last-event-id.new / delivered / deleted / read / cleared', () => {
    it('emits last-event-id.new then delivered, deleted, read, cleared, guarded on lastId', () => {
      const { stub, fireRawEvents } = makeStubCore()
      const adapter = makeAdapter(stub)
      const events = []
      ;['last-event-id.new', 'message.delivered', 'message.deleted', 'message.read', 'room.cleared'].forEach(
        (name) => adapter.on(name, (payload) => events.push([name, payload]))
      )

      fireRawEvents({
        lastId: 10,
        delivered: [{ a: 1 }],
        read: [{ b: 2 }],
        deleted: [{ c: 3 }],
        cleared: [{ d: 4 }],
      })

      expect(events).to.deep.equal([
        ['last-event-id.new', 10],
        ['message.delivered', { a: 1 }],
        ['message.deleted', { c: 3 }],
        ['message.read', { b: 2 }],
        ['room.cleared', { d: 4 }],
      ])

      events.length = 0
      fireRawEvents({ lastId: 10, delivered: [], read: [], deleted: [], cleared: [] })
      expect(events).to.deep.equal([])

      events.length = 0
      fireRawEvents({ lastId: 11, delivered: [{ a: 2 }], read: [], deleted: [], cleared: [] })
      expect(events).to.deep.equal([
        ['last-event-id.new', 11],
        ['message.delivered', { a: 2 }],
      ])
    })
  })

  describe('onSynchronized -> synchronize', () => {
    it('emits synchronize with a number (Date.now())', () => {
      const { stub, fireSynchronized } = makeStubCore()
      const adapter = makeAdapter(stub)
      let received
      adapter.on('synchronize', (v) => (received = v))

      fireSynchronized()

      expect(received).to.be.a('number')
    })
  })
})
