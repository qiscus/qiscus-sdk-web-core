import { expect } from 'chai'
import { makeStubHttpAdapter, compareParity } from './parity'
import QiscusSDK from '../index'
import User from '../lib/adapters/user'
import { makeDeps } from './deps'
import { makeV2Requester } from './requester'

/**
 * Phase 1 failure-path parity (docs/v2-on-core-v3-plan.md §8.0.2, §9, §11).
 *
 * For every user-domain read method re-platformed onto core-v3's raw adapter
 * in Phase 1, the pre-rewire body is kept verbatim on the class as
 * `_legacy<Method>` (see the comment above `_legacyGetUsers` in
 * `../index.js`). This suite drives the REAL `_legacy*` (reference) and REAL
 * re-platformed (candidate) prototype methods over a shared `QiscusSDK`-shaped
 * fake `self`, backed by the same canned `HttpAdapter` response, and asserts
 * they resolve identically AND reject identically across 200 / 400 / 403 / 500
 * — the divergence the Phase 0 shape-diff gate cannot see.
 *
 * NOT picked up by `pnpm test` (that only globs `test/**\/*test.js`); run
 * directly: `npx mocha --require esbuild-register 'src/compat/*.test.js'`.
 *
 * Scope note: `getNonce` is intentionally NOT re-platformed in Phase 1 — it
 * bypasses `HttpAdapter` entirely (raw superagent + pre-auth-only
 * `qiscus_sdk_*` lowercase headers, no token), so routing it through the
 * shim would change its header set on a pre-auth flow. Deferred to its own
 * step (see docs/migrations.md).
 */

const P = QiscusSDK.prototype

// A `QiscusSDK`-shaped context object just complete enough for the Phase 1
// user-read methods + `makeDeps(self)` to run: the old `userAdapter` (reference
// path), the shared `HTTPAdapter` stub, an event sink (block/unblock emit), and
// the lazily-memoized `deps` getter that mirrors `../index.js`.
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
    userAdapter: new User(stub),
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
      // Inject the legacy superagent-stub transport so parity runs network-free
      // (production `makeDeps` defaults to the axios requester).
      if (this._deps == null) this._deps = makeDeps(this, { apiAdapter: makeV2Requester(this.HTTPAdapter) })
      return this._deps
    },
  })
  return self
}

// Standard canned-response stub: `.get`/`.post`/`.post_json`/... all resolve
// (2xx) or reject (non-2xx, superagent-shaped) with the same config.
function plainStub(response) {
  return makeStubHttpAdapter(response)
}

// getUsers is special: `_legacyGetUsers` uses the `get_request(url).query(...)`
// superagent chain (no plain-stub method covers that), while the candidate
// goes through `makeV2Requester` -> `.get`. This stub satisfies both: a
// chainable `get_request().query()` AND the standard `.get`, keyed off the
// same canned response.
function usersStub(response) {
  const stub = makeStubHttpAdapter(response)
  stub.get_request = (...args) => {
    stub.calls.push({ method: 'get_request', args })
    return {
      query(params) {
        stub.calls.push({ method: 'query', args: [params] })
        const { status, body } = response
        if (status >= 200 && status < 300) return Promise.resolve({ status, body })
        const err = new Error(`stub get_request failed with status ${status}`)
        err.response = { status, body }
        return Promise.reject(err)
      },
    }
  }
  return stub
}

function runParity({ legacyMethod, newMethod, stubFactory, cases }) {
  return compareParity({
    reference: ({ args, response }) => P[legacyMethod].apply(makeFakeSelf(stubFactory(response)), args),
    candidate: ({ args, response }) => P[newMethod].apply(makeFakeSelf(stubFactory(response)), args),
    cases,
  })
}

// HTTP-error cases shared by every method (the byte-identical common path).
function httpErrorCases(args) {
  return [400, 403, 500].map((status) => ({
    name: `HTTP ${status} rejects identically`,
    input: { args, response: { status, body: { error: { message: `err-${status}` } } } },
  }))
}

describe('compat/phase1 parity (user-domain reads)', () => {
  it('getUsers — old get_request().query() vs deps.userAdapter.getUserList', async () => {
    const happy = { status: 200, results: { meta: { total_data: 2, total_page: 1 }, users: [{ id: 1, email: 'a' }, { id: 2, email: 'b' }] } }
    const result = await runParity({
      legacyMethod: '_legacyGetUsers',
      newMethod: 'getUsers',
      stubFactory: usersStub,
      cases: [
        { name: '200 resolves the same results envelope', input: { args: ['query', 1, 20], response: { status: 200, body: happy } } },
        ...httpErrorCases(['query', 1, 20]),
      ],
    })
    expect(result.firstDivergence, JSON.stringify(result.firstDivergence, null, 2)).to.equal(null)
    expect(result.pass).to.equal(true)
  })

  it('getBlockedUser — envelope-status check + blocked_users resolve', async () => {
    const happy = { status: 200, results: { blocked_users: [{ id: 9, email: 'blocked' }], total: 1 } }
    const result = await runParity({
      legacyMethod: '_legacyGetBlockedUser',
      newMethod: 'getBlockedUser',
      stubFactory: plainStub,
      cases: [
        { name: '200 resolves blocked_users', input: { args: [1, 20], response: { status: 200, body: happy } } },
        { name: 'HTTP 200 but envelope status 400 rejects on both', input: { args: [1, 20], response: { status: 200, body: { status: 400, error: { message: 'envelope' } } } } },
        ...httpErrorCases([1, 20]),
      ],
    })
    expect(result.firstDivergence, JSON.stringify(result.firstDivergence, null, 2)).to.equal(null)
    expect(result.pass).to.equal(true)
  })

  it('blockUser — sync throw on empty email, user resolve, envelope reject, event emit', async () => {
    const happy = { status: 200, results: { user: { id: 9, email: 'blocked', username: 'Blocked' } } }
    const result = await runParity({
      legacyMethod: '_legacyBlockUser',
      newMethod: 'blockUser',
      stubFactory: plainStub,
      cases: [
        { name: '200 resolves the blocked user', input: { args: ['blocked@e.com'], response: { status: 200, body: happy } } },
        { name: 'empty email throws synchronously on both', input: { args: [''], response: { status: 200, body: happy } } },
        { name: 'HTTP 200 but envelope status 400 rejects on both', input: { args: ['blocked@e.com'], response: { status: 200, body: { status: 400, error: { message: 'envelope' } } } } },
        ...httpErrorCases(['blocked@e.com']),
      ],
    })
    expect(result.firstDivergence, JSON.stringify(result.firstDivergence, null, 2)).to.equal(null)
    expect(result.pass).to.equal(true)
  })

  it('unblockUser — sync throw on empty email, user resolve, envelope reject, event emit', async () => {
    const happy = { status: 200, results: { user: { id: 9, email: 'unblocked', username: 'Unblocked' } } }
    const result = await runParity({
      legacyMethod: '_legacyUnblockUser',
      newMethod: 'unblockUser',
      stubFactory: plainStub,
      cases: [
        { name: '200 resolves the unblocked user', input: { args: ['unblocked@e.com'], response: { status: 200, body: happy } } },
        { name: 'empty email throws synchronously on both', input: { args: [''], response: { status: 200, body: happy } } },
        { name: 'HTTP 200 but envelope status 400 rejects on both', input: { args: ['unblocked@e.com'], response: { status: 200, body: { status: 400, error: { message: 'envelope' } } } } },
        ...httpErrorCases(['unblocked@e.com']),
      ],
    })
    expect(result.firstDivergence, JSON.stringify(result.firstDivergence, null, 2)).to.equal(null)
    expect(result.pass).to.equal(true)
  })

  it('getUserProfile — my_profile GET resolves results.user (no status check)', async () => {
    const happy = { status: 200, results: { user: { id: 1, email: 'a', username: 'User One' } } }
    const result = await runParity({
      legacyMethod: '_legacyGetUserProfile',
      newMethod: 'getUserProfile',
      stubFactory: plainStub,
      cases: [
        { name: '200 resolves results.user', input: { args: [], response: { status: 200, body: happy } } },
        ...httpErrorCases([]),
      ],
    })
    expect(result.firstDivergence, JSON.stringify(result.firstDivergence, null, 2)).to.equal(null)
    expect(result.pass).to.equal(true)
  })
})
