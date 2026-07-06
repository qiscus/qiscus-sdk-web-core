import { compareParity, makeStubHttpAdapter } from './parity'
import RoomAdapter from '../lib/adapters/room'
import { makeDeps } from './deps'
import { rawRoomToV2 } from './to-v2'

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

  // chatTarget's re-platform = data-source swap + rawRoomToV2 reconstruction.
  // The old `roomAdapter.getOrCreateRoom` resolved a MASSAGED room; the new
  // path is `chatUser(...)` (raw envelope) -> `rawRoomToV2(...targetEmail)`.
  // The method's downstream (new Room / hooks / setActiveRoom / readComment /
  // events) is unchanged, so parity is anchored on the object fed to it:
  // old massaged room vs rawRoomToV2 output, over the same canned response.
  it('chatTarget input: old getOrCreateRoom vs new chatUser+rawRoomToV2 match', async () => {
    const email = 'rival@e.com'
    const body = {
      status: 200,
      results: {
        room: {
          id: 55,
          room_name: 'Group name',
          avatar_url: 'http://a/x.png',
          last_comment_id: 3,
          participants: [
            { id: 10, email, username: 'Rival' },
            { id: 11, email: 'me@e.com', username: 'Me' },
          ],
        },
        comments: [{ id: 3 }, { id: 2 }, { id: 1 }],
      },
    }

    // Each side gets its OWN deep clone: the old adapter reverses
    // `results.comments` IN PLACE, which would otherwise corrupt the shared
    // fixture for whichever side runs second (a test artifact — in production
    // old and new never share an array).
    const clone = (r) => JSON.parse(JSON.stringify(r))
    const result = await compareParity({
      reference: ({ response }) =>
        new RoomAdapter(makeStubHttpAdapter(clone(response))).getOrCreateRoom(email, { distinctId: 'd' }, 'd'),
      candidate: ({ response }) =>
        makeRawRoomAdapter(makeStubHttpAdapter(clone(response)))
          .chatUser(email, { distinctId: 'd' })
          .then((raw) => rawRoomToV2(raw.results.room, { comments: raw.results.comments, targetEmail: email })),
      cases: [{ name: '200 massaged room matches', input: { response: { status: 200, body } } }],
    })

    if (result.firstDivergence) {
      throw new Error('parity divergence: ' + JSON.stringify(result.firstDivergence, null, 2))
    }
  })

  // getOrCreateRoomByUniqueId's re-platform = data-source swap + rawRoomToV2 in
  // useRoomName mode. Old `roomAdapter.getOrCreateRoomByUniqueId` resolved a
  // MASSAGED room (avatar / reversed comments / name = room_name); the new path
  // is `getChannel(...)` (raw envelope) -> `rawRoomToV2(..., {useRoomName})`.
  // Anchored on the object fed to the unchanged downstream body.
  it('getOrCreateRoomByUniqueId input: old vs new getChannel+rawRoomToV2 match', async () => {
    const body = {
      status: 200,
      results: {
        room: {
          id: 77,
          room_name: 'Channel name',
          avatar_url: 'http://a/c.png',
          last_comment_id: 3,
          unique_id: 'uq-77',
        },
        comments: [{ id: 3 }, { id: 2 }, { id: 1 }],
      },
    }

    const clone = (r) => JSON.parse(JSON.stringify(r))
    const result = await compareParity({
      reference: ({ response }) =>
        new RoomAdapter(makeStubHttpAdapter(clone(response))).getOrCreateRoomByUniqueId('uq-77', 'Channel name', 'http://a/c.png'),
      candidate: ({ response }) =>
        makeRawRoomAdapter(makeStubHttpAdapter(clone(response)))
          .getChannel('uq-77', 'Channel name', 'http://a/c.png')
          .then((raw) => rawRoomToV2(raw.results.room, { comments: raw.results.comments, useRoomName: true })),
      cases: [{ name: '200 massaged room matches', input: { response: { status: 200, body } } }],
    })

    if (result.firstDivergence) {
      throw new Error('parity divergence: ' + JSON.stringify(result.firstDivergence, null, 2))
    }
  })
})
