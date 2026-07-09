import { expect } from 'chai'
import { makeDeps } from './deps'

/**
 * P5 pass 4 (docs/v2-full-shell-plan.md §4, final "delete the last superagent
 * pieces" pass). LOGIN IS THE MOST CRITICAL ENDPOINT: this pins the EXACT
 * wire body `deps.userAdapter.login(...)` (core-v3's `getUserAdapterRaw` ->
 * `Api.loginOrRegister` -> `Encode.loginOrRegister`) sends for the
 * `login_or_register` request, BEFORE `setUser()` is swapped onto it, so the
 * swap can be proven byte-for-byte parity-preserving against v2's old
 * `AuthAdapter.loginOrRegister` (superagent, urlencoded, `extras` sent
 * PRE-STRINGIFIED).
 *
 * Accepted divergence (Fable-approved, v3-proven in prod, same as every other
 * re-platformed POST): Content-Type urlencoded -> JSON (axios default). No
 * other body difference is allowed.
 *
 * NOT picked up by `pnpm test`; run directly:
 * `npx mocha --require esbuild-register 'src/compat/*.test.js'`.
 */

function makeSelf() {
  return {
    baseURL: 'https://api.example.com',
    AppId: 'sample-app-id',
    mqttURL: 'wss://mqtt.example.com/mqtt',
    _customHeader: {},
    user_id: 'u@x',
    userData: {},
    _hookAdapter: undefined,
    _deps: null,
  }
}

function makeCapturingApiAdapter(cannedBody) {
  const captured = { request: null }
  return {
    captured,
    apiAdapter: {
      request(apiConfig) {
        captured.request = apiConfig
        return Promise.resolve(cannedBody)
      },
    },
  }
}

describe('login transport characterization (v2 -> core-v3 userAdapter.login)', () => {
  it('sends the login_or_register body byte-for-byte, with extras passed through ALREADY STRINGIFIED', async () => {
    const cannedBody = {
      status: 200,
      results: { user: { email: 'u@x', refresh_token: 'rt', token: 'tok' } },
    }
    const { apiAdapter, captured } = makeCapturingApiAdapter(cannedBody)
    const self = makeSelf()
    const deps = makeDeps(self, { apiAdapter })

    const result = await deps.userAdapter.login('u@x', 'secret', {
      name: 'User',
      avatarUrl: 'http://a/x.png',
      extras: JSON.stringify({ role: 'admin' }),
    })

    expect(captured.request.method).to.equal('post')
    expect(captured.request.url).to.equal('/login_or_register')
    expect(captured.request.body).to.deep.equal({
      email: 'u@x',
      password: 'secret',
      username: 'User',
      avatar_url: 'http://a/x.png',
      device_token: undefined,
      // Parity-critical: this MUST be the stringified string, not the
      // original object, matching v2's `extras: extras ? JSON.stringify(extras) : null`.
      extras: '{"role":"admin"}',
    })

    expect(result).to.deep.equal(cannedBody)
  })
})
