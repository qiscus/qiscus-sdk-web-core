"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _classCallCheck2 = _interopRequireDefault(require("@babel/runtime/helpers/classCallCheck"));

var _createClass2 = _interopRequireDefault(require("@babel/runtime/helpers/createClass"));

var AuthAdapter =
/*#__PURE__*/
function () {
  /**
  * Params used in this class
  * @method constructor
  * @param  {Object}    HTTPAdapter [Qiscus HTTP adapter]
  * @return {void}                Returns nothing
  */
  function AuthAdapter(HTTPAdapter) {
    (0, _classCallCheck2.default)(this, AuthAdapter);
    this.HTTPAdapter = HTTPAdapter;
    this.token = HTTPAdapter.token;
  }

  (0, _createClass2.default)(AuthAdapter, [{
    key: "getNonce",
    value: function getNonce() {
      return this.HTTPAdapter.post('api/v2/sdk/auth/nonce').then(function (response) {
        return Promise.resolve(response.body.results);
      }, function (error) {
        return Promise.reject(error);
      });
    }
  }, {
    key: "loginOrRegister",
    value: function loginOrRegister(params) {
      return this.HTTPAdapter.post('api/v2/sdk/login_or_register', params).then(function (response) {
        return new Promise(function (resolve, reject) {
          if (response.body.status !== 200) return reject(response);
          return resolve(response.body.results);
        });
      }, function (error) {
        return Promise.reject(error);
      });
    }
  }, {
    key: "verifyIdentityToken",
    value: function verifyIdentityToken(token) {
      return this.HTTPAdapter.post('api/v2/sdk/auth/verify_identity_token', {
        identity_token: token
      }).then(function (response) {
        return Promise.resolve(response.body.results);
      }, function (error) {
        return Promise.reject(error);
      });
    }
  }]);
  return AuthAdapter;
}();

exports.default = AuthAdapter;
module.exports = exports.default;