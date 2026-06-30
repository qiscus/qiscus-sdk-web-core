import request from 'superagent'

export default class HttpAdapter {
  constructor({
    baseURL,
    AppId,
    userId,
    version,
    getCustomHeader,
    expiredTokenAdapterGetter,
  }) {
    this.baseURL = baseURL
    this.token = null
    this.userId = userId
    this.AppId = AppId
    this.version = version
    this.getCustomHeader = getCustomHeader
    /** @type {() => import('./expired-token.js').ExpiredTokenAdapter} */
    this._expiredTokenAdapterGetter = expiredTokenAdapterGetter
  }

  setToken(token) {
    this.token = token
  }

  get(path, headers = {}, options) {
    return this._retryHelper(async () => {
      var req = request.get(`${this.baseURL}/${path}`)
      if (options && options.baseURL)
        req = request.get(`${options.baseURL}/${path}`)
      req = this.setupHeaders(req, headers)
      return req
    })
  }
  // eslint-disable-next-line
  get_request(path) {
    return this._retryHelper(async () => {
      let req = request.get(`${this.baseURL}/${path}`)
      req = this.setupHeaders(req, {})
      return req
    })
  }

  post(path, body = {}, headers = {}) {
    return this._retryHelper(async () => {
      let req = request.post(`${this.baseURL}/${path}`)
      req = this.setupHeaders(req, headers)
      return req
        .send(body)
        .set('Content-Type', 'application/x-www-form-urlencoded')
    })
  }

  // eslint-disable-next-line
  post_json(path, body = {}, headers = {}) {
    return this._retryHelper(async () => {
      let req = request.post(`${this.baseURL}/${path}`)
      req = this.setupHeaders(req, headers)
      req.send(body)
      return req
    })
  }

  put(path, body = {}, headers = {}) {
    return this._retryHelper(async () => {
      let req = request.put(`${this.baseURL}/${path}`)
      req = this.setupHeaders(req, headers)
      return req
        .send(body)
        .set('Content-Type', 'application/x-www-form-urlencoded')
    })
  }

  patch(path, body = {}, headers = {}) {
    return this._retryHelper(async () => {
      let req = request.patch(`${this.baseURL}/${path}`)
      req = this.setupHeaders(req, headers)
      return req
        .send(body)
        .set('Content-Type', 'application/x-www-form-urlencoded')
    })
  }

  del(path, body = {}, headers = {}) {
    return this._retryHelper(async () => {
      let req = request.del(`${this.baseURL}/${path}`)
      req = this.setupHeaders(req, headers)
      return req.send(body).set('Content-Type', 'application/json')
    })
  }

  setupHeaders(req, headers = {}) {
    req.set('QISCUS-SDK-PLATFORM', 'javascript')
    // let's give this default Authorization Header
    if (this.AppId != null) {
      req.set('QISCUS-SDK-APP-ID', `${this.AppId}`)
    }
    if (this.userId != null) {
      req.set('QISCUS-SDK-USER-ID', `${this.userId}`)
    }
    if (this.token != null) {
      req.set('QISCUS-SDK-TOKEN', `${this.token}`)
    }
    if (this.version != null) {
      req.set('QISCUS-SDK-VERSION', `${this.version}`)
    }

    if (this.getCustomHeader != null) {
      const customHeaders = this.getCustomHeader()
      Object.keys(customHeaders)
        .filter((key) => customHeaders[key] != null)
        .forEach((key) => {
          req.set(key, customHeaders[key])
        })
    }
    // Return the req if no headers attached
    if (Object.keys(headers).length < 1) return req
    // now let's process custom header
    for (let key in headers) {
      if (headers.hasOwnProperty(key)) req.set(key, headers[key])
    }
    return req
  }

  /**
   * @param {() => request.Request} fn
   * @returns {Promise<unknown>}
   */
  async _retryHelper(fn) {
    try {
      return await fn()
    } catch (err) {
      const status = err?.response?.status
      const body = err?.response?.body

      if (
        status === 403 &&
        body.error?.message?.toLowerCase() === 'unauthorized. token is expired'
      ) {
        await this._expiredTokenAdapterGetter().refreshAuthToken()
        return await fn()
      } else {
        throw err
      }
    }
  }
}
