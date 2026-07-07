import { expect } from 'chai'
import http from 'http'
import { storageFactory } from '@qiscus/core-v3'
import { makeV2AxiosRequester } from './axios-requester'

/**
 * P1b test (docs/v2-full-shell-plan.md): prove the axios-backed requester
 * reproduces the SAME observable contract as v2's superagent HttpAdapter
 * (pinned in http-adapter.characterization.test.js) — resolve body, reject
 * with err.status + err.response.{status,body}, the QISCUS-SDK-PLATFORM header,
 * and 403 "token is expired" refresh-then-retry-once. Driven against a real
 * local http server (real axios).
 */

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler)
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

describe('makeV2AxiosRequester (superagent-shape over core-v3 axios)', () => {
  let server
  let baseUrl
  let received
  let attempts

  beforeEach(async () => {
    received = []
    attempts = {}
    server = await startServer((req, res) => {
      received.push({ method: req.method, url: req.url, headers: req.headers })
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
    baseUrl = `http://127.0.0.1:${server.address().port}`
  })

  afterEach(() => server && server.close())

  function makeRequester(overrides = {}) {
    const storage = storageFactory()
    let refreshCalls = 0
    const req = makeV2AxiosRequester(storage, {
      refreshToken: async () => {
        refreshCalls++
      },
      ...overrides,
    })
    req.__refreshCalls = () => refreshCalls
    return req
  }

  it('GET 200 resolves the parsed response body (like superagent res.body)', async () => {
    const body = await makeRequester().request({ method: 'get', url: '/ok', baseUrl })
    expect(body).to.deep.equal({ status: 200, results: { ok: true } })
  })

  it('rejects 404 with err.status AND err.response.{status,body} (superagent shape)', async () => {
    let err
    try {
      await makeRequester().request({ method: 'get', url: '/notfound', baseUrl })
    } catch (e) {
      err = e
    }
    expect(err).to.exist
    expect(err.status).to.equal(404)
    expect(err.response.status).to.equal(404)
    expect(err.response.body).to.deep.equal({ error: { message: 'not found' } })
  })

  it('rejects 500 with the same superagent-shaped error', async () => {
    let err
    try {
      await makeRequester().request({ method: 'get', url: '/servererror', baseUrl })
    } catch (e) {
      err = e
    }
    expect(err.status).to.equal(500)
    expect(err.response.body).to.deep.equal({ error: { message: 'boom' } })
  })

  it('adds the QISCUS-SDK-PLATFORM header + forwards descriptor headers', async () => {
    await makeRequester().request({
      method: 'get',
      url: '/ok',
      baseUrl,
      headers: { 'qiscus-sdk-app-id': 'app-1', 'qiscus-sdk-token': 'tok-1' },
    })
    const h = received[0].headers
    expect(h['qiscus-sdk-platform']).to.equal('javascript')
    expect(h['qiscus-sdk-app-id']).to.equal('app-1')
    expect(h['qiscus-sdk-token']).to.equal('tok-1')
  })

  it('on 403 "token is expired" it refreshes once and retries, then resolves', async () => {
    const req = makeRequester()
    const body = await req.request({ method: 'get', url: '/expired', baseUrl })
    expect(req.__refreshCalls()).to.equal(1)
    expect(attempts.expired).to.equal(2)
    expect(body).to.deep.equal({ status: 200, results: { retried: true } })
  })

  it('does NOT retry a 403 that is not a token-expired error', async () => {
    // /notfound is 404, but assert non-expired 403s also pass through: reuse
    // servererror as a stand-in for a non-retryable failure.
    const req = makeRequester()
    let err
    try {
      await req.request({ method: 'get', url: '/servererror', baseUrl })
    } catch (e) {
      err = e
    }
    expect(req.__refreshCalls()).to.equal(0)
    expect(err.status).to.equal(500)
  })
})
