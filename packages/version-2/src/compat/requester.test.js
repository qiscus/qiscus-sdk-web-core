import { expect } from 'chai'
import { makeV2Requester } from './requester'

/**
 * Wiring proof for Phase 0 (docs/v2-on-core-v3-plan.md §8.0.1): asserts
 * `makeV2Requester` dispatches a core-v3 `Api` descriptor to the right
 * `HttpAdapter` method, with the right path/query/body, and returns
 * `res.body` (matching core-v3's `apiAdapter.request` contract).
 *
 * NOT picked up by `pnpm test` (that only globs `test/**\/*test.js`); run
 * directly: `npx mocha --require esbuild-register src/compat/requester.test.js`.
 */
function makeFakeHttpAdapter(bodyByMethod) {
  const calls = []
  const record = (method) => (path, ...args) => {
    calls.push({ method, path, args })
    return Promise.resolve({ body: bodyByMethod[method], status: 200 })
  }
  return {
    calls,
    get: record('get'),
    post_json: record('post_json'),
    put: record('put'),
    patch: record('patch'),
    del: record('del'),
  }
}

describe('compat/requester', () => {
  describe('makeV2Requester', () => {
    it('routes a GET descriptor to httpAdapter.get with path+query, returns res.body', async () => {
      const http = makeFakeHttpAdapter({ get: { ok: true } })
      const requester = makeV2Requester(http)

      const result = await requester.request({
        method: 'get',
        url: '/x',
        params: { a: '1' },
        baseUrl: 'https://example.test/api/v2/sdk',
      })

      expect(result).to.deep.equal({ ok: true })
      expect(http.calls).to.have.lengthOf(1)
      expect(http.calls[0].method).to.equal('get')
      expect(http.calls[0].path).to.equal('api/v2/sdk/x?a=1')
      expect(http.calls[0].args[0]).to.deep.equal({})
    })

    it('routes a POST descriptor to httpAdapter.post_json with api.body, returns res.body', async () => {
      const http = makeFakeHttpAdapter({ post_json: { id: 1 } })
      const requester = makeV2Requester(http)
      const body = { text: 'hello' }

      const result = await requester.request({
        method: 'post',
        url: '/y',
        body,
        baseUrl: 'https://example.test/api/v2/sdk',
      })

      expect(result).to.deep.equal({ id: 1 })
      expect(http.calls).to.have.lengthOf(1)
      expect(http.calls[0].method).to.equal('post_json')
      expect(http.calls[0].path).to.equal('api/v2/sdk/y')
      expect(http.calls[0].args[0]).to.equal(body)
    })

    it('routes put/patch/delete to their matching httpAdapter methods', async () => {
      const http = makeFakeHttpAdapter({ put: {}, patch: {}, del: {} })
      const requester = makeV2Requester(http)

      await requester.request({ method: 'put', url: '/a', baseUrl: 'https://x/api/v2/sdk' })
      await requester.request({ method: 'patch', url: '/b', baseUrl: 'https://x/api/v2/sdk' })
      await requester.request({ method: 'delete', url: '/c', baseUrl: 'https://x/api/v2/sdk' })

      expect(http.calls.map((c) => c.method)).to.deep.equal(['put', 'patch', 'del'])
      expect(http.calls.map((c) => c.path)).to.deep.equal([
        'api/v2/sdk/a',
        'api/v2/sdk/b',
        'api/v2/sdk/c',
      ])
    })

    it('falls back to the plain path when no baseUrl is provided', async () => {
      const http = makeFakeHttpAdapter({ get: { ok: true } })
      const requester = makeV2Requester(http)

      await requester.request({ method: 'get', url: '/z' })

      expect(http.calls[0].path).to.equal('z')
    })

    it('propagates rejections unchanged (does not wrap/catch)', async () => {
      const boom = new Error('boom')
      const http = { get: () => Promise.reject(boom) }
      const requester = makeV2Requester(http)

      let caught
      try {
        await requester.request({ method: 'get', url: '/x' })
      } catch (err) {
        caught = err
      }
      expect(caught).to.equal(boom)
    })
  })
})
