import request from 'superagent'

export default class HttpAdapter {
  constructor (baseURL, AppId, userId) {
    this.baseURL = baseURL
    this.token = null
    this.userId = userId
    this.AppId = AppId
  }

  setToken (token) {
    this.token = token
  }

  get (path, headers = {}, options) {
    return new Promise((resolve, reject) => {
      var req = request.get(`${this.baseURL}/${path}`)
      if (options && options.baseURL) req = request.get(`${options.baseURL}/${path}`)
      req = this.setupHeaders(req, headers)
      req.end((err, res) => {
        if (err) return reject(err)
        return resolve(res)
      })
    })
  }

  post (path, body = {}, headers = {}) {
    return new Promise((resolve, reject) => {
      let req = request.post(`${this.baseURL}/${path}`)
      req = this.setupHeaders(req, headers)
      req.send(body).set('Content-Type', 'application/x-www-form-urlencoded')
      .end((err, res) => {
        if (err) return reject(err)
        return resolve(res)
      })
    })
  }

  post_json (path, body = {}, headers = {}) {
    return new Promise((resolve, reject) => {
      let req = request.post(`${this.baseURL}/${path}`)
      req = this.setupHeaders(req, headers)
      req.send(body).set('Content-Type', 'application/json')
      .end((err, res) => {
        if (err) return reject(err)
        return resolve(res)
      })
    })
  }

  put (path, body = {}, headers = {}) {
    return new Promise((resolve, reject) => {
      let req = request.put(`${this.baseURL}/${path}`)
      req = this.setupHeaders(req, headers)
      req.send(body).set('Content-Type', 'application/x-www-form-urlencoded')
      .end((err, res) => {
        if (err) return reject(err)
        return resolve(res)
      })
    })
  }

  del (path, body = {}, headers = {}) {
    return new Promise((resolve, reject) => {
      let req = request.del(`${this.baseURL}/${path}`)
      req = this.setupHeaders(req, headers)
      req.send(body).set('Content-Type', 'application/json')
      .end((err, res) => {
        if (err) return reject(err)
        return resolve(res)
      })
    })
  }

  setupHeaders (req, headers) {
    // let's give this default Authorization Header
    req.set('QISCUS_SDK_APP_ID', `${this.AppId}`);
    req.set('QISCUS_SDK_USER_ID', `${this.userId}`);
    req.set('QISCUS_SDK_TOKEN', `${this.token}`);
    // Return the req if no headers attached
    if (Object.keys(headers).length < 1) return req
    // now let's process custom header
    for (let key in headers) {
      req.set(key, headers[key])
    }
    return req
  }
}
