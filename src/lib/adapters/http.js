import request from "superagent";

export default class HttpAdapter {
  constructor({ baseURL, AppId, userId, version, getCustomHeader }) {
    this.baseURL = baseURL;
    this.token = null;
    this.userId = userId;
    this.AppId = AppId;
    this.version = version;
    this.getCustomHeader = getCustomHeader;
  }

  setToken(token) {
    this.token = token;
  }

  get(path, headers = {}, options) {
    return new Promise((resolve, reject) => {
      var req = request.get(`${this.baseURL}/${path}`);
      if (options && options.baseURL)
        req = request.get(`${options.baseURL}/${path}`);
      req = this.setupHeaders(req, headers);
      req.end((err, res) => {
        if (err) return reject(err);
        return resolve(res);
      });
    });
  }
  // eslint-disable-next-line
  get_request(path) {
    let req = request.get(`${this.baseURL}/${path}`);
    req = this.setupHeaders(req, {});
    return req;
  }

  post(path, body = {}, headers = {}) {
    return new Promise((resolve, reject) => {
      let req = request.post(`${this.baseURL}/${path}`);
      req = this.setupHeaders(req, headers);
      req
        .send(body)
        .set("Content-Type", "application/x-www-form-urlencoded")
        .end((err, res) => {
          if (err) return reject(err);
          return resolve(res);
        });
    });
  }

  // eslint-disable-next-line
  post_json(path, body = {}, headers = {}) {
    return new Promise((resolve, reject) => {
      let req = request.post(`${this.baseURL}/${path}`);
      req = this.setupHeaders(req, headers);
      req
        .send(body)
        .set("Content-Type", "application/json")
        .end((err, res) => {
          if (err) return reject(err);
          return resolve(res);
        });
    });
  }

  put(path, body = {}, headers = {}) {
    return new Promise((resolve, reject) => {
      let req = request.put(`${this.baseURL}/${path}`);
      req = this.setupHeaders(req, headers);
      req
        .send(body)
        .set("Content-Type", "application/x-www-form-urlencoded")
        .end((err, res) => {
          if (err) return reject(err);
          return resolve(res);
        });
    });
  }

  patch(path, body = {}, headers = {}) {
    return new Promise((resolve, reject) => {
      let req = request.patch(`${this.baseURL}/${path}`);
      req = this.setupHeaders(req, headers);
      req
        .send(body)
        .set("Content-Type", "application/x-www-form-urlencoded")
        .end((err, res) => {
          if (err) return reject(err);
          return resolve(res);
        });
    });
  }

  del(path, body = {}, headers = {}) {
    return new Promise((resolve, reject) => {
      let req = request.del(`${this.baseURL}/${path}`);
      req = this.setupHeaders(req, headers);
      req
        .send(body)
        .set("Content-Type", "application/json")
        .end((err, res) => {
          if (err) return reject(err);
          return resolve(res);
        });
    });
  }

  setupHeaders(req, headers) {
    // let's give this default Authorization Header
    req.set("QISCUS-SDK-APP-ID", `${this.AppId}`);
    req.set("QISCUS-SDK-USER-ID", `${this.userId}`);
    req.set("QISCUS-SDK-TOKEN", `${this.token}`);
    req.set("QISCUS-SDK-VERSION", `${this.version}`);

    if (this.getCustomHeader != null) {
      const customHeaders = this.getCustomHeader();
      Object.keys(customHeaders).forEach((key) => {
        req.set(key, customHeaders[key]);
      });
    }
    // Return the req if no headers attached
    if (Object.keys(headers).length < 1) return req;
    // now let's process custom header
    for (let key in headers) {
      if (headers.hasOwnProperty(key)) req.set(key, headers[key]);
    }
    return req;
  }
}
