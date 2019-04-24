"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;

var _classCallCheck2 = _interopRequireDefault(require("@babel/runtime/helpers/classCallCheck"));

var _createClass2 = _interopRequireDefault(require("@babel/runtime/helpers/createClass"));

var _superagent = _interopRequireDefault(require("superagent"));

var HttpAdapter =
/*#__PURE__*/
function () {
  function HttpAdapter(_ref) {
    var baseURL = _ref.baseURL,
        AppId = _ref.AppId,
        userId = _ref.userId,
        version = _ref.version;
    (0, _classCallCheck2["default"])(this, HttpAdapter);
    this.baseURL = baseURL;
    this.token = null;
    this.userId = userId;
    this.AppId = AppId;
    this.version = version;
  }

  (0, _createClass2["default"])(HttpAdapter, [{
    key: "setToken",
    value: function setToken(token) {
      this.token = token;
    }
  }, {
    key: "get",
    value: function get(path) {
      var _this = this;

      var headers = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      var options = arguments.length > 2 ? arguments[2] : undefined;
      return new Promise(function (resolve, reject) {
        var req = _superagent["default"].get("".concat(_this.baseURL, "/").concat(path));

        if (options && options.baseURL) req = _superagent["default"].get("".concat(options.baseURL, "/").concat(path));
        req = _this.setupHeaders(req, headers);
        req.end(function (err, res) {
          if (err) return reject(err);
          return resolve(res);
        });
      });
    } // eslint-disable-next-line

  }, {
    key: "get_request",
    value: function get_request(path) {
      var req = _superagent["default"].get("".concat(this.baseURL, "/").concat(path));

      req = this.setupHeaders(req, {});
      return req;
    }
  }, {
    key: "post",
    value: function post(path) {
      var _this2 = this;

      var body = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      var headers = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
      return new Promise(function (resolve, reject) {
        var req = _superagent["default"].post("".concat(_this2.baseURL, "/").concat(path));

        req = _this2.setupHeaders(req, headers);
        req.send(body).set('Content-Type', 'application/x-www-form-urlencoded').end(function (err, res) {
          if (err) return reject(err);
          return resolve(res);
        });
      });
    } // eslint-disable-next-line

  }, {
    key: "post_json",
    value: function post_json(path) {
      var _this3 = this;

      var body = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      var headers = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
      return new Promise(function (resolve, reject) {
        var req = _superagent["default"].post("".concat(_this3.baseURL, "/").concat(path));

        req = _this3.setupHeaders(req, headers);
        req.send(body).set('Content-Type', 'application/json').end(function (err, res) {
          if (err) return reject(err);
          return resolve(res);
        });
      });
    }
  }, {
    key: "put",
    value: function put(path) {
      var _this4 = this;

      var body = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      var headers = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
      return new Promise(function (resolve, reject) {
        var req = _superagent["default"].put("".concat(_this4.baseURL, "/").concat(path));

        req = _this4.setupHeaders(req, headers);
        req.send(body).set('Content-Type', 'application/x-www-form-urlencoded').end(function (err, res) {
          if (err) return reject(err);
          return resolve(res);
        });
      });
    }
  }, {
    key: "patch",
    value: function patch(path) {
      var _this5 = this;

      var body = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      var headers = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
      return new Promise(function (resolve, reject) {
        var req = _superagent["default"].patch("".concat(_this5.baseURL, "/").concat(path));

        req = _this5.setupHeaders(req, headers);
        req.send(body).set('Content-Type', 'application/x-www-form-urlencoded').end(function (err, res) {
          if (err) return reject(err);
          return resolve(res);
        });
      });
    }
  }, {
    key: "del",
    value: function del(path) {
      var _this6 = this;

      var body = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      var headers = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
      return new Promise(function (resolve, reject) {
        var req = _superagent["default"].del("".concat(_this6.baseURL, "/").concat(path));

        req = _this6.setupHeaders(req, headers);
        req.send(body).set('Content-Type', 'application/json').end(function (err, res) {
          if (err) return reject(err);
          return resolve(res);
        });
      });
    }
  }, {
    key: "setupHeaders",
    value: function setupHeaders(req, headers) {
      // let's give this default Authorization Header
      req.set('QISCUS_SDK_APP_ID', "".concat(this.AppId));
      req.set('QISCUS_SDK_USER_ID', "".concat(this.userId));
      req.set('QISCUS_SDK_TOKEN', "".concat(this.token));
      req.set('QISCUS_SDK_VERSION', "".concat(this.version)); // Return the req if no headers attached

      if (Object.keys(headers).length < 1) return req; // now let's process custom header

      for (var key in headers) {
        req.set(key, headers[key]);
      }

      return req;
    }
  }]);
  return HttpAdapter;
}();

exports["default"] = HttpAdapter;
module.exports = exports.default;