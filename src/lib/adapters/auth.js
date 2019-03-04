export default class AuthAdapter {
  /**
  * Params used in this class
  * @method constructor
  * @param  {Object}    HTTPAdapter [Qiscus HTTP adapter]
  * @return {void}                Returns nothing
  */
  constructor (HTTPAdapter) {
    this.HTTPAdapter = HTTPAdapter
    this.token = HTTPAdapter.token
  }

  getNonce () {
    return this.HTTPAdapter.post('api/v2/sdk/auth/nonce')
    .then((response) => {
      return Promise.resolve(response.body.results)
    }, (error) => {
      return Promise.reject(error)
    })
  }

  loginOrRegister (params) {
    return this.HTTPAdapter.post('api/v2/sdk/login_or_register', params)
    .then((response) => {
      return new Promise((resolve, reject) => {
        if (response.body.status !== 200) return reject(response)
        return resolve(response.body.results)
      })
    }, (error) => {
      return Promise.reject(error)
    })
  }

  verifyIdentityToken (token) {
    return this.HTTPAdapter.post('api/v2/sdk/auth/verify_identity_token', { identity_token: token })
    .then((response) => {
      return Promise.resolve(response.body.results)
    }, (error) => {
      return Promise.reject(error)
    })
  }
}
