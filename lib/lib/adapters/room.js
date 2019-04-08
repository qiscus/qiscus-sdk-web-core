"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

var _classCallCheck2 = _interopRequireDefault(require("@babel/runtime/helpers/classCallCheck"));

var _createClass2 = _interopRequireDefault(require("@babel/runtime/helpers/createClass"));

var RoomAdapter =
/*#__PURE__*/
function () {
  /**
  * Params used in this class
  * @method constructor
  * @param  {Object}    HTTPAdapter [Qiscus HTTP adapter]
  * @return {void}                Returns nothing
  */
  function RoomAdapter(HTTPAdapter) {
    (0, _classCallCheck2.default)(this, RoomAdapter);
    this.HTTPAdapter = HTTPAdapter;
    this.token = HTTPAdapter.token;
  }

  (0, _createClass2.default)(RoomAdapter, [{
    key: "getOrCreateRoom",
    value: function getOrCreateRoom(email, options, distinctId) {
      var params = {
        token: this.token,
        emails: email
      };
      if (distinctId) params[distinctId] = distinctId;
      if (options) params['options'] = JSON.stringify(options);
      return this.HTTPAdapter.post("api/v2/sdk/get_or_create_room_with_target", params).then(function (res) {
        if (res.body.status !== 200) return Promise.reject(res);
        var room = res.body.results.room;
        room.avatar = room.avatar_url;
        room.comments = res.body.results.comments.reverse();
        var rivalUser = room.participants.find(function (p) {
          return p.email === email;
        });
        room.name = rivalUser ? rivalUser.username : 'Room name';
        return Promise.resolve(room);
      }, function (err) {
        return Promise.reject(err);
      });
    }
  }, {
    key: "getRoomById",
    value: function getRoomById(id) {
      return this.HTTPAdapter.get("api/v2/mobile/get_room_by_id?token=".concat(this.token, "&id=").concat(id)).then(function (response) {
        return Promise.resolve(response.body);
      }, function (error) {
        return Promise.reject(error);
      });
    }
  }, {
    key: "getOrCreateRoomByUniqueId",
    value: function getOrCreateRoomByUniqueId(id, name, avatarURL) {
      var params = {
        token: this.token,
        unique_id: id,
        name: name,
        avatar_url: avatarURL
      };
      return this.HTTPAdapter.post("api/v2/mobile/get_or_create_room_with_unique_id", params).then(function (res) {
        if (res.body.status !== 200) return Promise.reject(res);
        var room = res.body.results.room;
        room.avatar = room.avatar_url;
        room.comments = res.body.results.comments.reverse();
        room.name = room.room_name;
        return Promise.resolve(room);
      }, function (err) {
        return Promise.reject(err);
      });
    }
  }, {
    key: "createRoom",
    value: function createRoom(name, emails) {
      var opts = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
      var optionalData = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : {};
      var optsData = Object.keys(optionalData).length <= 0 ? null : JSON.stringify(optionalData);
      var body = {
        token: this.token,
        name: name,
        'participants[]': emails,
        avatar_url: opts.avatarURL,
        options: optsData
      };
      return this.HTTPAdapter.post("api/v2/mobile/create_room", body).then(function (res) {
        if (res.body.status !== 200) return Promise.reject(res);
        var room = res.body.results.room;
        room.comments = res.body.results.comments;
        return Promise.resolve({
          id: room.id,
          name: room.room_name,
          lastCommentId: room.last_comment_id,
          lastCommentMessage: room.last_comment_message,
          lastTopicId: room.last_topic_id,
          avatarURL: room.avatar_url,
          options: room.options,
          participants: room.participants.map(function (participant) {
            return {
              id: participant.id,
              email: participant.email,
              username: participant.username,
              avatarURL: participant.avatar_url
            };
          })
        });
      }).catch(function (err) {
        console.error('Error when creating room', err);
        return Promise.reject(new Error('Error when creating room'));
      });
    }
  }, {
    key: "updateRoom",
    value: function updateRoom(args) {
      if (!args.id) throw new Error('id is required');
      var params = {
        token: this.token,
        id: args.id
      };
      if (args.room_name) params['room_name'] = args.room_name;
      if (args.avatar_url) params['avatar_url'] = args.avatar_url;
      if (args.options) params['options'] = JSON.stringify(args.options);
      return this.HTTPAdapter.post("api/v2/mobile/update_room", params).then(function (res) {
        if (res.body.status !== 200) return Promise.reject(res);
        return Promise.resolve(res.body.results.room);
      }, function (err) {
        return Promise.reject(err);
      });
    }
  }, {
    key: "getTotalUnreadCount",
    value: function getTotalUnreadCount() {
      return this.HTTPAdapter.get("api/v2/sdk/total_unread_count?token=".concat(this.token)).then(function (response) {
        return Promise.resolve(response.body.results.total_unread_count);
      }, function (error) {
        return Promise.reject(error);
      });
    }
  }, {
    key: "addParticipantsToGroup",
    value: function addParticipantsToGroup(roomId) {
      var emails = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];
      if (!roomId || !emails) throw new Error('room_id and emails is required');
      var params = {
        token: this.token,
        room_id: roomId,
        'emails[]': emails
      };
      return this.HTTPAdapter.post("api/v2/mobile/add_room_participants", params).then(function (res) {
        if (res.body.status !== 200) return Promise.reject(res);
        return Promise.resolve(res.body.results.participants_added);
      }, function (err) {
        return Promise.reject(err);
      });
    }
  }, {
    key: "removeParticipantsFromGroup",
    value: function removeParticipantsFromGroup(roomId) {
      var emails = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : [];
      if (!roomId || !emails) throw new Error('room_id and emails is required');
      var params = {
        token: this.token,
        room_id: roomId,
        'emails[]': emails
      };
      return this.HTTPAdapter.post("api/v2/mobile/remove_room_participants", params).then(function (res) {
        if (res.body.status !== 200) return Promise.reject(res);
        return Promise.resolve(res.body.results.participants_removed);
      }, function (err) {
        return Promise.reject(err);
      });
    }
  }]);
  return RoomAdapter;
}();

exports.default = RoomAdapter;
module.exports = exports.default;