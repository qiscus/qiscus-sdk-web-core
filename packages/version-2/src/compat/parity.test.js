import { expect } from 'chai'
import { makeStubHttpAdapter, compareParity } from './parity'

/**
 * Self-test for the failure-path parity harness (docs/v2-on-core-v3-plan.md
 * §8.0.2, §11). There are no rewired v2 methods yet (Phase 0), so this does
 * NOT diff any real old-vs-new implementation — it only proves the harness
 * itself correctly classifies pass/fail:
 *  - two identical implementations -> every case reported as passing.
 *  - two implementations that diverge on a resolved value, or on a
 *    rejection body, -> reported as failing, with the divergence surfaced.
 * Real per-method parity runs happen in Phase 1+, once methods are rewired.
 *
 * NOT picked up by `pnpm test` (that only globs `test/**\/*test.js`); run
 * directly: `npx mocha --require esbuild-register src/compat/parity.test.js`.
 */
describe('compat/parity', () => {
  describe('makeStubHttpAdapter', () => {
    it('resolves 2xx responses with { status, body }, mimicking a superagent res', async () => {
      const http = makeStubHttpAdapter({ status: 200, body: { results: { ok: true } } })

      const res = await http.get('some/path')

      expect(res).to.deep.equal({ status: 200, body: { results: { ok: true } } })
      expect(http.calls).to.have.lengthOf(1)
      expect(http.calls[0]).to.deep.equal({ method: 'get', args: ['some/path'] })
    })

    ;[400, 403, 500].forEach((status) => {
      it(`rejects ${status} responses with a superagent-shaped error { response: { status, body } }`, async () => {
        const http = makeStubHttpAdapter({ status, body: { error: { message: 'nope' } } })

        let caught
        try {
          await http.post_json('some/path', {})
        } catch (err) {
          caught = err
        }

        expect(caught).to.exist
        expect(caught.response).to.deep.equal({ status, body: { error: { message: 'nope' } } })
      })
    })

    it('supports per-method configs, keyed by HttpAdapter method name', async () => {
      const http = makeStubHttpAdapter({
        get: { status: 200, body: { a: 1 } },
        post_json: { status: 403, body: { error: 'nope' } },
      })

      const getRes = await http.get('x')
      expect(getRes.body).to.deep.equal({ a: 1 })

      let caught
      try {
        await http.post_json('y', {})
      } catch (err) {
        caught = err
      }
      expect(caught.response.status).to.equal(403)
    })
  })

  describe('compareParity', () => {
    const cases = [
      { name: 'success', input: { mode: 'ok' } },
      { name: 'failure-403', input: { mode: 'fail', status: 403 } },
    ]

    /** The "old" implementation every candidate in this self-test is compared against. */
    async function reference(input) {
      if (input.mode === 'fail') {
        const err = new Error('boom')
        err.response = { status: input.status, body: { error: { message: 'nope' } } }
        throw err
      }
      return { id: 1, name: 'same' }
    }

    it('reports all cases passing when reference and candidate are identical', async () => {
      const report = await compareParity({ reference, candidate: reference, cases })

      expect(report.pass).to.be.true
      expect(report.total).to.equal(2)
      expect(report.passed).to.equal(2)
      expect(report.failed).to.equal(0)
      expect(report.firstDivergence).to.equal(null)
      expect(report.results.every((r) => r.pass)).to.be.true
    })

    it('flags a divergent resolved value as a failure and surfaces it as the first divergence', async () => {
      async function candidate(input) {
        if (input.mode === 'fail') {
          const err = new Error('boom')
          err.response = { status: input.status, body: { error: { message: 'nope' } } }
          throw err
        }
        return { id: 1, name: 'DIFFERENT' } // <- deliberately diverges from `reference`
      }

      const report = await compareParity({ reference, candidate, cases })

      expect(report.pass).to.be.false
      expect(report.failed).to.equal(1)
      expect(report.results.find((r) => r.name === 'failure-403').pass).to.be.true
      expect(report.firstDivergence.name).to.equal('success')
      expect(report.firstDivergence.reference.value).to.deep.equal({ id: 1, name: 'same' })
      expect(report.firstDivergence.candidate.value).to.deep.equal({ id: 1, name: 'DIFFERENT' })
    })

    it('flags a divergent rejection body as a failure and surfaces it as the first divergence', async () => {
      async function candidate(input) {
        if (input.mode === 'fail') {
          const err = new Error('boom')
          err.response = { status: input.status, body: { error: { message: 'DIFFERENT' } } } // <- diverges
          throw err
        }
        return { id: 1, name: 'same' }
      }

      const report = await compareParity({ reference, candidate, cases })

      expect(report.pass).to.be.false
      expect(report.failed).to.equal(1)
      expect(report.results.find((r) => r.name === 'success').pass).to.be.true
      expect(report.firstDivergence.name).to.equal('failure-403')
      expect(report.firstDivergence.reference.body).to.deep.equal({ error: { message: 'nope' } })
      expect(report.firstDivergence.candidate.body).to.deep.equal({ error: { message: 'DIFFERENT' } })
    })

    it('flags a divergent rejection status as a failure', async () => {
      async function candidate(input) {
        if (input.mode === 'fail') {
          const err = new Error('boom')
          err.response = { status: 500, body: { error: { message: 'nope' } } } // <- status diverges (403 -> 500)
          throw err
        }
        return { id: 1, name: 'same' }
      }

      const report = await compareParity({ reference, candidate, cases })

      expect(report.pass).to.be.false
      expect(report.failed).to.equal(1)
      expect(report.firstDivergence.name).to.equal('failure-403')
    })

    it('uses makeStubHttpAdapter-backed implementations end-to-end', async () => {
      async function implFromAdapter(config) {
        const http = makeStubHttpAdapter(config)
        const res = await http.get('api/v2/sdk/get_user_list')
        return res.body
      }

      const okCases = [
        { name: 'ok', input: { status: 200, body: { results: { users: [] } } } },
      ]

      const report = await compareParity({
        reference: implFromAdapter,
        candidate: implFromAdapter,
        cases: okCases,
      })

      expect(report.pass).to.be.true
    })
  })
})
