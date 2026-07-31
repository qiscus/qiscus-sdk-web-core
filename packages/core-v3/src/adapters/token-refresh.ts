/**
 * Expired-token auto-refresh scheduler (docs/v2-full-shell-plan.md "NEXT ITEM
 * — Expired-token auto-refresh scheduler"). This is a MECHANICAL LIFT of v2's
 * `lib/adapters/expired-token.js` `ExpiredTokenAdapter` timer + lifecycle
 * into core-v3, so the logic lives once. The refresh/logout HTTP already
 * lives in core-v3 (`Api.refreshToken`/`Api.logout`, P5 pass 3) — what moved
 * here is the `setTimeout`-at-`token_expires_at` scheduling, the
 * `refresh_token` rotation, the `onTokenRefreshed` callback, and the
 * auth-status guard.
 *
 * v2's `ExpiredTokenAdapter` (packages/version-2/src/lib/adapters/expired-token.js)
 * is now a thin delegator over this module — its public surface (constructor
 * shape, `refreshAuthToken()`, `logout()`) is UNCHANGED, so `index.js` needs
 * no changes.
 *
 * version-3 now opts into the same scheduler via `startTokenRefresh`/
 * `stopTokenRefresh` below (wired from `usecases/user.ts`), using the SAME
 * enablement rule as v2: it starts iff-and-only-if the login response
 * provided BOTH `refresh_token` and `token_expires_at` — no config-flag gate.
 *
 * Every branch below reproduces v2's CODE (not its stale JSDoc) byte-for-byte
 * — see the inline notes at the two spots where the code and the old v2
 * comments disagreed.
 */

import { QiscusDeps } from '../usecases/types'

export type TokenRefreshUserAdapter = {
  refreshToken(userId: string, refreshToken: string): Promise<any>
  logout(userId: string, token: string): Promise<any>
}

export type TokenRefreshStorage = {
  getToken(): string
  setToken(token: string): void
}

export type TokenRefreshScheduler = ReturnType<typeof getTokenRefreshScheduler>

export default function getTokenRefreshScheduler(o: {
  getUserAdapter: () => TokenRefreshUserAdapter
  getStorage: () => TokenRefreshStorage
  userId: string
  refreshToken: string | null
  expiredAt: string | null
  onTokenRefreshed?: (token: string, refreshToken: string, expiredAt: Date | null, oldToken: string) => void
  // Additive, v3-only hook: fired with the NEW `_expiredAt` right after the
  // timer is (re)armed, so a caller can persist the refreshed expiry. v2
  // never passes this, so v2's behavior is unaffected.
  onExpiryUpdated?: (expiredAt: Date | null) => void
  getAuthenticationStatus: () => boolean
}) {
  let _refreshToken: string | null = o.refreshToken
  let _expiredAt: Date | null = null
  let _timerId: ReturnType<typeof setTimeout> | null = null

  if (_refreshToken != null && _refreshToken === '') {
    _refreshToken = null
  }
  if (o.expiredAt != null && o.expiredAt !== '') {
    _expiredAt = new Date(o.expiredAt)
  }
  const isEnabled = _refreshToken != null && _expiredAt != null

  /**
   * Sets a timer to refresh the authentication token when it expires.
   *
   * NOTE: the original v2 JSDoc for this method claimed that "if the token
   * is already expired, it will immediately trigger the refresh" — that is
   * NOT what the code does and never was; preserved here verbatim (delay<=0
   * simply arms no timer, so an already-expired token does NOT auto-refresh
   * until something else calls `refreshAuthToken()`).
   */
  function _setTimer(expiredAt: Date | null): void {
    if (_timerId != null) {
      clearTimeout(_timerId)
      _timerId = null
    }

    const delay = Math.floor((expiredAt?.getTime() ?? NaN) - Date.now())
    if (!isNaN(delay) && delay > 0) {
      _timerId = setTimeout(() => {
        refreshAuthToken()
      }, delay)
    }
  }

  async function refreshAuthToken(): Promise<any> {
    if (o.getAuthenticationStatus() == false || _refreshToken == null) {
      return
    }

    return o
      .getUserAdapter()
      .refreshToken(o.userId, _refreshToken)
      .then((body: any) => {
        const res = body.results
        const token = res.token
        // Read BEFORE the new token is stored below — `onTokenRefreshed`
        // needs the token that was active up to this point (e.g. to
        // unsubscribe the old MQTT user channel).
        const oldToken = o.getStorage().getToken()

        _refreshToken = res.refresh_token

        // PRESERVED ON PURPOSE: this callback fires with the OLD `_expiredAt`
        // (not the new `res.token_expires_at`) — `_expiredAt` is only
        // reassigned in step 6 below, AFTER this call. This is a v2 quirk
        // (the v2 shell writes this stale value into
        // `userData.token_expires_at`) and must be preserved byte-for-byte.
        o.onTokenRefreshed?.(token, _refreshToken as string, _expiredAt, oldToken)

        o.getStorage().setToken(res.token)

        if (res.token_expires_at != null) {
          _expiredAt = new Date(res.token_expires_at)
        }

        _setTimer(_expiredAt)
        o.onExpiryUpdated?.(_expiredAt)

        return res
      })
  }

  function logout(): Promise<any> {
    return o.getUserAdapter().logout(o.userId, o.getStorage().getToken())
  }

  function dispose(): void {
    if (_timerId != null) {
      clearTimeout(_timerId)
      _timerId = null
    }
  }

  _setTimer(_expiredAt)

  return {
    refreshAuthToken,
    logout,
    dispose,
    get isEnabled(): boolean {
      return isEnabled
    },
    get expiredAt(): Date | null {
      return _expiredAt
    },
    get refreshToken(): string | null {
      return _refreshToken
    },
  }
}

/**
 * version-3 entry points that wire `getTokenRefreshScheduler` into core-v3's
 * own storage/user-adapter/realtime-adapter, following the SAME enablement
 * rule as v2: the scheduler only starts when the login response provided
 * BOTH `refresh_token` and `token_expires_at` (captured by
 * `v3/decoder.ts#account` and persisted by `adapters/user.ts`). There is no
 * config-flag gate — the backend only sends those fields when the feature is
 * provisioned for that app.
 */
const _instances = new WeakMap<object, TokenRefreshScheduler>()

export function startTokenRefresh(deps: QiscusDeps): TokenRefreshScheduler | null {
  const refreshToken = deps.storage.getRefreshToken()
  const expiresAt = deps.storage.getTokenExpiresAt()
  const userId = deps.storage.getCurrentUser()?.id

  if (refreshToken == null || refreshToken === '') return null
  if (expiresAt == null || expiresAt === '') return null
  if (userId == null || userId === '') return null

  // Dispose any scheduler already running for this storage instance before
  // starting a new one (e.g. re-login without an intervening clearUser).
  stopTokenRefresh(deps)

  const scheduler = getTokenRefreshScheduler({
    getUserAdapter: () => deps.userAdapter,
    getStorage: () => deps.storage,
    userId,
    refreshToken,
    expiredAt: expiresAt,
    getAuthenticationStatus: () => deps.storage.getCurrentUser() != null,
    onTokenRefreshed: (token, newRefreshToken, _oldExpiredAt, oldToken) => {
      deps.storage.setRefreshToken(newRefreshToken)

      // Re-subscribe the token-keyed MQTT user channel after a token
      // rotation — the old channel is keyed by the old token, so without
      // this, realtime silently dies post-refresh. `deps.realtimeAdapter`
      // is absent from v2's deps bundle, so this must never throw if it's
      // missing.
      const mqtt = deps.realtimeAdapter?.mqtt
      if (mqtt != null && oldToken != null) {
        ;['c', 'n', 'update'].forEach((suffix) => mqtt.unsubscribe(`${oldToken}/${suffix}`))
        mqtt.subscribeUser(token)
      }
    },
    onExpiryUpdated: (expiredAt) => {
      deps.storage.setTokenExpiresAt(expiredAt != null ? expiredAt.toISOString() : null)
    },
  })

  _instances.set(deps.storage, scheduler)

  return scheduler
}

export function stopTokenRefresh(deps: QiscusDeps): void {
  const existing = _instances.get(deps.storage)
  if (existing != null) {
    existing.dispose()
    _instances.delete(deps.storage)
  }
}
