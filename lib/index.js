"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;

var _defineProperty2 = _interopRequireDefault(require("@babel/runtime/helpers/defineProperty"));

var _regenerator = _interopRequireDefault(require("@babel/runtime/regenerator"));

var _asyncToGenerator2 = _interopRequireDefault(require("@babel/runtime/helpers/asyncToGenerator"));

var _classCallCheck2 = _interopRequireDefault(require("@babel/runtime/helpers/classCallCheck"));

var _createClass2 = _interopRequireDefault(require("@babel/runtime/helpers/createClass"));

var _superagent = _interopRequireDefault(require("superagent"));

var _mitt = _interopRequireDefault(require("mitt"));

var _format = _interopRequireDefault(require("date-fns/format"));

var _distance_in_words_to_now = _interopRequireDefault(require("date-fns/distance_in_words_to_now"));

var _Comment = _interopRequireDefault(require("./lib/Comment"));

var _Room = _interopRequireDefault(require("./lib/Room"));

var _http = _interopRequireDefault(require("./lib/adapters/http"));

var _auth = _interopRequireDefault(require("./lib/adapters/auth"));

var _user = _interopRequireDefault(require("./lib/adapters/user"));

var _room = _interopRequireDefault(require("./lib/adapters/room"));

var _mqtt = _interopRequireDefault(require("./lib/adapters/mqtt"));

var _customEvent = _interopRequireDefault(require("./lib/adapters/custom-event"));

var _utils = require("./lib/utils");

var _package = _interopRequireDefault(require("../package.json"));

/**
 * Qiscus Web SDK Core Class
 *
 * @export
 * @class QiscusSDK
 * @extends {EventEmitter}
 */
var QiscusSDK =
/*#__PURE__*/
function () {
  /**
   * Creates an instance of QiscusSDK.
   * @memberof QiscusSDK
   */
  function QiscusSDK() {
    (0, _classCallCheck2["default"])(this, QiscusSDK);
    this.events = (0, _mitt["default"])();
    this.rooms = [];
    this.selected = null;
    this.room_name_id_map = {};
    this.pendingCommentId = 0;
    this.uploadedFiles = [];
    this.chatmateStatus = null;
    this.version = "WEB_".concat(_package["default"].version);
    this.userData = {}; // SDK Configuration

    this.AppId = null;
    this.baseURL = 'https://api.qiscus.com';
    this.uploadURL = "".concat(this.baseURL, "/api/v2/sdk/upload");
    this.mqttURL = 'wss://mqtt.qiscus.com:1886/mqtt';
    this.HTTPAdapter = null;
    this.realtimeAdapter = null;
    this.customEventAdapter = null;
    this.isInit = false;
    this.isSynced = false;
    this.sync = 'socket'; // possible values 'socket', 'http', 'both'

    this.httpsync = null;
    this.eventsync = null;
    this.extras = null;
    this.last_received_comment_id = 0;
    this.googleMapKey = '';
    this.options = {
      avatar: true // UI related Properties

    };
    this.UI = {};
    this.mode = 'widget';
    this.avatar = true;
    this.plugins = [];
    this.isLogin = false;
    this.isLoading = false;
    this.isInit = false;
    this.emoji = false;
    this.isTypingStatus = '';
    this.customTemplate = false;
    this.templateFunction = null;
    this.debugMode = false;
    this.debugMQTTMode = false; // to prevent double receive newmessages callback

    this.lastReceiveMessages = [];
  }
  /**
   * Initializing the SDK, set Event Listeners (callbacks)
   * @param {any} config - Qiscus SDK Configurations
   * @return {void}
   */


  (0, _createClass2["default"])(QiscusSDK, [{
    key: "init",
    value: function init(config) {
      // set AppID
      if (!config.AppId) throw new Error('Please provide valid AppId');
      this.AppId = config.AppId;
      if (config.baseURL) this.baseURL = config.baseURL;
      if (config.mqttURL) this.mqttURL = config.mqttURL;
      if (config.uploadURL) this.uploadURL = config.uploadURL;
      if (config.sync) this.sync = config.sync;
      if (config.mode) this.mode = config.mode;
      if (config.googleMapKey) this.googleMapKey = config.googleMapKey;

      if (config.allowedFileTypes) {
        this.allowedFileTypes = config.allowedFileTypes;
      } // Let's initialize the app based on options


      if (config.options) {
        this.options = Object.assign({}, this.options, config.options);
      }

      if (config.customTemplate) this.customTemplate = config.customTemplate;

      if (config.templateFunction) {
        this.templateFunction = config.templateFunction;
      } // set Event Listeners


      this.setEventListeners(); // mini garbage collector
      // setInterval(this.clearRoomsCache.bind(this), 90000);
    }
  }, {
    key: "readComment",
    value: function readComment(roomId, commentId) {
      var self = this;
      var isSelected = self.selected || self.selected.id !== roomId;
      var isChannel = self.selected.isChannel;
      if (!isSelected || isChannel) return false;
      self.userAdapter.updateCommentStatus(roomId, commentId, null).then(function (res) {// ambil semua yang belum di read selain komen ini, kemudian mark as read
        // self.sortComments()
      });
    }
  }, {
    key: "receiveComment",
    value: function receiveComment(roomId, commentId) {
      var self = this;
      var isChannel = self.selected ? self.selected.isChannel : false;
      if (isChannel) return false;
      self.userAdapter.updateCommentStatus(roomId, null, commentId).then(function (res) {// self.sortComments()
      });
    }
  }, {
    key: "setEventListeners",
    value: function setEventListeners() {
      var _this = this;

      var self = this;
      self.events.on('start-init', function (response) {
        self.HTTPAdapter = new _http["default"]({
          baseURL: self.baseURL,
          AppId: self.AppId,
          userId: self.user_id,
          version: self.version
        });
        self.HTTPAdapter.setToken(self.userData.token);
        self.authAdapter = new _auth["default"](self.HTTPAdapter);
      });
      self.events.on('room-changed', function (room) {
        _this.logging('room changed', room);

        if (self.options.roomChangedCallback) {
          self.options.roomChangedCallback(room);
        }
      });
      self.events.on('file-uploaded', function (url) {
        if (self.options.fileUploadedCallback) {
          self.options.fileUploadedCallback(url);
        }
      });
      self.events.on('profile-updated', function (user) {
        self.username = user.name;
        self.avatar_url = user.avatar_url;

        if (self.options.updateProfileCallback) {
          self.options.updateProfileCallback(user);
        }
      });
      /**
       * This event will be called when there's new post messages
       * @param {string} data - JSON Response from SYNC API / MQTT
       * @return {void}
       */

      self.events.on('newmessages', function (comments) {
        // let's convert the data into something we can use
        // first we need to make sure we sort this data out based on room_id
        _this.logging('newmessages', comments);

        if (_this.lastReceiveMessages.length > 0 && _this.lastReceiveMessages[0].unique_temp_id === comments[0].unique_temp_id) {
          _this.logging('lastReceiveMessages double', comments);

          return;
        }

        _this.lastReceiveMessages = comments;

        self._callNewMessagesCallback(comments);

        comments.forEach(function (comment) {
          // we have this comment, so means it's already delivered, update it's delivered status
          self.receiveComment(comment.room_id, comment.id);
          var isActiveRoom = self.selected ? comment.room_id === self.selected.id : false;
          var isAlreadyRead = comment.id <= self.last_received_comment_id; // kalau comment ini ada di currently selected

          if (isActiveRoom) {
            var selected = self.selected;
            var lastComment = self.selected.comments[self.selected.comments.length - 1]; // kirim event read kalau ini bukan komen kita sendiri

            if (!isAlreadyRead && self.user_id !== comment.email) self.readComment(comment.room_id, comment.id); // pastiin sync

            var roomLastCommentId = lastComment.id;
            var commentBeforeThis = self.selected.comments.find(function (c) {
              return c.id === lastComment.comment_before_id;
            });

            if (!commentBeforeThis) {
              _this.logging('comment before id not found! ', comment.comment_before_id); // need to fix, these method does not work


              self.synchronize(roomLastCommentId);
            } // pastikan dulu komen ini komen baru, klo komen lama ga usah panggil cb


            var pendingComment = new _Comment["default"](comment); // fetch the comment inside the room

            selected.receiveComment(pendingComment);
            selected.last_comment_id = pendingComment.id;
            selected.last_comment_message = pendingComment.message;
          } // let's update last_received_comment_id


          self.updateLastReceivedComment(comment.id);

          _this.sortComments();
        });
      });
      /**
       * This event will be called when login is sucess
       * Basically, it sets up necessary properties for qiscusSDK
       */

      self.events.on('login-success', function (response) {
        _this.logging('login-success', response);

        var mqttURL = self.mqttURL;
        self.isLogin = true;
        self.userData = response.user;
        self.last_received_comment_id = self.userData.last_comment_id; // now that we have the token, etc, we need to set all our adapters
        // /////////////// API CLIENT /////////////////

        self.HTTPAdapter = new _http["default"]({
          baseURL: self.baseURL,
          AppId: self.AppId,
          userId: self.user_id,
          version: self.version
        });
        self.HTTPAdapter.setToken(self.userData.token); // ////////////// CORE BUSINESS LOGIC ////////////////////////

        self.userAdapter = new _user["default"](self.HTTPAdapter);
        self.roomAdapter = new _room["default"](self.HTTPAdapter);
        self.realtimeAdapter = new _mqtt["default"](mqttURL, self);
        self.realtimeAdapter.subscribeUserChannel();
        self.realtimeAdapter.mqtt.on('connect', function () {
          _this.onReconnectMqtt();
        });
        setInterval(function () {
          return _this.realtimeAdapter.publishPresence(_this.user_id);
        }, 3500);
        if (self.sync === 'http' || self.sync === 'both') self.activateSync();

        if (self.options.loginSuccessCallback) {
          self.options.loginSuccessCallback(response);
        }

        self.customEventAdapter = (0, _customEvent["default"])(self.realtimeAdapter, self.user_id);
      });
      /**
       * Called when there's something wrong when connecting to qiscus SDK
       */

      self.events.on('login-error', function (error) {
        if (self.options.loginErrorCallback) {
          self.options.loginErrorCallback(error);
        }
      });
      self.events.on('room-cleared', function (room) {
        // find room
        if (self.selected) {
          var currentRoom = self.selected;

          if (self.selected.unique_id === room.unique_id) {
            self.selected = null;
            self.selected = currentRoom;
          }
        }

        if (self.options.roomClearedCallback) self.options.roomClearedCallback(room);
      });
      self.events.on('comment-deleted', function (data) {
        // get to the room id and delete the comment
        var roomId = data.roomId,
            commentUniqueIds = data.commentUniqueIds,
            isForEveryone = data.isForEveryone,
            isHard = data.isHard;

        if (self.selected && self.selected.id === roomId) {
          // loop through the array of unique_ids
          commentUniqueIds.map(function (id) {
            var commentToBeFound = self.selected.comments.findIndex(function (comment) {
              return comment.unique_id === id;
            });

            if (commentToBeFound > -1) {
              if (isHard) {
                self.selected.comments.splice(commentToBeFound, 1);
              } else {
                self.selected.comments[commentToBeFound].message = 'this message has been deleted';
              }
            }
          });
        }

        if (self.options.commentDeletedCallback) {
          self.options.commentDeletedCallback(data);
        }
      });
      /**
       * Called when the comment has been delivered
       */

      self.events.on('comment-delivered', function (response) {
        self.logging('comment-delivered', response);
        if (!response) return false;

        if (self.options.commentDeliveredCallback) {
          return self.options.commentDeliveredCallback(response);
        } // find comment with the id or unique id listed from response
        // const commentToFind = self.selected.comments.find(comment =>
        //   comment.id === response.id || comment.uniqueId === response.uniqueId);

      });
      /**
       * Called when new chatroom has been created
       */

      self.events.on('chat-room-created', function (response) {
        self.isLoading = false;

        if (self.options.chatRoomCreatedCallback) {
          self.options.chatRoomCreatedCallback(response);
        }
      });
      /**
       * Called when a new room with type of group has been created
       */

      self.events.on('group-room-created', function (response) {
        self.isLoading = false;

        if (self.options.groupRoomCreatedCallback) {
          self.options.groupRoomCreatedCallback(response);
        }
      });
      /**
       * Called when user clicked on Chat SDK Header
       */

      self.events.on('header-clicked', function (response) {
        if (self.options.headerClickedCallback) {
          self.options.headerClickedCallback(response);
        }
      });
      /**
       * Called when a comment has been read
       */

      self.events.on('comment-read', function (response) {
        self.logging('comment-read', response);

        if (self.options.commentReadCallback) {
          self.options.commentReadCallback(response);
        }
      });
      /**
       * Called when there's new presence data of currently subscribed target user (last seen timestamp)
       * @param {string} data MQTT Payload with format of "x:xxxxxxxxxxxxx"
       */

      self.events.on('presence', function (data) {
        var payload = data.split(':');

        if (self.chatmateStatus !== payload[0]) {
          self.chatmateStatus = payload[0] === 1 ? 'Online' : "Last seen ".concat((0, _distance_in_words_to_now["default"])(Number(payload[1].substring(0, 13))));
        }

        if (self.options.presenceCallback) self.options.presenceCallback(data);
      });
      self.events.on('typing', function (data) {
        if (self.options.typingCallback) self.options.typingCallback(data);
      });
      /**
       * Called when user clicked on Message Info
       */

      self.events.on('message-info', function (response) {
        if (self.options.messageInfoCallback) {
          self.options.messageInfoCallback(response);
        }
      });
      /**
       * Called when new particant was added into a group
       */

      self.events.on('participants-added', function (response) {
        var self = _this;
        if (!response) return;
        var participants = self.selected.participants.concat(response);
        self.selected.participants = participants;
      });
      /**
       * Called when particant was removed from a group
       */

      self.events.on('participants-removed', function (response) {
        if (!response) return;

        var participants = _this.selected.participants.filter(function (participant) {
          return response.indexOf(participant.email) <= -1;
        });

        _this.selected.participants = participants;
      });
      /**
       * Called when user was added to blocked list
       */

      self.events.on('block-user', function (response) {
        if (self.options.blockUserCallback) {
          self.options.blockUserCallback(response);
        }
      });
      /**
       * Called when user was removed from blocked list
       */

      self.events.on('unblock-user', function (response) {
        if (self.options.unblockUserCallback) {
          self.options.unblockUserCallback(response);
        }
      });
    }
  }, {
    key: "onReconnectMqtt",
    value: function onReconnectMqtt() {
      if (!this.selected) return;
      if (this.options.onReconnectCallback) this.options.onReconnectedCallback();
      this.loadComments(this.selected.id);
    }
  }, {
    key: "_callNewMessagesCallback",
    value: function _callNewMessagesCallback(comments) {
      if (this.options.newMessagesCallback) {
        this.options.newMessagesCallback(comments);
      } // let's sort the comments

    }
  }, {
    key: "updateLastReceivedComment",
    value: function updateLastReceivedComment(id) {
      if (this.last_received_comment_id < id) this.last_received_comment_id = id;
    }
    /**
     * Setting Up User Credentials for next API Request
     * @param {string} userId - client userId (will be used for login or register)
     * @param {string} key - client unique key
     * @param {string} username - client username
     * @param {string} avatar_url - the url for chat avatar (optional)
     * @return {void}
     */

  }, {
    key: "setUser",
    value: function setUser(userId, key, username, avatarURL, extras) {
      var self = this;
      self.events.emit('start-init');
      self.user_id = userId;
      self.key = key;
      self.username = username;
      self.avatar_url = avatarURL;
      var params = {
        email: this.user_id,
        password: this.key,
        username: this.username,
        extras: extras ? JSON.stringify(extras) : null
      };
      if (this.avatar_url) params.avatar_url = this.avatar_url;
      return self.authAdapter.loginOrRegister(params).then(function (response) {
        self.isInit = true;
        self.events.emit('login-success', response);
      }, function (error) {
        return self.events.emit('login-error', error);
      });
    }
  }, {
    key: "setUserWithIdentityToken",
    value: function setUserWithIdentityToken(data) {
      if (!data || !('user' in data)) return this.events.emit('login-error', data);
      this.email = data.user.email;
      this.user_id = data.user.email;
      this.key = data.identity_token;
      this.username = data.user.username;
      this.avatar_url = data.user.avatar_url;
      this.isInit = true;
      this.events.emit('login-success', data);
    }
  }, {
    key: "logout",
    value: function logout() {
      this.selected = null;
      this.isInit = false;
      this.isLogin = false;
      this.userData = {};
    } // Activate Sync Feature if `http` or `both` is chosen as sync value when init

  }, {
    key: "activateSync",
    value: function activateSync() {
      var self = this;
      if (self.isSynced) return false;
      self.isSynced = true;
      self.httpsync = setInterval(function () {
        return self.synchronize();
      }, 3500);
      self.eventsync = setInterval(function () {
        return self.synchronizeEvent();
      }, 3500);
    }
  }, {
    key: "disableSync",
    value: function disableSync() {
      var self = this;
      self.isSynced = false;
      clearInterval(self.httpsync);
      clearInterval(self.eventsync);
    }
    /**
     * This method let us get new comments from server
     * If comment count > 0 then we have new message
     */

  }, {
    key: "synchronize",
    value: function synchronize(lastId) {
      var _this2 = this;

      var idToBeSynced = lastId || this.last_received_comment_id;
      this.userAdapter.sync(idToBeSynced).then(function (comments) {
        if (!comments) return false;
        if (comments.length > 0) _this2.events.emit('newmessages', comments);
      })["catch"](function (error) {
        console.error('Error when syncing', error);
      });
    }
  }, {
    key: "synchronizeEvent",
    value: function synchronizeEvent(lastId) {
      var self = this;
      var idToBeSynced = lastId || this.last_received_comment_id;
      this.userAdapter.syncEvent(idToBeSynced).then(function (res) {
        if (!res) return false;
        res.events.forEach(function (event) {
          var data = event.payload.data;

          if (data.hasOwnProperty('deleted_messages')) {
            data.deleted_messages.forEach(function (message) {
              self.events.emit('commend-deleted', {
                roomId: message.room_id,
                commentUniqueIds: message.message_unique_ids,
                isForEveryone: true,
                isHard: data.is_hard_delete
              });
            });
          } else if (data.hasOwnProperty('deleted_rooms')) {
            data.deleted_rooms.forEach(function (room) {
              self.events.emit('room-cleared', room);
            });
          }
        });
      })["catch"](function (error) {
        console.error('Error when synchronizing event', error);
      });
    }
  }, {
    key: "disconnect",
    value: function disconnect() {
      this.isInit = false;
      this.userData = {};
      this.selected = null;
    }
  }, {
    key: "setActiveRoom",
    value: function setActiveRoom(room) {
      var _this3 = this;

      // when we activate a room
      // we need to unsubscribe from typing event
      if (this.selected) {
        this.realtimeAdapter.unsubscribeTyping(); // before we unsubscribe, we need to get the userId first
        // and only unsubscribe if the previous room is having a type of 'single'

        if (this.selected.room_type === 'single') {
          var unsubscribedUserId = this.selected.participants.filter(function (p) {
            return p.email !== _this3.user_id;
          });

          if (unsubscribedUserId.length > 0) {
            this.realtimeAdapter.unsubscribeRoomPresence(unsubscribedUserId[0].email);
          }
        }
      }

      if (room.participants == null) room.participants = [];
      var targetUserId = room.participants.find(function (p) {
        return p.email !== _this3.user_id;
      });
      this.chatmateStatus = null;
      this.isTypingStatus = null;
      this.selected = room; // found a bug where there's a race condition, subscribing to mqtt
      // while mqtt is still connecting, so we'll have to do this hack

      var initialSubscribe = setInterval(function () {
        // Clear Interval when realtimeAdapter has been Populated
        if (_this3.debugMode) {
          console.log('Trying Initial Subscribe');
        }

        if (_this3.realtimeAdapter != null) {
          if (_this3.debugMode) {
            console.log(_this3.realtimeAdapter);
            console.log('MQTT Connected');
          }

          clearInterval(initialSubscribe); // before we unsubscribe, we need to get the userId first
          // and only unsubscribe if the previous room is having a type of 'single'

          if (room.room_type === 'single' && targetUserId != null) {
            _this3.realtimeAdapter.subscribeRoomPresence(targetUserId.email);
          } // we need to subscribe to new room typing event now


          if (_this3.selected != null && !_this3.selected.isChannel) {
            _this3.realtimeAdapter.subscribeTyping(room.id);

            _this3.events.emit('room-changed', _this3.selected);
          }

          if (_this3.debugMode && _this3.realtimeAdapter == null) {
            console.log('Retry');
          }
        } else {
          if (_this3.debugMode) {
            console.log('MQTT Not Connected, yet');
          }
        }
      }, 3000);
    }
    /**
     * Chat with targetted email
     * @param userId {string} - target userId
     * @param options {object} - optional data sent to qiscus database
     * @param distinct_id {string | optional} - unique string to differentiate chat room with same target
     * @return room <Room>
     */

  }, {
    key: "chatTarget",
    value: function chatTarget(userId) {
      var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      // make sure data already loaded first (user already logged in)
      if (this.userData.length != null) return false;
      var self = this;
      var initialMessage = options ? options.message : null;
      var distinctId = options.distinctId;
      self.isLoading = true;
      self.isTypingStatus = ''; // Create room

      return this.roomAdapter.getOrCreateRoom(userId, options, distinctId).then(function (response) {
        var room = new _Room["default"](response);
        self.last_received_comment_id = self.last_received_comment_id < room.last_comment_id ? room.last_comment_id : self.last_received_comment_id;
        self.isLoading = false;
        self.setActiveRoom(room); // id of last comment on this room

        var lastComment = room.comments[room.comments.length - 1];
        if (lastComment) self.readComment(room.id, lastComment.id);
        self.events.emit('chat-room-created', {
          room: room
        });
        if (!initialMessage) return room;
        var topicId = room.id;
        var message = initialMessage;
        self.sendComment(topicId, message).then()["catch"](function (err) {
          console.error('Error when submit comment', err);
        });
        return Promise.resolve(room);
      }, function (err) {
        console.error('Error when creating room', err);
        self.isLoading = false;
        return Promise.reject(err);
      });
    }
    /**
     *
     * Open a group chat or target a specific room id
     *
     * @param {int} id
     * @returns Room <Room>
     * @memberof QiscusSDK
     */

  }, {
    key: "chatGroup",
    value: function chatGroup(id) {
      var self = this;
      if (!self.isInit) return;
      return self.getRoomById(id).then(function (response) {
        return Promise.resolve(response);
      }, function (err) {
        return Promise.reject(err);
      });
    }
    /**
     * @param {int} id - Room Id
     * @return {Room} Room data
     */

  }, {
    key: "getRoomById",
    value: function getRoomById(id) {
      var _this4 = this;

      if (!this.isInit) return;
      var self = this;
      self.isLoading = true;
      self.isTypingStatus = '';
      return self.roomAdapter.getRoomById(id).then(function (response) {
        // make sure the room hasn't been pushed yet
        var roomData = response.results.room;
        roomData.name = roomData.room_name;
        roomData.comments = response.results.comments.reverse();
        var room = new _Room["default"](roomData);
        self.last_received_comment_id = self.last_received_comment_id < room.last_comment_id ? room.last_comment_id : self.last_received_comment_id;
        self.setActiveRoom(room);
        self.isLoading = false; // id of last comment on this room

        var lastComment = room.comments[room.comments.length - 1];
        if (lastComment) self.readComment(room.id, lastComment.id);

        if (room.isChannel) {
          _this4.realtimeAdapter.subscribeChannel(_this4.AppId, room.unique_id);
        }

        return Promise.resolve(room);
      }, function (error) {
        console.error('Error getting room by id', error);
        return Promise.reject(error);
      });
    }
    /**
     * @param {int} id - Room Id
     * @param {string} roomName
     * @param {string} avatarURL
     * @return {Room} Room data
     */

  }, {
    key: "getOrCreateRoomByUniqueId",
    value: function getOrCreateRoomByUniqueId(id, roomName, avatarURL) {
      var _this5 = this;

      var self = this;
      self.isLoading = true;
      self.isTypingStatus = '';
      return self.roomAdapter.getOrCreateRoomByUniqueId(id, roomName, avatarURL).then(function (response) {
        // make sure the room hasn't been pushed yet
        var room = new _Room["default"](response);
        self.last_received_comment_id = self.last_received_comment_id < room.last_comment_id ? room.last_comment_id : self.last_received_comment_id;
        self.setActiveRoom(room);
        self.isLoading = false;
        var lastComment = room.comments[room.comments.length - 1];
        if (lastComment) self.readComment(room.id, lastComment.id);

        _this5.realtimeAdapter.subscribeChannel(_this5.AppId, room.unique_id);

        return Promise.resolve(room); // self.events.emit('group-room-created', self.selected)
      }, function (error) {
        // console.error('Error getting room by id', error)
        return Promise.reject(error);
      });
    }
  }, {
    key: "getOrCreateRoomByChannel",
    value: function getOrCreateRoomByChannel(channel, name, avatarURL) {
      return this.getOrCreateRoomByUniqueId(channel, name, avatarURL);
    }
    /**
     * TODO: This operation is heavy, let's find another way
     *
     * @memberof QiscusSDK
     */

  }, {
    key: "sortComments",
    value: function sortComments() {
      this.selected && this.selected.comments.sort(function (leftSideComment, rightSideComment) {
        return leftSideComment.unix_timestamp - rightSideComment.unix_timestamp;
      });
    }
  }, {
    key: "loadRoomList",
    value: function () {
      var _loadRoomList = (0, _asyncToGenerator2["default"])(
      /*#__PURE__*/
      _regenerator["default"].mark(function _callee() {
        var params,
            rooms,
            _args = arguments;
        return _regenerator["default"].wrap(function _callee$(_context) {
          while (1) {
            switch (_context.prev = _context.next) {
              case 0:
                params = _args.length > 0 && _args[0] !== undefined ? _args[0] : {};
                _context.next = 3;
                return this.userAdapter.loadRoomList(params);

              case 3:
                rooms = _context.sent;
                return _context.abrupt("return", rooms.map(function (room) {
                  room.last_comment_id = room.last_comment.id;
                  room.last_comment_message = room.last_comment.message;
                  room.last_comment_message_created_at = room.last_comment.timestamp;
                  room.room_type = room.chat_type;
                  room.comments = [];
                  return new _Room["default"](room);
                }));

              case 5:
              case "end":
                return _context.stop();
            }
          }
        }, _callee, this);
      }));

      function loadRoomList() {
        return _loadRoomList.apply(this, arguments);
      }

      return loadRoomList;
    }()
  }, {
    key: "loadComments",
    value: function loadComments(roomId) {
      var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      var self = this;
      return self.userAdapter.loadComments(roomId, options).then(function (response) {
        self.selected.receiveComments(response.reverse());
        self.sortComments();
        return Promise.resolve(response);
      }, function (error) {
        console.error('Error loading comments', error);
        return Promise.reject(error);
      });
    }
  }, {
    key: "loadMore",
    value: function loadMore(lastCommentId) {
      var options = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};
      options.last_comment_id = lastCommentId;
      options.after = false;
      return this.loadComments(this.selected.id, options);
    }
    /**
     *
     * Search Qiscus Messages
     *
     * @param {any} [params={query,room_id,last_comment_id}]
     * @memberof qiscusSDK
     */

  }, {
    key: "searchMessages",
    value: function () {
      var _searchMessages = (0, _asyncToGenerator2["default"])(
      /*#__PURE__*/
      _regenerator["default"].mark(function _callee2() {
        var params,
            messages,
            _args2 = arguments;
        return _regenerator["default"].wrap(function _callee2$(_context2) {
          while (1) {
            switch (_context2.prev = _context2.next) {
              case 0:
                params = _args2.length > 0 && _args2[0] !== undefined ? _args2[0] : {};
                console.warn('Deprecated: search message will be removed on next release');
                _context2.next = 4;
                return this.userAdapter.searchMessages(params);

              case 4:
                messages = _context2.sent;
                return _context2.abrupt("return", messages.map(function (message) {
                  return new _Comment["default"](message);
                }));

              case 6:
              case "end":
                return _context2.stop();
            }
          }
        }, _callee2, this);
      }));

      function searchMessages() {
        return _searchMessages.apply(this, arguments);
      }

      return searchMessages;
    }()
  }, {
    key: "updateProfile",
    value: function updateProfile(user) {
      var _this6 = this;

      return this.userAdapter.updateProfile(user).then(function (res) {
        _this6.events.emit('profile-updated', user);
      }, function (err) {
        return console.log(err);
      });
    }
  }, {
    key: "getNonce",
    value: function getNonce() {
      return _superagent["default"].post("".concat(this.baseURL, "/api/v2/sdk/auth/nonce")).send().set('qiscus_sdk_app_id', "".concat(this.AppId)).set('qiscus_sdk_version', "".concat(this.version)).then(function (res) {
        return Promise.resolve(res.body.results);
      }, function (err) {
        return Promise.reject(err);
      });
    }
  }, {
    key: "verifyIdentityToken",
    value: function verifyIdentityToken(identityToken) {
      return _superagent["default"].post("".concat(this.baseURL, "/api/v2/sdk/auth/verify_identity_token")).send({
        identity_token: identityToken
      }).set('qiscus_sdk_app_id', "".concat(this.AppId)).set('qiscus_sdk_version', "".concat(this.version)).then(function (res) {
        return Promise.resolve(res.body.results);
      }, function (err) {
        return Promise.reject(err);
      });
    }
    /**
     *
     * Step of submitting:
     * - we need to create a new comment object
     * - attach it with negative number id, and also the uniqueId, uniqueId is used
     *   to target this particular comment when there's response from server (sent, delivered state)
     * @param {Int} topicId - the topic id of comment to be submitted
     * @param {String} commentMessage - comment to be submitted
     * @return {Promise}
     */
    // #region sendComment

  }, {
    key: "sendComment",
    value: function sendComment(topicId, commentMessage, uniqueId) {
      var type = arguments.length > 3 && arguments[3] !== undefined ? arguments[3] : 'text';
      var payload = arguments.length > 4 ? arguments[4] : undefined;
      var extras = arguments.length > 5 ? arguments[5] : undefined;
      var self = this; // set extra data, etc

      if (self.options.prePostCommentCallback) {
        self.options.prePostCommentCallback(commentMessage);
      }
      /**
       * example:
       * commentFormaterCallback(msg) {
       *  return filterBadWords(msg) // define your own filter function and return its' value
       * }
       */


      if (self.options.commentFormaterCallback) {
        commentMessage = self.options.commentFormaterCallback(commentMessage);
      }

      self.pendingCommentId--;
      var commentData = {
        message: commentMessage,
        username_as: this.username,
        username_real: this.user_id,
        user_avatar_url: this.userData.avatar_url,
        id: parseInt(Math.random() * 100000000),
        type: type || 'text',
        timestamp: (0, _format["default"])(new Date()),
        unique_id: uniqueId
      };
      if (type !== 'text') commentData.payload = JSON.parse(payload);
      var pendingComment = self.prepareCommentToBeSubmitted(commentData); // push this comment unto active room

      if (type === 'reply') {
        // change payload for pendingComment
        // get the comment for current replied id
        var parsedPayload = JSON.parse(payload);
        var repliedMessage = self.selected.comments.find(function (cmt) {
          return cmt.id === parsedPayload.replied_comment_id;
        });
        parsedPayload.replied_comment_message = repliedMessage.type === 'reply' ? repliedMessage.payload.text : repliedMessage.message;
        parsedPayload.replied_comment_sender_username = repliedMessage.username_as;
        pendingComment.payload = parsedPayload;
      }

      if (self.selected) self.selected.comments.push(pendingComment);
      var extrasToBeSubmitted = extras || self.extras;
      return this.userAdapter.postComment(topicId, commentMessage, pendingComment.unique_id, type, payload, extrasToBeSubmitted).then(function (res) {
        if (!self.selected) return Promise.resolve(res); // When the posting succeeded, we mark the Comment as sent,
        // so all the interested party can be notified.

        pendingComment.markAsSent();
        pendingComment.id = res.id;
        pendingComment.before_id = res.comment_before_id; // update the timestamp also then re-sort the comment list

        pendingComment.unix_timestamp = res.unix_timestamp;
        self.sortComments();
        return Promise.resolve(res);
      }, function (err) {
        pendingComment.markAsFailed();
        return Promise.reject(err);
      });
    } // #endregion

  }, {
    key: "getUsers",
    value: function getUsers() {
      var query = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : '';
      var page = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 1;
      var limit = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : 20;
      return this.HTTPAdapter.get_request('api/v2/sdk/get_user_list').query({
        token: this.userData.token,
        query: query,
        page: page,
        limit: limit
      }).then(function (resp) {
        return Promise.resolve(resp.body.results);
      });
    }
  }, {
    key: "getRoomParticipants",
    value: function getRoomParticipants(roomUniqueId) {
      var offset = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
      return this.HTTPAdapter.get_request('api/v2/sdk/room_participants').query({
        token: this.userData.token,
        room_unique_id: roomUniqueId,
        offset: offset
      }).then(function (resp) {
        return Promise.resolve(resp.body.results);
      });
    }
  }, {
    key: "resendComment",
    value: function resendComment(comment) {
      var self = this;
      var room = self.selected;
      var pendingComment = room.comments.find(function (cmtToFind) {
        return cmtToFind.id === comment.id;
      });
      var extrasToBeSubmitted = self.extras;
      return this.userAdapter.postComment(room.id, pendingComment.message, pendingComment.unique_id, comment.type, comment.payload, extrasToBeSubmitted).then(function (res) {
        // When the posting succeeded, we mark the Comment as sent,
        // so all the interested party can be notified.
        pendingComment.markAsSent();
        pendingComment.id = res.id;
        pendingComment.before_id = res.comment_before_id;
        return new Promise(function (resolve, reject) {
          return resolve(self.selected);
        });
      }, function (err) {
        pendingComment.markAsFailed();
        return new Promise(function (resolve, reject) {
          return reject(err);
        });
      });
    }
  }, {
    key: "prepareCommentToBeSubmitted",
    value: function prepareCommentToBeSubmitted(comment) {
      var commentToBeSubmitted, uniqueId;
      commentToBeSubmitted = new _Comment["default"](comment); // We're gonna use timestamp for uniqueId for now.
      // "bq" stands for "Bonjour Qiscus" by the way.

      uniqueId = 'bq' + Date.now();
      if (comment.unique_id) uniqueId = comment.unique_id;
      commentToBeSubmitted.attachUniqueId(uniqueId);
      commentToBeSubmitted.markAsPending();
      commentToBeSubmitted.isDelivered = false;
      commentToBeSubmitted.isSent = false;
      commentToBeSubmitted.isRead = false;
      commentToBeSubmitted.unix_timestamp = Math.round(new Date().getTime() / 1000);
      return commentToBeSubmitted;
    }
    /**
     * Update room
     * @param {id, room_name, avatar_url, options} args
     * @return Promise
     */

  }, {
    key: "updateRoom",
    value: function updateRoom(args) {
      return this.roomAdapter.updateRoom(args);
    }
  }, {
    key: "removeSelectedRoomParticipants",
    value: function removeSelectedRoomParticipants() {
      var values = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : [];
      var payload = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'id';

      if (!values) {
        return Promise.reject(new Error('Please gives an array values.'));
      }

      var participants = this.selected.participants;

      if (!participants) {
        return Promise.reject(new Error('Nothing selected room chat.'));
      } // start to changes selected participants with newest values


      var participantsExclude = participants;

      if (payload === 'id') {
        participantsExclude = participants.filter(function (participant) {
          return values.indexOf(participant.id) <= -1;
        });
      }

      if (payload === 'email') {
        participantsExclude = participants.filter(function (participant) {
          return values.indexOf(participant.email) <= -1;
        });
      }

      if (payload === 'username') {
        participantsExclude = participants.filter(function (participant) {
          return values.indexOf(participant.username) <= -1;
        });
      }

      this.selected.participants = participantsExclude;
      return Promise.resolve(participants);
    }
    /**
     * Create group chat room
     * @param {string} name - Chat room name
     * @param {string[]} emails - Participant to be invited
     * @returns {Promise.<Room, Error>} - Room detail
     */

  }, {
    key: "createGroupRoom",
    value: function createGroupRoom(name, emails, options) {
      var self = this;
      if (!this.isLogin) throw new Error('Please initiate qiscus SDK first');
      return new _utils.GroupChatBuilder(this.roomAdapter).withName(name).withOptions(options).addParticipants(emails).create().then(function (res) {
        self.events.emit('group-room-created', res);
        return Promise.resolve(res);
      });
    }
    /**
     * Add array of participant into a group
     *
     * @param {any} roomId the room id this file is required for selected room_id to be process
     * @param {any} emails emails is must be an array
     * @returns Promise
     * @memberof QiscusSDK
     */

  }, {
    key: "addParticipantsToGroup",
    value: function addParticipantsToGroup(roomId, emails) {
      var self = this;

      if (!Array.isArray(emails)) {
        throw new Error("emails' must be type of Array");
      }

      return self.roomAdapter.addParticipantsToGroup(roomId, emails).then(function (res) {
        self.events.emit('participants-added', res);
        return Promise.resolve(res);
      }, function (err) {
        return Promise.reject(err);
      });
    }
    /**
     * Remove array of participant from a group
     *
     * @param {any} roomId the room id this file is required for selected room_id to be process
     * @param {any} emails emails is must be an array
     * @returns Promise
     * @memberof QiscusSDK
     */

  }, {
    key: "removeParticipantsFromGroup",
    value: function removeParticipantsFromGroup(roomId, emails) {
      var self = this;

      if (!Array.isArray(emails)) {
        throw new Error("emails' must be type of Array");
      }

      return self.roomAdapter.removeParticipantsFromGroup(roomId, emails).then(function (res) {
        self.events.emit('participants-removed', emails);
        return Promise.resolve(res);
      }, function (err) {
        return Promise.reject(err);
      });
    }
    /**
     * Get user block list
     *
     * @param {any} page the page is optional, default=1
     * @param {any} limit the limit is optional, default=20
     * @returns Promise
     * @memberof QiscusSDK
     */

  }, {
    key: "getBlockedUser",
    value: function getBlockedUser() {
      var page = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 1;
      var limit = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 20;
      var self = this;
      return self.userAdapter.getBlockedUser(page, limit).then(function (res) {
        return Promise.resolve(res);
      }, function (err) {
        return Promise.reject(err);
      });
    }
    /**
     * Add user to block list
     *
     * @param {any} email the email is required
     * @returns Promise
     * @memberof QiscusSDK
     */

  }, {
    key: "blockUser",
    value: function blockUser(email) {
      var self = this;
      return self.userAdapter.blockUser(email).then(function (res) {
        self.events.emit('block-user', res);
        return Promise.resolve(res);
      }, function (err) {
        return Promise.reject(err);
      });
    }
    /**
     * Remove user from block list
     *
     * @param {any} email the email is required
     * @returns Promise
     * @memberof QiscusSDK
     */

  }, {
    key: "unblockUser",
    value: function unblockUser(email) {
      var self = this;
      return self.userAdapter.unblockUser(email).then(function (res) {
        self.events.emit('unblock-user', res);
        return Promise.resolve(res);
      }, function (err) {
        return Promise.reject(err);
      });
    }
  }, {
    key: "upload",
    value: function upload(file, callback) {
      return _superagent["default"].post(this.uploadURL).attach('file', file).field('token', this.userData.token).set('qiscus_sdk_app_id', this.AppId).set('qiscus_sdk_token', this.userData.token).set('qiscus_sdk_user_id', this.user_id).on('progress', function (event) {
        if (event.direction === 'upload') callback(null, event);
      }).then(function (resp) {
        var url = resp.body.results.file.url;
        callback(null, null, resp.body.results.file.url);
        return Promise.resolve(url);
      })["catch"](function (error) {
        callback(error);
        return Promise.reject(error);
      });
    }
    /**
     * Upload a file to qiscus sdk server
     *
     * @param {any} roomId the room id this file need to be submitted to
     * @param {any} file you can get this from event `e.target.files || e.dataTransfer.files`
     * @returns Promise
     * @memberof QiscusSDK
     */

  }, {
    key: "uploadFile",
    value: function uploadFile(roomId, file) {
      var self = this;
      var formData = new FormData();
      formData.append('file', file);
      formData.append('token', self.userData.token);
      var xhr = new XMLHttpRequest();
      xhr.open('POST', "".concat(self.baseURL, "/api/v2/sdk/upload"), true);
      xhr.setRequestHeader('qiscus_sdk_app_id', "".concat(self.AppId));
      xhr.setRequestHeader('qiscus_sdk_user_id', "".concat(self.user_id));
      xhr.setRequestHeader('qiscus_sdk_token', "".concat(self.userData.token));

      xhr.onload = function () {
        if (xhr.status === 200) {
          // file(s) uploaded), let's post to comment
          var url = JSON.parse(xhr.response).results.file.url;
          self.events.emit('fileupload', url); // send

          return self.sendComment(roomId, "[file] ".concat(url, " [/file]"));
        } else {
          return Promise.reject(xhr);
        }
      };

      xhr.send(formData);
    }
  }, {
    key: "addUploadedFile",
    value: function addUploadedFile(name, roomId) {
      this.uploadedFiles.push(new FileUploaded(name, roomId));
    }
  }, {
    key: "removeUploadedFile",
    value: function removeUploadedFile(name, roomId) {
      var index = this.uploadedFiles.findIndex(function (file) {
        return file.name === name && file.roomId === roomId;
      });
      this.uploadedFiles.splice(index, 1);
    }
  }, {
    key: "publishTyping",
    value: function publishTyping(val) {
      this.realtimeAdapter.publishTyping(val);
    }
    /**
     * Params consisted of
     * @param {room_ids} array of room ids
     * @param {room_unique_ids} array of of room unique ids
     * @param {show_participants} show list of participants, default true
     * @param {show_removed} show removed room, default false
     * @returns
     * @memberof QiscusSDK
     */

  }, {
    key: "getRoomsInfo",
    value: function getRoomsInfo(params) {
      return this.userAdapter.getRoomsInfo(params);
    }
  }, {
    key: "deleteComment",
    value: function deleteComment(roomId, commentUniqueIds, isForEveryone, isHard) {
      var _this7 = this;

      if (!Array.isArray(commentUniqueIds)) {
        throw new Error("unique ids' must be type of Array");
      }

      return this.userAdapter.deleteComment(roomId, commentUniqueIds, isForEveryone, isHard).then(function (res) {
        _this7.events.emit('comment-deleted', {
          roomId: roomId,
          commentUniqueIds: commentUniqueIds,
          isForEveryone: isForEveryone,
          isHard: isHard
        });

        return Promise.resolve(res);
      }, function (err) {
        return Promise.reject(err);
      });
    }
  }, {
    key: "clearRoomsCache",
    value: function clearRoomsCache() {
      var _this8 = this;

      // remove all room except currently selected
      if (this.selected) {
        // clear the map
        this.room_name_id_map = (0, _defineProperty2["default"])({}, this.selected.name, this.selected.id); // get current index and array length

        var roomLength = this.rooms.length;
        var curIndex = this.rooms.findIndex(function (room) {
          return room.id === _this8.selected.id;
        });

        if (!(curIndex + 1 === roomLength)) {
          this.rooms.splice(curIndex + 1, roomLength - (curIndex + 1));
        } // ambil ulang cur index nya, klo udah di awal ga perlu lagi kode dibawah ini


        curIndex = this.rooms.findIndex(function (room) {
          return room.id === _this8.selected.id;
        });

        if (curIndex > 0 && this.rooms.length > 1) {
          this.rooms.splice(1, this.rooms.length - 1);
        }
      }
    }
  }, {
    key: "exitChatRoom",
    value: function exitChatRoom() {
      // remove all subscriber
      this.realtimeAdapter.unsubscribeTyping();
      this.realtimeAdapter.unsubscribeRoomPresence();
      this.selected = null;
    }
  }, {
    key: "clearRoomMessages",
    value: function clearRoomMessages(roomIds) {
      if (!Array.isArray(roomIds)) {
        throw new Error('room_ids must be type of array');
      }

      return this.userAdapter.clearRoomMessages(roomIds);
    }
  }, {
    key: "logging",
    value: function logging(message) {
      var params = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : {};

      if (this.debugMode) {
        console.log(message, params);
      }
    }
  }, {
    key: "getTotalUnreadCount",
    value: function getTotalUnreadCount() {
      return this.roomAdapter.getTotalUnreadCount().then(function (response) {
        return Promise.resolve(response);
      }, function (error) {
        return Promise.reject(error);
      });
    }
  }, {
    key: "publishEvent",
    value: function publishEvent() {
      var _this$customEventAdap;

      (_this$customEventAdap = this.customEventAdapter).publishEvent.apply(_this$customEventAdap, arguments);
    }
  }, {
    key: "subscribeEvent",
    value: function subscribeEvent() {
      var _this$customEventAdap2;

      (_this$customEventAdap2 = this.customEventAdapter).subscribeEvent.apply(_this$customEventAdap2, arguments);
    }
  }, {
    key: "unsubscribeEvent",
    value: function unsubscribeEvent() {
      var _this$customEventAdap3;

      (_this$customEventAdap3 = this.customEventAdapter).unsubscribeEvent.apply(_this$customEventAdap3, arguments);
    }
  }, {
    key: "noop",
    value: function noop() {}
  }, {
    key: "logger",
    get: function get() {
      if (this.debugMode) return console.log.bind(console, 'Qiscus ->');
      return this.noop;
    }
  }]);
  return QiscusSDK;
}();

var FileUploaded = function FileUploaded(name, roomId) {
  (0, _classCallCheck2["default"])(this, FileUploaded);
  this.name = name;
  this.roomId = roomId;
  this.progress = 0;
};

var _default = QiscusSDK;
exports["default"] = _default;
module.exports = exports.default;