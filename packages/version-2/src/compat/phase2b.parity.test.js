import { compareParity, makeStubHttpAdapter } from './parity'
import RoomAdapter from '../lib/adapters/room'
import { makeDeps } from './deps'

/**
 * Phase 2b adapter-level parity (docs/v2-on-core-v3-plan.md §9, §11).
 *
 * The room-CONSTRUCTION methods (`getRoomById`, `chatTarget`, …) are
 * side-effect-heavy (setActiveRoom / readComment / subscribeChannel /
 * MESSAGE_BEFORE_RECEIVED hooks / event emits), so a full method-level
 * `_legacy*` parity run isn't practical. For a method whose re-platform is a
 * pure DATA-SOURCE swap with a byte-identical downstream (like `getRoomById`),
 * the meaningful anchor is instead at the ADAPTER level: prove the new raw
 * adapter call resolves/rejects identically to the old one over the same
 * canned `HttpAdapter` response. If that holds, the unchanged downstream body
 * behaves identically by construction.
 *
 * This suite covers `getRoomById`'s swap: old `roomAdapter.getRoomById(id)`
 * (resolves the raw `res.body` envelope, no massaging, no status check) vs new
 * `deps.roomAdapter.getRoom(id)` (same `get_room_by_id` GET, same raw
 * envelope).
 *
 * NOT picked up by `pnpm test`; run directly:
 * `npx mocha --require esbuild-register 'src/compat/*.test.js'`.
 */

// Minimal `QiscusSDK`-shaped context, just enough for `makeDeps` to build the
// raw room adapter over the given `HttpAdapter` stub.
function makeRawRoomAdapter(stub) {
  const self = {
    baseURL: 'https://api.example.com',
    AppId: 'sample-app-id',
    mqttURL: 'wss://mqtt.example.com/mqtt',
    _customHeader: {},
    user_id: 'user-1',
    userData: { id: 'user-1', email: 'user-1' },
    _hookAdapter: undefined,
    HTTPAdapter: stub,
  }
  return makeDeps(self).roomAdapter
}

describe('compat/phase2b parity (room getRoomById data-source swap)', () => {
  it('old roomAdapter.getRoomById vs new deps.roomAdapter.getRoom resolve/reject identically', async () => {
    const happy = {
      status: 200,
      results: {
        room: { id: 101, room_name: 'A room', avatar_url: 'http://a/x.png', unique_id: 'uq-1' },
        comments: [{ id: 9, message: 'hi' }, { id: 8, message: 'earlier' }],
      },
    }

    const result = await compareParity({
      reference: ({ response }) => new RoomAdapter(makeStubHttpAdapter(response)).getRoomById(101),
      candidate: ({ response }) => makeRawRoomAdapter(makeStubHttpAdapter(response)).getRoom(101),
      cases: [
        { name: '200 resolves the identical raw envelope', input: { response: { status: 200, body: happy } } },
        // Old getRoomById has NO envelope-status check — it resolves res.body
        // as-is even when body.status != 200; the swap must do the same.
        { name: 'HTTP 200 but envelope status 400 resolves the raw body on both', input: { response: { status: 200, body: { status: 400, error: { message: 'envelope' } } } } },
        ...[400, 403, 500].map((status) => ({
          name: `HTTP ${status} rejects identically`,
          input: { response: { status, body: { error: { message: `err-${status}` } } } },
        })),
      ],
    })

    if (result.firstDivergence) {
      throw new Error('parity divergence: ' + JSON.stringify(result.firstDivergence, null, 2))
    }
  })
})
