/**
 * compat/requester.js
 *
 * Adapts v2's superagent-backed `HttpAdapter` (src/lib/adapters/http.js) into
 * core-v3's `ApiRequester` contract: `{ request(api): Promise<respBody> }`
 * where `api = { method, url, baseUrl?, params?, body?, headers? }`.
 *
 * Why route through HttpAdapter instead of core-v3's own axios requester
 * (`Core.makeApiRequest`)? See docs/v2-on-core-v3-plan.md §4a: v2's public
 * contract includes superagent's error shape (`err.response.body`, and some
 * v2 methods reject with the *whole* superagent `res`), the transparent
 * 403-"token is expired" retry-once behavior baked into
 * `HttpAdapter._retryHelper`, and v2's exact header set
 * (`QISCUS-SDK-PLATFORM`/`VERSION`/etc. via `setupHeaders`). Routing core-v3's
 * raw adapters' requests back through `HttpAdapter` gets all of that for
 * free, for free, while still reusing core-v3's `Api.*` request builders and
 * raw adapters.
 *
 * baseUrl/path handling
 * ----------------------
 * core-v3 builds `api.baseUrl` as `${storage.getBaseUrl()}/api/v2/sdk`
 * (see packages/core-v3/src/provider.ts `withBaseUrl`), and `storage`'s
 * base URL is seeded from the same value as `httpAdapter.baseURL` (see
 * compat/deps.js). So `api.baseUrl` and `httpAdapter.baseURL` always share
 * the same origin; `api.baseUrl` just adds the `/api/v2/sdk` path prefix.
 *
 * `HttpAdapter`'s plain methods (`post_json`/`put`/`patch`/`del`) don't take
 * a baseURL override — they always build `${httpAdapter.baseURL}/${path}`.
 * Only `get` accepts an `options.baseURL` override. To keep dispatch uniform
 * across all methods, we don't use that `get`-only override at all: instead
 * we strip the origin off `api.baseUrl` (leaving just the `/api/v2/sdk`
 * prefix) and fold it into the path we hand to whichever HttpAdapter method
 * we call, e.g. `path = 'api/v2/sdk' + '/' + api.url.replace(/^\//, '')`.
 * That way `${httpAdapter.baseURL}/${path}` always reconstructs the same
 * full URL core-v3 would have hit directly, for every HTTP verb.
 */

/**
 * Strips the scheme+host off a URL, leaving the path portion (no leading
 * slash), e.g. `https://a.b.com/api/v2/sdk` -> `api/v2/sdk`.
 * @param {string} url
 * @returns {string}
 */
function stripOrigin(url) {
  return String(url).replace(/^https?:\/\/[^/]+\/?/, '')
}

/**
 * Builds a `?k=v&...` query string from a params object, skipping
 * null/undefined values. Returns `''` when there is nothing to encode.
 * @param {Record<string, unknown>} [params]
 * @returns {string}
 */
export function queryString(params) {
  if (params == null) return ''
  const parts = []
  for (const key of Object.keys(params)) {
    const value = params[key]
    if (value == null) continue
    if (Array.isArray(value)) {
      // Repeated `key[]=v` — axios's default array serialization, i.e. what
      // core-v3's own axios requester sends, so an array query param is
      // wire-identical to what version-3 already exercises in prod.
      for (const item of value) {
        if (item == null) continue
        parts.push(`${encodeURIComponent(key)}[]=${encodeURIComponent(item)}`)
      }
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    }
  }
  if (parts.length === 0) return ''
  return `?${parts.join('&')}`
}

/**
 * Builds the path `HttpAdapter` should be called with, so that
 * `${httpAdapter.baseURL}/${path}` matches `${api.baseUrl}${api.url}`.
 * @param {{ url: string, baseUrl?: string }} api
 * @returns {string}
 */
function buildPath(api) {
  const urlPath = String(api.url).replace(/^\//, '')
  const basePrefix = api.baseUrl ? stripOrigin(api.baseUrl).replace(/\/$/, '') : ''
  return basePrefix ? `${basePrefix}/${urlPath}` : urlPath
}

/**
 * Builds a core-v3 `ApiRequester` backed by v2's `HttpAdapter`.
 *
 * Deliberately ignores `api.headers` (Provider's credential/header
 * descriptors) — `HttpAdapter.setupHeaders` already adds v2's canonical
 * `QISCUS-SDK-*` headers from its own fields (AppId/userId/token/version/
 * custom headers). Merging `api.headers` too would duplicate/shadow those
 * with core-v3's own `qiscus-sdk-*` header names.
 *
 * Superagent errors/rejections are intentionally NOT caught or rewrapped
 * here — they propagate as-is, preserving v2's exact error shapes (incl.
 * full-`res` rejections some v2 methods rely on) and letting
 * `HttpAdapter._retryHelper`'s 403-refresh-retry keep working transparently.
 *
 * Two ACCEPTED parity divergences (reviewed w/ Fable, docs/migrations.md
 * "Phase 1"): both judged safe, byte-for-byte on everything a *customer app*
 * can observe, and diverging only on wire/pathological details v3 already
 * exercises in production.
 *  1. POST Content-Type flips `application/x-www-form-urlencoded` -> JSON.
 *     Old v2 sent some POSTs (e.g. block_user/unblock_user) via
 *     `HttpAdapter.post` (urlencoded); this shim routes EVERY `post` through
 *     `post_json`. Same endpoint + same body keys, only the encoding/header
 *     differs — and version-3 (plain axios) already POSTs JSON to these exact
 *     endpoints in production via the same `Api.*` builders, so backend
 *     acceptance is proven. (Watch item: body *value types* — urlencoded
 *     stringifies `true`/`9`; JSON keeps them native. Verify per endpoint that
 *     carries non-string body values; the Phase 1 methods send only strings.)
 *  2. Envelope-status reject shape. A few old methods reject with the WHOLE
 *     superagent `res` on the (rare) HTTP-200-but-`body.status !== 200`
 *     branch. This shim returns only `res.body`, so the re-platformed shell
 *     methods reject with a reconstructed `{ status, body }` (same `.body`,
 *     same `.status`, missing `.headers`/`.text`/`.ok`). The COMMON error
 *     path (HTTP 4xx/5xx) is byte-identical — the superagent error object
 *     propagates unchanged through this shim.
 *
 * @param {import('../lib/adapters/http').default} httpAdapter
 * @returns {{ request(api: { method: 'get'|'post'|'put'|'patch'|'delete', url: string, baseUrl?: string, params?: object, body?: object, headers?: object }): Promise<unknown> }}
 */
export function makeV2Requester(httpAdapter) {
  return {
    async request(api) {
      const path = buildPath(api)

      switch (api.method) {
        case 'get': {
          const res = await httpAdapter.get(path + queryString(api.params), {})
          return res.body
        }
        case 'post': {
          const res = await httpAdapter.post_json(path, api.body, {})
          return res.body
        }
        case 'put': {
          const res = await httpAdapter.put(path, api.body, {})
          return res.body
        }
        case 'patch': {
          const res = await httpAdapter.patch(path, api.body, {})
          return res.body
        }
        case 'delete': {
          // Forward `api.params` as a query string too (not just `api.body`).
          // core-v3 delete builders can carry their args as params (e.g.
          // `Api.deleteMessages`/`Api.clearRooms` put arrays in `useParams`);
          // dropping them here would fire a DELETE with no args. NOTE: v2's
          // own `deleteComment`/`clearRoomMessages` deliberately stay on the
          // legacy `userAdapter` (they send a JSON body, and their flags/wire
          // aren't safely reproducible via these query-param builders — see
          // docs/migrations.md, Fable review) — this branch is defensive
          // correctness for any core-v3 delete that IS routed through the shim.
          const res = await httpAdapter.del(path + queryString(api.params), api.body, {})
          return res.body
        }
        default:
          throw new Error(`makeV2Requester: unsupported method "${api.method}"`)
      }
    },
  }
}
