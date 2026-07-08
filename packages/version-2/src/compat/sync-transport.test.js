import { expect } from 'chai'
import { synchronizeFactory, synchronizeEventFactory } from '../lib/adapters/sync'

/**
 * P3 (SyncAdapter) transport-swap test (docs/v2-full-shell-plan.md). Pins
 * that `synchronizeFactory`/`synchronizeEventFactory` now source their HTTP
 * call from an injected `getRequester()` (core-v3's shared axios raw message
 * adapter: `.synchronize(id)` / `.synchronizeEvent(id)`) instead of v2's
 * superagent `HttpAdapter`, while keeping the exact same parse + resolved
 * shape (messages sorted by id, `lastMessageId` from
 * `results.meta.last_received_comment_id`; the 4 classified buckets from
 * `classifySyncEvents` for sync_event) and the `.catch(noop)` swallow-on-
 * error behavior. Only the ONE-SHOT `synchronize(id)` getter is driven here
 * — never `run()`, which starts an infinite poll loop.
 *
 * NOT picked up by `pnpm test`; run directly:
 * `npx mocha --require esbuild-register 'src/compat/*.test.js'`.
 */

const noopLogger = () => {}

function makeRequester({ syncBody, eventBody, reject } = {}) {
  return () => ({
    synchronize: () => (reject ? Promise.reject(reject) : Promise.resolve(syncBody)),
    synchronizeEvent: () => (reject ? Promise.reject(reject) : Promise.resolve(eventBody)),
  })
}

describe('sync transport swap (SyncAdapter -> core-v3 requester)', () => {
  describe('synchronizeFactory', () => {
    it('resolves { lastMessageId, messages, interval } with messages sorted by id', async () => {
      const syncBody = {
        status: 200,
        results: {
          comments: [{ id: 3 }, { id: 1 }, { id: 2 }],
          meta: { last_received_comment_id: 3 },
        },
      }
      const getRequester = makeRequester({ syncBody })
      const factory = synchronizeFactory(getRequester, () => 10000, () => true, () => 0, noopLogger)

      const result = await factory.synchronize(0)

      expect(result.lastMessageId).to.equal(3)
      expect(result.messages.map((m) => m.id)).to.deep.equal([1, 2, 3])
      expect(result.interval).to.equal(10000)
    })

    it('resolves undefined (via .catch(noop)) when the requester rejects', async () => {
      const getRequester = makeRequester({ reject: new Error('network down') })
      const factory = synchronizeFactory(getRequester, () => 10000, () => true, () => 0, noopLogger)

      const result = await factory.synchronize(0)

      expect(result).to.equal(undefined)
    })
  })

  describe('synchronizeEventFactory', () => {
    it('resolves the 4 classifySyncEvents buckets', async () => {
      const eventBody = {
        events: [
          { id: 1, action_topic: 'delivered', payload: { data: { comment_id: 1 } } },
          { id: 2, action_topic: 'read', payload: { data: { comment_id: 2 } } },
          { id: 3, action_topic: 'deleted_message', payload: { data: { comment_id: 3 } } },
          { id: 4, action_topic: 'clear_room', payload: { data: { room_id: 9 } } },
        ],
      }
      const getRequester = makeRequester({ eventBody })
      const factory = synchronizeEventFactory(getRequester, () => 10000, () => true, () => 0, noopLogger)

      const result = await factory.synchronize(0)

      expect(result.lastId).to.equal(4)
      expect(result.messageDelivered).to.deep.equal([{ comment_id: 1 }])
      expect(result.messageRead).to.deep.equal([{ comment_id: 2 }])
      expect(result.messageDeleted).to.deep.equal([{ comment_id: 3 }])
      expect(result.roomCleared).to.deep.equal([{ room_id: 9 }])
      expect(result.interval).to.equal(10000)
    })

    it('resolves undefined (via .catch(noop)) when the requester rejects', async () => {
      const getRequester = makeRequester({ reject: new Error('network down') })
      const factory = synchronizeEventFactory(getRequester, () => 10000, () => true, () => 0, noopLogger)

      const result = await factory.synchronize(0)

      expect(result).to.equal(undefined)
    })
  })
})
