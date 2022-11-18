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
    this._expiredAt = expiredAt == null ? null : new Date(expiredAt)
    this._userId = userId
    this._onTokenRefreshed = onTokenRefreshed
    this._getAuthenticationStatus = getAuthenticationStatus;

    this._isExpiredTokenEnabled = this._refreshToken != null && this._expiredAt != null;

    // this._timerId = setInterval(this._checkToken, 1000)
    this._checkToken()
  }


  async _checkToken() {
    const timeToSleep = 5000 // 5 seconds

    if (this._getAuthenticationStatus() == false) {
      // console.log('not authenticated, break out of recursion')
      return;
    }

    if (this._expiredAt != null && this._isExpiredTokenEnabled) {
      let now = Date.now();

      // @ts-ignore
      let diff = Math.floor((this._expiredAt - now) / 1000)
      // console.log('diff', diff)
      if (diff < (timeToSleep / 1000)) {
        // console.log('diff is less than time to sleep', diff)
        // console.log('do refresh auth token!')
        await this.refreshAuthToken()
      }
    }

    await sleep(timeToSleep)
    this._checkToken()
  }

  async refreshAuthToken() {
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

      return res;
    })
  }

}
