import { compareParity, makeStubHttpAdapter } from './parity'
import QiscusSDK from '../index'
import User from '../lib/adapters/user'
import { makeDeps } from './deps'

/**
 * Phase 3 adapter-level parity (docs/v2-on-core-v3-plan.md §9, §11).
 *
 * The message methods are re-platformed onto core-v3's raw message adapter.
 * For read-path methods whose re-platform is a pure DATA-SOURCE swap with a
 * byte-identical downstream (like `loadComments`, whose hooks/`receiveComments`/
 * `sortComments` body is unchanged), parity is anchored at the ADAPTER level:
 * the new raw adapter call resolves/rejects identically to the old one over the
 * same canned `HttpAdapter` response.
 *
 * NOT picked up by `pnpm test`; run directly:
 * `npx mocha --require esbuild-register 'src/compat/*.test.js'`.
 */

// Minimal `QiscusSDK`-shaped context, just enough for `makeDeps` to build the
// raw message adapter over the given `HttpAdapter` stub.
function makeRawMessageAdapter(stub) {
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
  return makeDeps(self).messageAdapter
}

describe('compat/phase3 parity (message read path)', () => {
  it('loadComments: old userAdapter.loadComments vs new getMessages resolve/reject identically', async () => {
    // load_comments returns comments; the old User adapter resolves
    // res.body.results.comments (order as-is), the new getMessages resolves the
    // raw envelope whose .results.comments is the same array.
    const happy = { status: 200, results: { comments: [{ id: 3 }, { id: 2 }, { id: 1 }] } }

    const result = await compareParity({
      reference: ({ response }) =>
        new User(makeStubHttpAdapter(response)).loadComments(42, { last_comment_id: 100, limit: 20, after: false }),
      candidate: ({ response }) =>
        makeRawMessageAdapter(makeStubHttpAdapter(response))
          .getMessages(42, 100, 20, false)
          .then((raw) => raw.results.comments),
      cases: [
        { name: '200 resolves the same comments array', input: { response: { status: 200, body: happy } } },
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

  // The send call sites (sendComment/_retrySendComment/resendComment) swap the
  // transport `userAdapter.postComment` -> the `_postCommentViaCore` shell helper
  // (deps.messageAdapter.sendMessage). The optimistic-send orchestration around
  // them is unchanged, so parity is anchored on the transport helper: old
  // User.postComment vs _postCommentViaCore resolve/reject identically.
  it('_postCommentViaCore vs old userAdapter.postComment resolve/reject identically', async () => {
    const happy = {
      status: 200,
      results: { comment: { id: 99, comment_before_id: 98, unix_timestamp: 123, message: 'hi', unique_temp_id: 'u1' } },
    }
    const args = ['42', 'hi', 'u1', 'text', { k: 1 }, { e: 2 }]

    const result = await compareParity({
      reference: ({ response }) => new User(makeStubHttpAdapter(response)).postComment(...args),
      candidate: ({ response }) =>
        QiscusSDK.prototype._postCommentViaCore.apply(makeFakeSelf(makeStubHttpAdapter(response)), args),
      cases: [
        { name: '200 resolves results.comment', input: { response: { status: 200, body: happy } } },
        { name: 'HTTP 200 but envelope status 400 rejects on both', input: { response: { status: 200, body: { status: 400, error: { message: 'envelope' } } } } },
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

// `QiscusSDK`-shaped context for calling `_postCommentViaCore` in isolation
// (the deps getter mirrors ../index.js).
function makeFakeSelf(stub) {
  const self = {
    baseURL: 'https://api.example.com',
    AppId: 'sample-app-id',
    mqttURL: 'wss://mqtt.example.com/mqtt',
    _customHeader: {},
    user_id: 'user-1',
    userData: { id: 'user-1', email: 'user-1' },
    _hookAdapter: undefined,
    HTTPAdapter: stub,
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
