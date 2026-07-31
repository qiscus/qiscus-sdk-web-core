// @ts-check

import { getTokenRefreshScheduler } from '@qiscus/core-v3'

/**
 * Expired-token auto-refresh scheduler lift (docs/v2-full-shell-plan.md
 * "NEXT ITEM — Expired-token auto-refresh scheduler"): v2 used to own the
 * `setTimeout`-at-`token_expires_at` timer + `refresh_token` rotation +
 * `onTokenRefreshed` callback + auth-status guard directly. That mechanism
 * now lives ONCE in core-v3's `getTokenRefreshScheduler` (so version-3 can
 * later opt in); this class is a thin delegator that keeps v2's exact
 * public surface (constructor shape, `refreshAuthToken()`, `logout()`) so
 * `index.js` needs ZERO changes.
 *
 * `_refreshToken` is exposed as a getter (rather than a plain field) purely
 * because `compat/auth-transport.test.js` reads it directly — it delegates
 * to the scheduler's live `refreshToken` getter.
 *
 * See `compat/expired-token.test.js` for the delegation contract.
 */
export class ExpiredTokenAdapter {
  /** @type {ReturnType<typeof getTokenRefreshScheduler>} */
  _scheduler

  /**
   * @constructor
   *
   * @param {{
   *  getUserAdapter: () => import('@qiscus/core-v3').QiscusDeps['userAdapter'],
   *  getStorage: () => import('@qiscus/core-v3').QiscusDeps['storage'],
   *  userId: string,
   *  refreshToken: string | null,
   *  expiredAt: string | null,
   *  onTokenRefreshed: (token: string, refreshToken: string, expiredAt: Date, oldToken: string) => void
   *  getAuthenticationStatus: () => boolean,
   * }} param
   */
  constructor({
    getUserAdapter,
    getStorage,
    refreshToken,
    expiredAt,
    userId,
    onTokenRefreshed,
    getAuthenticationStatus,
  }) {
    this._scheduler = getTokenRefreshScheduler({
      getUserAdapter,
      getStorage,
      userId,
      refreshToken,
      expiredAt,
      onTokenRefreshed,
      getAuthenticationStatus,
    })
  }

  /** @type {string | null} kept for `compat/auth-transport.test.js` parity */
  get _refreshToken() {
    return this._scheduler.refreshToken
  }

  async refreshAuthToken() {
    return this._scheduler.refreshAuthToken()
  }

  async logout() {
    return this._scheduler.logout()
  }
}
