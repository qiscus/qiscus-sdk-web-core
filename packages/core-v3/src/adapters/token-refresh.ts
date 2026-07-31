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
 * no changes. version-3 does NOT opt into this yet: core-v3 has no
 * `refreshToken`/`tokenExpiresAt` storage fields and v3's decoder doesn't
 * capture `refresh_token`/`token_expires_at` at login — wiring v3 to use this
 * scheduler is a separate follow-up (see the plan doc).
 *
 * Every branch below reproduces v2's CODE (not its stale JSDoc) byte-for-byte
 * — see the inline notes at the two spots where the code and the old v2
 * comments disagreed.
 */

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
