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
  const keys = Object.keys(params).filter((key) => params[key] != null)
  if (keys.length === 0) return ''
  const qs = keys
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&')
  return `?${qs}`
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
          const res = await httpAdapter.del(path, api.body, {})
          return res.body
        }
        default:
          throw new Error(`makeV2Requester: unsupported method "${api.method}"`)
      }
    },
  }
}
