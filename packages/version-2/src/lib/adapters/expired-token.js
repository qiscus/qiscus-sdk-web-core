// @ts-check

import { sleep } from '../util'

export class ExpiredTokenAdapter {
  /** @type {boolean} */
  _isExpiredTokenEnabled = false

  /** @type {string | null} */
  _refreshToken = null

  /** @type {Date | null} */
  _expiredAt = null

  /** @type {() => import('@qiscus/core-v3').QiscusDeps['userAdapter']} */
  _getUserAdapter

  /** @type {() => import('@qiscus/core-v3').QiscusDeps['storage']} */
  _getStorage

  /** @type {(token: string, refreshToken: string, expiredAt: Date, oldToken: string) => void | undefined} */
  _onTokenRefreshed

  /** @type {any} */
  _timerId

  /** @type {() => boolean} */
  _getAuthenticationStatus

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
    this._getUserAdapter = getUserAdapter
    this._getStorage = getStorage
    this._refreshToken = refreshToken
    // this._expiredAt = expiredAt == null ? null : new Date(expiredAt)
    this._userId = userId
    this._onTokenRefreshed = onTokenRefreshed
    this._getAuthenticationStatus = getAuthenticationStatus

    if (this._refreshToken != null && this._refreshToken === '') {
      this._refreshToken = null
    }
    if (expiredAt != null && expiredAt !== '') {
      this._expiredAt = new Date(expiredAt)
    }
    this._isExpiredTokenEnabled =
      this._refreshToken != null && this._expiredAt != null
    this._setTimer(this._expiredAt)
  }

  /**
   * @param {Date | null} expiredAt
   *
   * Sets a timer to refresh the authentication token when it expires.
   * If the token is already expired, it will immediately trigger the refresh.
   */
  _setTimer(expiredAt) {
    if (this._timerId != null) {
      clearTimeout(this._timerId)
      this._timerId = null
    }

    const delay = Math.floor((expiredAt?.getTime() ?? NaN) - Date.now())
    if (!isNaN(delay) && delay > 0) {
      this._timerId = setTimeout(() => {
        this.refreshAuthToken()
      }, delay)
    }
  }

  async refreshAuthToken() {
    if (
      this._getAuthenticationStatus() == false ||
      this._refreshToken == null
    ) {
      return
    }

    return this._getUserAdapter()
      .refreshToken(this._userId, this._refreshToken)
      .then((body) => {
        let res = body.results
        let token = res.token
        let oldToken = this._getStorage().getToken()

        this._refreshToken = res.refresh_token
        this._onTokenRefreshed?.(token, this._refreshToken, this._expiredAt, oldToken)
        this._getStorage().setToken(res.token)

        if (res.token_expires_at != null) {
          this._expiredAt = new Date(res.token_expires_at)
        }

        this._setTimer(this._expiredAt)

        return res
      })
  }

  async logout() {
    return this._getUserAdapter().logout(this._userId, this._getStorage().getToken())
  }
}
