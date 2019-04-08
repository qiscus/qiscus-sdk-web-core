"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _classCallCheck2 = _interopRequireDefault(require("@babel/runtime/helpers/classCallCheck"));

var _createClass2 = _interopRequireDefault(require("@babel/runtime/helpers/createClass"));

// import store from 'store';
var User =
/*#__PURE__*/
function () {
  /**
  * Params used in this class
  * @method constructor
  * @param  {Object}    HTTPAdapter [Qiscus HTTP adapter]
  * @return {void}                Returns nothing
  */
  function User(HTTPAdapter) {
    (0, _classCallCheck2.default)(this, User);
    this.HTTPAdapter = HTTPAdapter;
    this.token = HTTPAdapter.token;
  }

  (0, _createClass2.default)(User, [{
    key: "postComment",
    value: function postComment(topicId, commentMessage, uniqueId, type, payload, extras) {
      return this.HTTPAdapter.post("api/v2/sdk/post_comment", {
        token: this.token,
        comment: commentMessage,
        topic_id: topicId,
        unique_temp_id: uniqueId,
        type: type,
        payload: payload,
        extras: extras
      }).then(function (res) {
        return new Promise(function (resolve, reject) {
          if (res.body.status !== 200) return reject(res);
          var data = res.body.results.comment;
          return resolve(data);
        });
      }, function (error) {
        return Promise.reject(error);
      });
    }
  }, {
    key: "sync",
    value: function sync() {
      var id = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
      return this.HTTPAdapter.get("api/v2/sdk/sync?token=".concat(this.token, "&last_received_comment_id=").concat(id)).then(function (res, err) {
        if (err) return Promise.reject(err);
        return new Promise(function (resolve, reject) {
          if (res.body.status !== 200) return reject(res);
          var data = res.body.results.comments;
          return resolve(data);
        });
      }).catch(function (error) {
        return console.log(error);
      });
    }
  }, {
    key: "syncEvent",
    value: function syncEvent() {
      var id = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 0;
      return this.HTTPAdapter.get("api/v2/sdk/sync_event?token=".concat(this.token, "&start_event_id=").concat(id)).then(function (res, err) {
        if (err) return Promise.reject(err);
        return new Promise(function (resolve, reject) {
          if (res.statusCode !== 200) return reject(res);
          var data = res.body;
          return resolve(data);
        });
      }).catch(function (error) {
        return console.log(error);
      });
    }
  }, {
    key: "updateCommentStatus",
    value: function updateCommentStatus(roomId, lastReadCommentId, lastReceivedCommentId) {
      var body = {
        token: this.token,
        room_id: roomId
      };
      if (lastReadCommentId) body.last_comment_read_id = lastReadCommentId;
      if (lastReceivedCommentId) body.last_comment_received_id = lastReceivedCommentId;
      return this.HTTPAdapter.post('api/v2/mobile/update_comment_status', body).then(function (res) {
        return Promise.resolve(res);
      }).catch(function (error) {
        return console.log(error);
      });
    }
  }, {
    key: "loadRoomList",
    value: function loadRoomList() {
      var params = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};
      var body = "?token=".concat(this.token);
      if (params.page) body += "&page=".concat(params.page);
      if (params.show_participants) body += "&show_participants=".concat(params.show_participants || true);
      if (params.limit) body += "&limit=".concat(params.limit);
      if (params.show_empty) body += "&show_empty=".concat(params.show_empty);
      return this.HTTPAdapter.get("api/v2/sdk/user_rooms".concat(body)).then(function (res) {
        return new Promise(function (resolve, reject) {
          if (res.body.status !== 200) return reject(res);
          var data = res.body.results.rooms_info;
          return resolve(data);
        });
      }, function (error) {
        return Promise.reject(error);
      });
    }
  }, {
    key: "searchMessages",
    value: function searchMessages(params) {
      var body = {
        token: this.token,
        query: params.query || null,
        room_id: params.room_id || null,
        last_comment_id: params.last_comment_id || null
      };
      return this.HTTPAdapter.post('api/v2/sdk/search_messages', body).then(function (res) {
        return Promise.resolve(res.body.results.comments);
      }).catch(function (error) {
        return Promise.reject(error);
      });
    }
  }, {
    key: "updateProfile",
    value: function updateProfile(params) {
      var body = {
        token: this.token,
        name: params.name || null,
        avatar_url: params.avatar_url || null,
        extras: params.extra ? JSON.stringify(params.extras) : null
      };
      return this.HTTPAdapter.patch('api/v2/sdk/my_profile', body).then(function (res) {
        return Promise.resolve(res.body.results.user);
      }).catch(function (error) {
        return Promise.reject(error);
      });
    }
  }, {
    key: "uploadFile",
    value: function uploadFile(file) {
      var body = {
        token: this.token,
        file: file
      };
      return this.HTTPAdapter.post("api/v2/sdk/upload", body).then(function (res) {
        return Promise.resolve(res.body);
      }).catch(function (error) {
        return Promise.reject(error);
      });
    }
  }, {
    key: "getRoomsInfo",
    value: function getRoomsInfo(opts) {
      var body = {
        token: this.token,
        show_participants: true,
        show_removed: false
      };
      if (opts.room_ids) body.room_id = opts.room_ids;
      if (opts.room_unique_ids) body.room_unique_id = opts.room_unique_ids;
      if (opts.show_participants) body.show_participants = opts.show_participants;
      if (opts.show_removed) body.show_removed = opts.show_removed;
      return this.HTTPAdapter.post_json("api/v2/mobile/rooms_info", body).then(function (res) {
        return Promise.resolve(res.body);
      }).catch(function (error) {
        return Promise.reject(error);
      });
    }
  }, {
    key: "loadComments",
    value: function loadComments(topicId, options) {
      var params = "token=".concat(this.token, "&topic_id=").concat(topicId);
      if (options.last_comment_id) params += "&last_comment_id=".concat(options.last_comment_id);
      if (options.timestamp) params += "&timestamp=".concat(options.timestamp);
      if (options.after) params += "&after=".concat(options.after);
      if (options.limit) params += "&limit=".concat(options.limit);
      return this.HTTPAdapter.get("api/v2/sdk/load_comments?".concat(params)).then(function (res) {
        return new Promise(function (resolve, reject) {
          if (res.status !== 200) return new Promise(function (resolve, reject) {
            return reject(res);
          });
          var data = res.body.results.comments;
          return resolve(data);
        });
      }, function (error) {
        // console.info('failed loading comments', error);
        return new Promise(function (resolve, reject) {
          return reject(error);
        });
      });
    }
  }, {
    key: "deleteComment",
    value: function deleteComment(roomId, commentUniqueIds) {
      var isForEveryone = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : true;
      var isHard = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : true;
      if (isForEveryone === false) console.warn('Deprecated: delete comment for me will be removed on next release');
      if (isHard === false) console.warn('Deprecated: soft delete will be removed on next release');
      var body = {
        token: this.token,
        unique_ids: commentUniqueIds,
        is_delete_for_everyone: isForEveryone,
        is_hard_delete: isHard
      };
      return this.HTTPAdapter.del("api/v2/sdk/delete_messages", body).then(function (res) {
        return Promise.resolve(res.body);
      }).catch(function (error) {
        return Promise.reject(error);
      });
    }
  }, {
    key: "clearRoomMessages",
    value: function clearRoomMessages(roomIds) {
      var body = {
        token: this.token,
        room_channel_ids: roomIds
      };
      return this.HTTPAdapter.del("api/v2/sdk/clear_room_messages", body).then(function (res) {
        return Promise.resolve(res.body);
      }).catch(function (error) {
        return Promise.reject(error);
      });
    }
  }, {
    key: "getCommentReceiptStatus",
    value: function getCommentReceiptStatus(id) {
      return this.HTTPAdapter.get("api/v2/sdk/comment_receipt?token=".concat(this.token, "&comment_id=").concat(id)).then(function (res) {
        return Promise.resolve(res.body);
      }).catch(function (error) {
        return Promise.reject(error);
      });
    }
  }, {
    key: "getBlockedUser",
    value: function getBlockedUser() {
      var page = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 1;
      var limit = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 20;
      var url = "api/v2/mobile/get_blocked_users?token=".concat(this.token, "&page=").concat(page, "&limit=").concat(limit);
      return this.HTTPAdapter.get(url).then(function (res) {
        if (res.body.status !== 200) return Promise.reject(res);
        return Promise.resolve(res.body.results.blocked_users);
      }, function (err) {
        return Promise.reject(err);
      });
    }
  }, {
    key: "blockUser",
    value: function blockUser(email) {
      if (!email) throw new Error('email is required');
      var params = {
        token: this.token,
        user_email: email
      };
      return this.HTTPAdapter.post("api/v2/mobile/block_user", params).then(function (res) {
        if (res.body.status !== 200) return Promise.reject(res);
        return Promise.resolve(res.body.results.user);
      }, function (err) {
        return Promise.reject(err);
      });
    }
  }, {
    key: "unblockUser",
    value: function unblockUser(email) {
      if (!email) throw new Error('email is required');
      var params = {
        token: this.token,
        user_email: email
      };
      return this.HTTPAdapter.post("api/v2/mobile/unblock_user", params).then(function (res) {
        if (res.body.status !== 200) return Promise.reject(res);
        return Promise.resolve(res.body.results.user);
      }, function (err) {
        return Promise.reject(err);
      });
    }
  }]);
  return User;
}();

exports.default = User;
module.exports = exports.default;