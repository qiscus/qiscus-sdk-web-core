export default class AuthAdapter {
  /**
   * Params used in this class
   * @method constructor
   * @param  {Object}    HTTPAdapter [Qiscus HTTP adapter]
   * @return {void}                Returns nothing
   */
  constructor (HTTPAdapter) {
    this.HTTPAdapter = HTTPAdapter
  }

  getNonce () {
    return this.HTTPAdapter.post('api/v2/sdk/auth/nonce').then(res => res.body.results)
  }

  loginOrRegister (params) {
    return this.HTTPAdapter.post('api/v2/sdk/login_or_register', params).then(resp => {
      if (resp.body.status !== 200) return Promise.reject(resp)
      return resp.body.results
    })
  }

  verifyIdentityToken (token) {
    return this.HTTPAdapter.post('api/v2/sdk/auth/verify_identity_token', {
      identity_token: token
    }).then(resp => resp.body.results)
  }
}
