import { expect } from 'chai'
import http from 'http'
import { makeDeps } from './deps'

/**
 * P1c end-to-end proof: build `deps` via PRODUCTION `makeDeps` (no injected
 * apiAdapter → the default axios transport) pointed at a real local server, and
 * drive a raw adapter method through it. Confirms the axios wiring actually
 * works: correct URL, the QISCUS-SDK-* headers (incl. the PLATFORM one the axios
 * requester adds), and the resolved raw body.
 */

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler)
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

describe('deps production axios path (P1c end-to-end)', () => {
  let server
  let baseURL
  let received

  beforeEach(async () => {
    received = []
    server = await startServer((req, res) => {
      received.push({ method: req.method, url: req.url, headers: req.headers })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 200, results: { meta: { total_data: 0 }, users: [] } }))
    })
    baseURL = `http://127.0.0.1:${server.address().port}`
  })

  afterEach(() => server && server.close())

  function makeSelf() {
    return {
      baseURL,
      AppId: 'app-1',
      version: '3.0.0',
      mqttURL: 'wss://mqtt.example/mqtt',
      _customHeader: {},
      user_id: 'user-1',
      userData: { id: 'user-1' },
      HTTPAdapter: { token: 'tok-1' },
      refreshAuthToken: async () => {},
      _deps: null,
    }
  }

  it('getUserList goes out over axios to user_rooms endpoint with QISCUS-SDK-* headers and resolves the raw body', async () => {
    const deps = makeDeps(makeSelf())
    const body = await deps.userAdapter.getUserList('q', 1, 20)

    expect(body).to.deep.equal({ status: 200, results: { meta: { total_data: 0 }, users: [] } })

    expect(received).to.have.lengthOf(1)
    const call = received[0]
    expect(call.method).to.equal('GET')
    expect(call.url).to.contain('/api/v2/sdk/get_user_list')
    expect(call.url).to.contain('query=q')
    const h = call.headers
    expect(h['qiscus-sdk-platform']).to.equal('javascript')
    expect(h['qiscus-sdk-app-id']).to.equal('app-1')
    expect(h['qiscus-sdk-version']).to.equal('3.0.0')
    expect(h['qiscus-sdk-token']).to.equal('tok-1')
    expect(h['qiscus-sdk-user-id']).to.equal('user-1')
  })
})
