"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;

var _defineProperty2 = _interopRequireDefault(require("@babel/runtime/helpers/defineProperty"));

var _classCallCheck2 = _interopRequireDefault(require("@babel/runtime/helpers/classCallCheck"));

var _createClass2 = _interopRequireDefault(require("@babel/runtime/helpers/createClass"));

var _match2 = require("../match");

var _mitt = _interopRequireDefault(require("mitt"));

var _connect = _interopRequireDefault(require("mqtt/lib/connect"));

var MqttAdapter =
/*#__PURE__*/
function () {
  function MqttAdapter(url, core) {
    var _this = this,
        _match;

    (0, _classCallCheck2["default"])(this, MqttAdapter);
    var emitter = (0, _mitt["default"])();
    var mqtt = (0, _connect["default"])(url, {
      will: {
        topic: "u/".concat(core.userData.email, "/s"),
        payload: 0,
        retain: true
      }
    }); // Define a read-only property so user cannot accidentially
    // overwrite it's value

    Object.defineProperties(this, {
      core: {
        value: core
      },
      emitter: {
        value: emitter
      },
      mqtt: {
        value: mqtt
      }
    });
    var matcher = (0, _match2.match)((_match = {}, (0, _defineProperty2["default"])(_match, (0, _match2.when)(this.reNewMessage), function (topic) {
      return _this.newMessageHandler.bind(_this, topic);
    }), (0, _defineProperty2["default"])(_match, (0, _match2.when)(this.reNotification), function (topic) {
      return _this.notificationHandler.bind(_this, topic);
    }), (0, _defineProperty2["default"])(_match, (0, _match2.when)(this.reTyping), function (topic) {
      return _this.typingHandler.bind(_this, topic);
    }), (0, _defineProperty2["default"])(_match, (0, _match2.when)(this.reDelivery), function (topic) {
      return _this.deliveryReceiptHandler.bind(_this, topic);
    }), (0, _defineProperty2["default"])(_match, (0, _match2.when)(this.reRead), function (topic) {
      return _this.readReceiptHandler.bind(_this, topic);
    }), (0, _defineProperty2["default"])(_match, (0, _match2.when)(this.reOnlineStatus), function (topic) {
      return _this.onlinePresenceHandler.bind(_this, topic);
    }), (0, _defineProperty2["default"])(_match, (0, _match2.when)(this.reChannelMessage), function (topic) {
      return _this.channelMessageHandler.bind(_this, topic);
    }), (0, _defineProperty2["default"])(_match, (0, _match2.when)(), function (topic) {
      return _this.logger('topic not handled', topic);
    }), _match)); // #region mqtt event

    this.mqtt.on('message', function (t, m) {
      var message = m.toString();
      var func = matcher(t);
      if (func != null) func(message);
    });
    this.mqtt.on('reconnect', function () {
      _this.logger('reconnect');

      _this.emit('reconnect');

      core.disableSync();
      core.synchronize();
      core.synchronizeEvent();
    });
    this.mqtt.on('close', function () {
      _this.logger('close');

      _this.emit('close');

      core.activateSync();
    });
    this.mqtt.on('error', function () {
      _this.logger('error');

      _this.emit('error');

      core.activateSync();
    }); // #endregion
    // TODO: Update core to use latest emitter
    // #region backward-compatible

    this.on('new-message', function (message) {
      core.events.emit('newmessages', [message]);
    });
    this.on('presence', function (data) {
      core.events.emit('presence', data);
    });
    this.on('comment-deleted', function (data) {
      core.events.emit('comment-deleted', data);
    });
    this.on('room-cleared', function (data) {
      core.events.emit('room-cleared', data);
    });
    this.on('typing', function (data) {
      core.events.emit('typing', {
        message: data.message,
        username: data.userId,
        room_id: data.roomId
      });
    });
    this.on('comment-delivered', function (data) {
      _this.logger('emitting comment-delivered', data);

      core.events.emit('comment-delivered', {
        actor: data.userId,
        comment: data.comment
      });
    });
    this.on('comment-read', function (data) {
      core.events.emit('comment-read', {
        comment: data.comment,
        actor: data.userId
      });
    }); // #endregion
  }

  (0, _createClass2["default"])(MqttAdapter, [{
    key: "publish",
    value: function publish(topic, payload) {
      var options = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : {};
      return this.mqtt.publish(topic, payload.toString(), options);
    }
  }, {
    key: "noop",
    // #endregion
    value: function noop() {}
  }, {
    key: "newMessageHandler",
    value: function newMessageHandler(topic, message) {
      message = JSON.parse(message);
      this.logger('on:new-message', message);
      this.emit('new-message', message);
    }
  }, {
    key: "notificationHandler",
    value: function notificationHandler(topic, message) {
      var _this2 = this;

      this.logger('on:notification', message);
      message = JSON.parse(message);
      var data = message.payload.data;

      if ('deleted_messages' in data) {
        data.deleted_messages.forEach(function (message) {
          _this2.emit('comment-deleted', {
            roomId: message.room_id,
            commentUniqueIds: message.message_unique_ids,
            isForEveryone: true,
            isHard: true
          });
        });
      }

      if ('deleted_rooms' in data) {
        data.deleted_rooms.forEach(function (room) {
          _this2.emit('room-cleared', room);
        });
      }
    }
  }, {
    key: "typingHandler",
    value: function typingHandler(t, message) {
      this.logger('on:typing', t); // r/{roomId}/{roomId}/{userId}/t

      var topic = t.match(this.reTyping);
      if (topic[3] === this.core.user_id) return;
      var userId = topic[3];
      var roomId = topic[1];
      this.emit('typing', {
        message: message,
        userId: userId,
        roomId: roomId
      }); // TODO: Don't allow side-effect
      // it should be handled in the UI not core

      if (message === '1' && roomId === this.core.selected.id) {
        var actor = this.core.selected.participants.find(function (it) {
          return it.email === userId;
        });
        if (actor == null) return;
        var displayName = actor.username;
        this.core.isTypingStatus = "".concat(displayName, " is typing ...");
      } else {
        this.core.isTypingStatus = null;
      }
    }
  }, {
    key: "deliveryReceiptHandler",
    value: function deliveryReceiptHandler(t, message) {
      this.logger('on:delivered', t, message); // r/{roomId}/{roomId}/{userId}/d

      var topic = t.match(this.reDelivery);
      var data = message.split(':');
      var commentId = data[0];
      var commentUniqueId = data[1];
      var userId = topic[3];
      if (this.core.selected == null) return;
      var room = this.core.selected;
      var comment = room.comments.find(function (it) {
        return it.id === commentId || it.unique_id === commentUniqueId;
      });
      if (comment == null) return;
      if (comment.status === 'read') return;
      if (comment.username_real === userId) return;
      var options = {
        participants: room.participants,
        actor: userId,
        comment_id: commentId
      };
      room.comments.forEach(function (it) {
        if (it.status !== 'read' && it.id <= comment.id) {
          comment.markAsDelivered(options);
        }
      });
      if (comment.room_id == null) comment.room_id = room.id;
      this.emit('comment-delivered', {
        userId: userId,
        comment: comment
      });
    } // Todo only emit if the comment are realy read

  }, {
    key: "readReceiptHandler",
    value: function readReceiptHandler(t, message) {
      this.logger('on:read', t, message); // r/{roomId}/{roomId}/{userId}/r

      var topic = t.match(this.reRead);
      var data = message.split(':');
      var commentId = data[0];
      var commentUniqueId = data[1];
      var userId = topic[3];
      if (this.core.selected == null) return;
      var room = this.core.selected;
      var comment = room.comments.find(function (it) {
        return it.unique_id === commentUniqueId || it.id === commentId;
      });
      if (comment == null) return;
      var isOwnedComment = comment.username_real === this.core.user_id;
      var isOwnedEvent = userId === this.core.user_id;
      var isRead = comment.status === 'read';

      if (!isRead && isOwnedComment && !isOwnedEvent) {
        var options = {
          participants: room.participants,
          actor: userId,
          comment_id: Number(commentId),
          activeActorId: this.core.user_id
        };
        room.comments.forEach(function (it) {
          if (it.id <= comment.id) {
            it.markAsRead(options);
          }
        });
        if (comment.room_id == null) comment.room_id = room.id; // Only emit if comment are read

        if (!comment.isRead) return;
        this.emit('comment-read', {
          comment: comment,
          userId: userId
        });
      }
    }
  }, {
    key: "onlinePresenceHandler",
    value: function onlinePresenceHandler(topic, message) {
      this.logger('on:online-presence', topic);
      this.emit('presence', message);
    }
  }, {
    key: "channelMessageHandler",
    value: function channelMessageHandler(topic, message) {
      this.logger('on:channel-message', topic, message);
      this.emit('new-message', JSON.parse(message));
    } // #region old-methods

  }, {
    key: "subscribeChannel",
    value: function subscribeChannel(appId, uniqueId) {
      this.subscribe("".concat(appId, "/").concat(uniqueId, "/c"));
    }
  }, {
    key: "subscribeRoom",
    value: function subscribeRoom(roomId) {
      if (roomId == null) return;
      this.subscribe("r/".concat(roomId, "/").concat(roomId, "/+/t"));
      this.subscribe("r/".concat(roomId, "/").concat(roomId, "/+/d"));
      this.subscribe("r/".concat(roomId, "/").concat(roomId, "/+/r"));
    }
  }, {
    key: "unsubscribeRoom",
    value: function unsubscribeRoom(roomId) {
      if (this.core.selected == null) return;
      roomId = roomId || this.core.selected.id;
      this.unsubscribe("r/".concat(roomId, "/").concat(roomId, "/+t"));
      this.unsubscribe("r/".concat(roomId, "/").concat(roomId, "/+d"));
      this.unsubscribe("r/".concat(roomId, "/").concat(roomId, "/+r"));
    }
  }, {
    key: "subscribeUserChannel",
    value: function subscribeUserChannel() {
      this.subscribe("".concat(this.core.userData.token, "/c"));
      this.subscribe("".concat(this.core.userData.token, "/n"));
    }
  }, {
    key: "publishPresence",
    value: function publishPresence(userId) {
      this.core.logging('emitting presence status for user', userId);
      this.publish("u/".concat(userId, "/s"), 1, {
        retain: true
      });
    }
  }, {
    key: "subscribeUserPresence",
    value: function subscribeUserPresence(userId) {
      this.subscribe("u/".concat(userId, "/s"));
    }
  }, {
    key: "unsubscribeUserPresence",
    value: function unsubscribeUserPresence(userId) {
      this.unsubscribe("u/".concat(userId, "/s"));
    }
  }, {
    key: "publishTyping",
    value: function publishTyping(status) {
      if (this.core.selected == null) return;
      var roomId = this.core.selected.id;
      var userId = this.core.user_id;
      this.publish("r/".concat(roomId, "/").concat(roomId, "/").concat(userId, "/t"), status);
    } // #endregion

  }, {
    key: "subscribe",
    get: function get() {
      return this.mqtt.subscribe.bind(this.mqtt);
    }
  }, {
    key: "unsubscribe",
    get: function get() {
      return this.mqtt.unsubscribe.bind(this.mqtt);
    }
  }, {
    key: "emit",
    get: function get() {
      return this.emitter.emit.bind(this.emitter);
    }
  }, {
    key: "on",
    get: function get() {
      return this.emitter.on.bind(this.emitter);
    }
  }, {
    key: "logger",
    get: function get() {
      if (!this.core.debugMQTTMode) return this.noop;
      return console.log.bind(console, 'MQTT ->');
    } // #region regexp

  }, {
    key: "reNewMessage",
    get: function get() {
      return /^([\w]+)\/c/i;
    }
  }, {
    key: "reNotification",
    get: function get() {
      return /^([\w]+)\/n/i;
    }
  }, {
    key: "reTyping",
    get: function get() {
      return /^r\/([\d]+)\/([\d]+)\/([\S]+)\/t$/i;
    }
  }, {
    key: "reDelivery",
    get: function get() {
      return /^r\/([\d]+)\/([\d]+)\/([\S]+)\/d$/i;
    }
  }, {
    key: "reRead",
    get: function get() {
      return /^r\/([\d]+)\/([\d]+)\/([\S]+)\/r$/i;
    }
  }, {
    key: "reOnlineStatus",
    get: function get() {
      return /^u\/([\S]+)\/s$/i;
    }
  }, {
    key: "reChannelMessage",
    get: function get() {
      return /^([\S]+)\/([\S]+)\/c/i;
    }
  }, {
    key: "subscribeTyping",
    get: function get() {
      return this.subscribeRoom.bind(this);
    }
  }, {
    key: "unsubscribeTyping",
    get: function get() {
      return this.unsubscribeRoom.bind(this);
    }
  }, {
    key: "subscribeRoomPresence",
    get: function get() {
      return this.subscribeUserPresence.bind(this);
    }
  }, {
    key: "unsubscribeRoomPresence",
    get: function get() {
      return this.unsubscribeUserPresence.bind(this);
    }
  }]);
  return MqttAdapter;
}();

exports["default"] = MqttAdapter;
module.exports = exports.default;