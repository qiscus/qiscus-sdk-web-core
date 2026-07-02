/**
 * compat/parity.js
 *
 * Failure-path parity harness (docs/v2-on-core-v3-plan.md §8.0.2, §11).
 *
 * The Phase 0/§10.4 "public-surface shape diff" gate only compares method
 * names/fields — it cannot see divergence on the **error path** (different
 * rejection shape, different status code, different error body) between the
 * old v2 implementation of a method and its re-platformed core-v3-backed
 * replacement. This module is a small, reusable harness for that: given a
 * `reference` (old) and `candidate` (new) async implementation of the same
 * method, and a shared set of input `cases`, it runs both, and diffs BOTH
 * the resolved value AND the rejection shape (status + body) for every case.
 *
 * This is a **harness**, not a full test framework: it has no fixtures of
 * its own and doesn't know about any real v2 method. Per-method parity runs
 * (feeding it real old-vs-new implementations) happen in Phase 1+, once
 * methods are actually rewired. `parity.test.js` only self-tests that the
 * harness itself correctly classifies pass/fail.
 */

/**
 * Builds a fake `HttpAdapter` (see `lib/adapters/http.js`) whose methods
 * (`get`, `get_request`, `post`, `post_json`, `put`, `patch`, `del`)
 * resolve/reject the way superagent-backed `HttpAdapter` methods do for a
 * given canned response:
 * - 2xx status -> resolves `{ status, body }` (mirrors a superagent `res`).
 * - non-2xx status (400/403/500/...) -> rejects with a superagent-shaped
 *   error: `{ response: { status, body } }` (mirrors what
 *   `HttpAdapter._retryHelper`/callers read via `err.response.status` /
 *   `err.response.body`).
 *
 * Every call is recorded on the returned `calls` array (`{ method, args }`)
 * for assertions.
 *
 * @param {{status: number, body: unknown}|Record<string, {status: number, body: unknown}>} responsesByStatus
 *   Either a single `{ status, body }` config applied to every adapter
 *   method (the common case: "the backend responds like *this* for this
 *   call"), or a map keyed by `HttpAdapter` method name
 *   (`{ get: {status,body}, post_json: {status,body}, ... }`) for cases that
 *   need different canned responses per HTTP verb.
 * @returns {{calls: Array<{method: string, args: unknown[]}>} & Record<string, (...args: unknown[]) => Promise<unknown>>}
 */
export function makeStubHttpAdapter(responsesByStatus) {
  const calls = []
  const methodNames = ['get', 'get_request', 'post', 'post_json', 'put', 'patch', 'del']

  const isSingleConfig =
    responsesByStatus != null &&
    typeof responsesByStatus === 'object' &&
    'status' in responsesByStatus

  function resolveConfig(method) {
    if (isSingleConfig) return responsesByStatus
    return responsesByStatus ? responsesByStatus[method] : undefined
  }

  function respond(method) {
    return (...args) => {
      calls.push({ method, args })
      const config = resolveConfig(method)
      if (config == null) {
        return Promise.reject(
          new Error(`makeStubHttpAdapter: no response configured for "${method}"`)
        )
      }
      const { status, body } = config
      if (status >= 200 && status < 300) {
        return Promise.resolve({ status, body })
      }
      const err = new Error(`makeStubHttpAdapter: request failed with status ${status}`)
      err.response = { status, body }
      return Promise.reject(err)
    }
  }

  const adapter = { calls }
  for (const method of methodNames) adapter[method] = respond(method)
  return adapter
}

/**
 * Minimal structural deep-equal (no Node `assert` dependency, since this
 * module ships inside the browser-bundled `version-2` package). Good enough
 * for comparing plain JSON-shaped API bodies/results — not a general-purpose
 * equality library (no cyclic-ref handling, no special-casing `Date`/`Map`).
 * @param {unknown} a
 * @param {unknown} b
 * @returns {boolean}
 */
function deepEqual(a, b) {
  if (Object.is(a, b)) return true
  if (typeof a !== typeof b) return false
  if (a == null || b == null) return a === b
  if (typeof a !== 'object') return false
  if (Array.isArray(a) !== Array.isArray(b)) return false

  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]))
}

/**
 * Runs `fn(input)` and normalizes the outcome into a comparable shape:
 * `{ type: 'resolved', value }` or `{ type: 'rejected', status, body, message }`
 * (`status`/`body` read off a superagent-shaped `err.response`, matching
 * both real `HttpAdapter` errors and `makeStubHttpAdapter`'s rejections).
 * @param {(input: unknown) => Promise<unknown>} fn
 * @param {unknown} input
 */
async function settle(fn, input) {
  try {
    const value = await fn(input)
    return { type: 'resolved', value }
  } catch (err) {
    return {
      type: 'rejected',
      status: err?.response?.status,
      body: err?.response?.body,
      message: err?.message,
    }
  }
}

/**
 * @param {{type: string, value?: unknown, status?: number, body?: unknown}} a
 * @param {{type: string, value?: unknown, status?: number, body?: unknown}} b
 * @returns {boolean}
 */
function outcomesEqual(a, b) {
  if (a.type !== b.type) return false
  if (a.type === 'resolved') return deepEqual(a.value, b.value)
  // Rejected: parity is judged on status + body (the observable contract a
  // consumer's `.catch(e => e.response.body...)` depends on), not on the
  // JS `Error#message` text, which is allowed to differ internally.
  return a.status === b.status && deepEqual(a.body, b.body)
}

/**
 * Runs `reference` and `candidate` — two async implementations of "the same
 * method" — over the same `cases`, and diffs BOTH the resolved value AND
 * the rejection shape (status + body) for every case.
 *
 * @param {object} args
 * @param {(input: unknown) => Promise<unknown>} args.reference - the old/known-good implementation.
 * @param {(input: unknown) => Promise<unknown>} args.candidate - the new implementation under test.
 * @param {Array<{name?: string, input: unknown}>} args.cases - shared inputs to run through both.
 * @returns {Promise<{
 *   pass: boolean,
 *   total: number,
 *   passed: number,
 *   failed: number,
 *   results: Array<{name: string, pass: boolean, reference: object, candidate: object}>,
 *   firstDivergence: {name: string, pass: boolean, reference: object, candidate: object} | null,
 * }>}
 */
export async function compareParity({ reference, candidate, cases }) {
  const results = []

  for (let i = 0; i < cases.length; i++) {
    const testCase = cases[i]
    const name = testCase.name ?? `case[${i}] ${JSON.stringify(testCase.input)}`

    const [refOutcome, candOutcome] = await Promise.all([
      settle(reference, testCase.input),
      settle(candidate, testCase.input),
    ])

    const pass = outcomesEqual(refOutcome, candOutcome)
    results.push({ name, pass, reference: refOutcome, candidate: candOutcome })
  }

  const failed = results.filter((r) => !r.pass)

  return {
    pass: failed.length === 0,
    total: results.length,
    passed: results.length - failed.length,
    failed: failed.length,
    results,
    firstDivergence: failed[0] ?? null,
  }
}
