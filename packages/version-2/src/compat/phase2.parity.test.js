import { expect } from 'chai'
import { makeStubHttpAdapter, compareParity } from './parity'
import QiscusSDK from '../index'
import RoomAdapter from '../lib/adapters/room'
import { makeDeps } from './deps'

/**
 * Phase 2a failure-path parity (docs/v2-on-core-v3-plan.md §8.0.2, §9, §11).
 *
 * Same harness as `phase1.parity.test.js`, for the isolated-transform room
 * methods re-platformed onto core-v3's raw ROOM adapter in Phase 2a:
 * `updateRoom`, `addParticipantsToGroup`, `removeParticipantsFromGroup`,
 * `getTotalUnreadCount`, `getRoomUnreadCount`. Each keeps a verbatim
 * `_legacy<Method>` copy; this suite drives real legacy-vs-new over the same
 * canned `HttpAdapter` response and asserts identical resolve/reject across
 * 200 / envelope-400 / 400 / 403 / 500, plus the synchronous-throw guards.
 *
 * NOT picked up by `pnpm test`; run directly:
 * `npx mocha --require esbuild-register 'src/compat/*.test.js'`.
 *
 * Scope note: the room-CONSTRUCTION methods (chatTarget/getRoomById/
 * getOrCreateRoomByUniqueId/chatGroup/createGroupRoom) are Phase 2b — they
 * need `rawRoomToV2` reconstruction + side-effect (setActiveRoom/readComment/
 * subscribeChannel/hooks/events) handling, anchored differently. And
 * `clearRoomMessages` is DEFERRED: core-v3's `Api.clearRooms` carries
 * `room_channel_ids` as query params, but `makeV2Requester`'s `delete` branch
 * forwards only `api.body`, so the ids would be dropped — needs a shim fix
 * first (see docs/migrations.md).
 */

const P = QiscusSDK.prototype

function makeFakeSelf(stub) {
  const self = {
    baseURL: 'https://api.example.com',
    AppId: 'sample-app-id',
    version: '3.0.0',
    mqttURL: 'wss://mqtt.example.com/mqtt',
    _customHeader: {},
    user_id: 'user-1',
    userData: { id: 'user-1', email: 'user-1', username: 'User One' },
    _hookAdapter: undefined,
    HTTPAdapter: stub,
    roomAdapter: new RoomAdapter(stub),
    events: {
      emitted: [],
      emit(name, payload) {
        this.emitted.push({ name, payload })
      },
    },
    _deps: null,
  }
  Object.defineProperty(self, 'deps', {
    get() {
      if (this._deps == null) this._deps = makeDeps(this)
      return this._deps
    },
  })
  return self
}

function runParity({ legacyMethod, newMethod, cases }) {
  return compareParity({
    reference: ({ args, response }) => P[legacyMethod].apply(makeFakeSelf(makeStubHttpAdapter(response)), args),
    candidate: ({ args, response }) => P[newMethod].apply(makeFakeSelf(makeStubHttpAdapter(response)), args),
    cases,
  })
}

function httpErrorCases(args) {
  return [400, 403, 500].map((status) => ({
    name: `HTTP ${status} rejects identically`,
    input: { args, response: { status, body: { error: { message: `err-${status}` } } } },
  }))
}

function envelope400Case(args) {
  return {
    name: 'HTTP 200 but envelope status 400 rejects on both',
    input: { args, response: { status: 200, body: { status: 400, error: { message: 'envelope' } } } },
  }
}

describe('compat/phase2a parity (room isolated-transform methods)', () => {
  it('updateRoom — sync throw on missing id, resolves results.room, envelope reject', async () => {
    const args = { id: 5, room_name: 'New name', avatar_url: 'http://a/x.png', options: { pinned: true } }
    const happy = { status: 200, results: { room: { id: 5, room_name: 'New name', avatar_url: 'http://a/x.png' } } }
    const result = await runParity({
      legacyMethod: '_legacyUpdateRoom',
      newMethod: 'updateRoom',
      cases: [
        { name: '200 resolves results.room', input: { args: [args], response: { status: 200, body: happy } } },
        { name: 'missing id throws synchronously on both', input: { args: [{ room_name: 'x' }], response: { status: 200, body: happy } } },
        envelope400Case([args]),
        ...httpErrorCases([args]),
      ],
    })
    expect(result.firstDivergence, JSON.stringify(result.firstDivergence, null, 2)).to.equal(null)
    expect(result.pass).to.equal(true)
  })

  it('addParticipantsToGroup — non-array throw, falsy-roomId throw, resolves participants_added', async () => {
    const happy = { status: 200, results: { participants_added: [{ id: 1, email: 'a@e.com' }] } }
    const result = await runParity({
      legacyMethod: '_legacyAddParticipantsToGroup',
      newMethod: 'addParticipantsToGroup',
      cases: [
        { name: '200 resolves participants_added', input: { args: [42, ['a@e.com']], response: { status: 200, body: happy } } },
        { name: 'non-array emails throws synchronously on both', input: { args: [42, 'a@e.com'], response: { status: 200, body: happy } } },
        { name: 'falsy roomId throws synchronously on both', input: { args: [0, ['a@e.com']], response: { status: 200, body: happy } } },
        envelope400Case([42, ['a@e.com']]),
        ...httpErrorCases([42, ['a@e.com']]),
      ],
    })
    expect(result.firstDivergence, JSON.stringify(result.firstDivergence, null, 2)).to.equal(null)
    expect(result.pass).to.equal(true)
  })

  it('removeParticipantsFromGroup — non-array reject, falsy-roomId throw, resolves participants_removed', async () => {
    const happy = { status: 200, results: { participants_removed: [{ id: 1, email: 'a@e.com' }] } }
    const result = await runParity({
      legacyMethod: '_legacyRemoveParticipantsFromGroup',
      newMethod: 'removeParticipantsFromGroup',
      cases: [
        { name: '200 resolves participants_removed', input: { args: [42, ['a@e.com']], response: { status: 200, body: happy } } },
        { name: 'non-array emails rejects on both', input: { args: [42, 'a@e.com'], response: { status: 200, body: happy } } },
        { name: 'falsy roomId throws synchronously on both', input: { args: [0, ['a@e.com']], response: { status: 200, body: happy } } },
        envelope400Case([42, ['a@e.com']]),
        ...httpErrorCases([42, ['a@e.com']]),
      ],
    })
    expect(result.firstDivergence, JSON.stringify(result.firstDivergence, null, 2)).to.equal(null)
    expect(result.pass).to.equal(true)
  })

  it('getTotalUnreadCount — resolves the bare total_unread_count number', async () => {
    const happy = { status: 200, results: { total_unread_count: 7 } }
    const result = await runParity({
      legacyMethod: '_legacyGetTotalUnreadCount',
      newMethod: 'getTotalUnreadCount',
      cases: [
        { name: '200 resolves 7', input: { args: [], response: { status: 200, body: happy } } },
        ...httpErrorCases([]),
      ],
    })
    expect(result.firstDivergence, JSON.stringify(result.firstDivergence, null, 2)).to.equal(null)
    expect(result.pass).to.equal(true)
  })

  it('getRoomUnreadCount — resolves the bare total_unread_count number', async () => {
    const happy = { status: 200, results: { total_unread_count: 3 } }
    const result = await runParity({
      legacyMethod: '_legacyGetRoomUnreadCount',
      newMethod: 'getRoomUnreadCount',
      cases: [
        { name: '200 resolves 3', input: { args: [], response: { status: 200, body: happy } } },
        ...httpErrorCases([]),
      ],
    })
    expect(result.firstDivergence, JSON.stringify(result.firstDivergence, null, 2)).to.equal(null)
    expect(result.pass).to.equal(true)
  })
})
