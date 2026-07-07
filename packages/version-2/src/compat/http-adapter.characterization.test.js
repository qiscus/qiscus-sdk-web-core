import { expect } from 'chai'
import http from 'http'
import HttpAdapter from '../lib/adapters/http'

/**
 * P1a characterization tests (docs/v2-full-shell-plan.md). Before moving v2's
 * HTTP transport onto core-v3's axios requester, pin the EXACT observable shapes
 * v2's superagent `HttpAdapter` produces — these are the customer contract that
 * the axios-backed replacement + its v2 error-shape adapter must reproduce
 * byte-for-byte:
 *  - resolve: a superagent `res` with `.body` (parsed JSON) + `.status`.
 *  - reject (HTTP error): an `Error` with `.status` AND `.response.{status,body}`.
 *  - the `QISCUS-SDK-*` request headers `setupHeaders` adds.
 *  - the 403 "token is expired" refresh-then-retry-once behavior.
 *
 * Driven against a real local http server so it characterizes REAL superagent,
 * not a stub. NOT picked up by `pnpm test`; run directly:
 * `npx mocha --require esbuild-register 'src/compat/*.test.js'`.
 */

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler)
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => resolve(data))
  })
}

describe('HttpAdapter characterization (superagent shapes)', () => {
  let server
  let baseURL
  let received
  let attempts

  beforeEach(async () => {
    received = []
    attempts = {}
    server = await startServer(async (req, res) => {
      const body = await readJsonBody(req)
      received.push({ method: req.method, url: req.url, headers: req.headers, body })
      const json = (code, obj) => {
        res.writeHead(code, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(obj))
      }
      if (req.url.startsWith('/ok')) return json(200, { status: 200, results: { ok: true } })
      if (req.url.startsWith('/notfound')) return json(404, { error: { message: 'not found' } })
      if (req.url.startsWith('/servererror')) return json(500, { error: { message: 'boom' } })
      if (req.url.startsWith('/expired')) {
        attempts.expired = (attempts.expired || 0) + 1
        if (attempts.expired === 1) return json(403, { error: { message: 'Unauthorized. Token is expired' } })
        return json(200, { status: 200, results: { retried: true } })
      }
      return json(200, {})
    })
    const addr = server.address()
    baseURL = `http://127.0.0.1:${addr.port}`
  })

  afterEach(() => server && server.close())

  function makeAdapter(overrides = {}) {
    let refreshCalls = 0
    const adapter = new HttpAdapter({
      baseURL,
      AppId: 'app-1',
      userId: 'user-1',
      version: '3.0.0',
      getCustomHeader: () => ({}),
      expiredTokenAdapterGetter: () => ({
        refreshAuthToken: async () => {
          refreshCalls++
        },
      }),
      ...overrides,
    })
    adapter.__refreshCalls = () => refreshCalls
    return adapter
  }

  it('GET 200 resolves a superagent res with .body (parsed JSON) + .status', async () => {
    const res = await makeAdapter().get('ok')
    expect(res.status).to.equal(200)
    expect(res.body).to.deep.equal({ status: 200, results: { ok: true } })
  })

  it('rejects 404 with err.status AND err.response.{status,body}', async () => {
    let err
    try {
      await makeAdapter().get('notfound')
    } catch (e) {
      err = e
    }
    expect(err).to.exist
    expect(err.status).to.equal(404)
    expect(err.response.status).to.equal(404)
    expect(err.response.body).to.deep.equal({ error: { message: 'not found' } })
  })

  it('rejects 500 with the same superagent error shape', async () => {
    let err
    try {
      await makeAdapter().get('servererror')
    } catch (e) {
      err = e
    }
    expect(err.status).to.equal(500)
    expect(err.response.body).to.deep.equal({ error: { message: 'boom' } })
  })

  it('post_json sends the JSON body and resolves res.body', async () => {
    const res = await makeAdapter().post_json('ok', { hello: 'world' })
    expect(res.body).to.deep.equal({ status: 200, results: { ok: true } })
    const sent = received.find((r) => r.method === 'POST')
    expect(JSON.parse(sent.body)).to.deep.equal({ hello: 'world' })
  })

  it('setupHeaders sends the canonical QISCUS-SDK-* headers (+ token when set)', async () => {
    const adapter = makeAdapter()
    adapter.setToken('tok-123')
    await adapter.get('ok')
    const h = received[0].headers
    expect(h['qiscus-sdk-platform']).to.equal('javascript')
    expect(h['qiscus-sdk-app-id']).to.equal('app-1')
    expect(h['qiscus-sdk-user-id']).to.equal('user-1')
    expect(h['qiscus-sdk-token']).to.equal('tok-123')
    expect(h['qiscus-sdk-version']).to.equal('3.0.0')
  })

  it('on 403 "token is expired" it refreshes once and retries, then resolves', async () => {
    const adapter = makeAdapter()
    const res = await adapter.get('expired')
    expect(adapter.__refreshCalls()).to.equal(1)
    expect(attempts.expired).to.equal(2) // original + retry
    expect(res.body).to.deep.equal({ status: 200, results: { retried: true } })
  })
})
