import { makeApiRequest } from '@qiscus/core-v3'

/**
 * compat/axios-requester.js — full-shell plan P1b (docs/v2-full-shell-plan.md).
 *
 * An `ApiRequester` (`{ request(api): Promise<respBody> }`) backed by core-v3's
 * SHARED axios transport (`makeApiRequest`) instead of v2's superagent
 * `HttpAdapter`. It reproduces the v2 transport contract pinned by
 * `http-adapter.characterization.test.js` so it is a drop-in replacement:
 *  - resolves the parsed response BODY (core-v3 `request` returns `resp.data`);
 *  - adds the `QISCUS-SDK-PLATFORM` header v2 sends but core-v3 does not (the
 *    `qiscus-sdk-app-id`/`version`/`token`/`user-id` header VALUES already come
 *    from the Api descriptor via `withCredentials`/`withHeaders`);
 *  - on a 403 "token is expired" it calls `refreshToken()` and retries once;
 *  - on any HTTP error it throws a SUPERAGENT-shaped error
 *    (`err.status` + `err.response.{status, body}`) so v2 consumers'
 *    `.catch(e => e.response.body)` / `e.status` keep working (axios natively
 *    exposes `err.response.data`/`.status` and a different message — the message
 *    is allowed to differ; parity is on status + body).
 *
 * This module is the P1b artifact; wiring it into `makeDeps` in place of
 * `makeV2Requester` (and deleting `HttpAdapter`) is P1c.
 *
 * @param {import('@qiscus/core-v3').Storage} storage
 * @param {{ refreshToken?: () => Promise<unknown> }} [opts]
 */
export function makeV2AxiosRequester(storage, { refreshToken } = {}) {
  const coreRequest = makeApiRequest(storage).request

  const isExpiredToken = (status, body) =>
    status === 403 &&
    body != null &&
    body.error != null &&
    typeof body.error.message === 'string' &&
    body.error.message.toLowerCase() === 'unauthorized. token is expired'

  const call = async (api, isRetry) => {
    const withPlatform = {
      ...api,
      headers: { 'QISCUS-SDK-PLATFORM': 'javascript', ...(api.headers || {}) },
    }
    try {
      return await coreRequest(withPlatform)
    } catch (axiosErr) {
      const status = axiosErr && axiosErr.response ? axiosErr.response.status : undefined
      const body = axiosErr && axiosErr.response ? axiosErr.response.data : undefined

      if (!isRetry && isExpiredToken(status, body) && typeof refreshToken === 'function') {
        await refreshToken()
        return call(api, true)
      }

      // Re-shape axios error into superagent's contract (err.status +
      // err.response.{status, body}). Message is allowed to differ.
      const err = new Error(axiosErr && axiosErr.message ? axiosErr.message : 'request failed')
      err.status = status
      err.response = { status, body }
      throw err
    }
  }

  return { request: (api) => call(api, false) }
}
