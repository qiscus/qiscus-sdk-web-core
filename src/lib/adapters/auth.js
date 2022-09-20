export default class AuthAdapter {
  /**
   * Params used in this class
   * @method constructor
   * @param  {Object}    HTTPAdapter [Qiscus HTTP adapter]
   * @return {void}                Returns nothing
   */
  constructor(HTTPAdapter) {
    this.HTTPAdapter = HTTPAdapter
    this.refreshToken = null
    this.userId = null
  }

  getNonce() {
    return this.HTTPAdapter.post('api/v2/sdk/auth/nonce').then(res => res.body.results)
  }

  loginOrRegister(params) {
    return this.HTTPAdapter.post('api/v2/sdk/login_or_register', params).then(resp => {
      if (resp.body.status !== 200) return Promise.reject(resp)
      let result = resp.body.results;

      this.userId = result.user.email
      this.refreshToken = result.user.refresh_token
      return result
    })
  }

  verifyIdentityToken(token) {
    return this.HTTPAdapter.post('api/v2/sdk/auth/verify_identity_token', {
      identity_token: token
    }).then(resp => {
      let result = resp.body.results
      this.userId = result.user.email
      this.refreshToken = result.user.refresh_token

      return result
    })
  }

  refreshAuthToken() {
    return this.HTTPAdapter.post('api/v2/sdk/refresh_user_token', {
      user_id: this.userId,
      refresh_token: this.refreshToken,
    }).then((r) => {
      let res = r.body.results;

      this.refreshToken = res.refresh_token;
      this.HTTPAdapter.token = res.token;

      return res;
    })
  }

  expiredAuthToken() {
    return this.HTTPAdapter.post(`api/v2/sdk/expire_user_token`, {
      user_id: this.userId,
    }).then(r => r.body.results)
  }
}
