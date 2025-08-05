// @ts-check

import { sleep } from '../util';

export class ExpiredTokenAdapter {
  /** @type {boolean} */
  _isExpiredTokenEnabled = false;

  /** @type {string | null} */
  _refreshToken = null;

  /** @type {Date | null} */
  _expiredAt = null

  /** @type {import('./http').default} */
  _http

  /** @type {(token: string, refreshToken: string, expiredAt: Date) => void | undefined} */
  _onTokenRefreshed

  /** @type {any} */
  _timerId

  /** @type {() => boolean} */
  _getAuthenticationStatus

  /**
   * @constructor
   *
   * @param {{
   *  httpAdapter: import('./http').default,
   *  userId: string,
   *  refreshToken: string | null,
   *  expiredAt: string | null,
   *  onTokenRefreshed: (token: string, refreshToken: string, expiredAt: Date) => void
   *  getAuthenticationStatus: () => boolean,
   * }} param
   */
  constructor({
    httpAdapter, refreshToken, expiredAt, userId,
    onTokenRefreshed,
    getAuthenticationStatus,
  }) {
    this._http = httpAdapter;
    this._refreshToken = refreshToken
    // this._expiredAt = expiredAt == null ? null : new Date(expiredAt)
    this._userId = userId
    this._onTokenRefreshed = onTokenRefreshed
    this._getAuthenticationStatus = getAuthenticationStatus;

    if (this._refreshToken != null && this._refreshToken === '') {
      this._refreshToken = null
    }
    if (expiredAt != null && expiredAt !== '') {
      this._expiredAt = new Date(expiredAt)
    }
    this._isExpiredTokenEnabled = this._refreshToken != null && this._expiredAt != null;
    this._setTimer(this._expiredAt);
  }

  /**
   * @param {Date | null} expiredAt
   *
   * Sets a timer to refresh the authentication token when it expires.
   * If the token is already expired, it will immediately trigger the refresh.
   */
  _setTimer(expiredAt) {
    if (this._timerId != null) {
      clearTimeout(this._timerId);
      this._timerId = null;
    }

    const delay = Math.floor((expiredAt?.getTime() ?? NaN) - Date.now());
    if (!isNaN(delay) && delay > 0) {
      this._timerId = setTimeout(() => {
        this.refreshAuthToken();
      }, delay);

    }
  }

  async refreshAuthToken() {
    if (this._getAuthenticationStatus() == false || this._refreshToken == null) {
      return;
    }

    return this._http.post('api/v2/sdk/refresh_user_token', {
      user_id: this._userId,
      refresh_token: this._refreshToken,
    }).then((r) => {
      let res = r.body.results;
      let token = res.token;

      this._refreshToken = res.refresh_token;
      this._http.setToken(res.token)

      if (res.token_expires_at != null) {
        this._expiredAt = new Date(res.token_expires_at);
      }

      // @ts-ignore
      this._onTokenRefreshed?.(token, this._refreshToken, this._expiredAt)
      this._setTimer(this._expiredAt);

      return res;
    })
  }

  async logout() {
    return this._http.post('api/v2/sdk/logout', {
      user_id: this._userId,
      token: this._http.token,
    })
  }

}
