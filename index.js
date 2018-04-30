import request from "superagent";
import { EventEmitter } from "events";
import format from "date-fns/format";
import distanceInWordsToNow from "date-fns/distance_in_words_to_now";
import Comment from "./lib/Comment";
import Room from "./lib/Room";
import HttpAdapter from "./lib/adapters/http";
import UserAdapter from "./lib/adapters/user";
import RoomAdapter from "./lib/adapters/room";
import MqttAdapter from "./lib/adapters/MqttAdapter";
import MqttCallback from "./lib/adapters/MqttCallback";
import { GroupChatBuilder, scrollToBottom } from "./lib/utils";
import Package from './package.json';

/**
 * Qiscus Web SDK Core Class
 *
 * @export
 * @class QiscusSDK
 * @extends {EventEmitter}
 */
class QiscusSDK extends EventEmitter {
  /**
   * Creates an instance of QiscusSDK.
   * @memberof QiscusSDK
   */
  constructor() {
    super();
    this.rooms = [];
    this.selected = null;
    this.room_name_id_map = {};
    this.pendingCommentId = 0;
    this.uploadedFiles = [];
    this.chatmateStatus = null;
    this.version = `WEB_${Package.version}`;

    this.userData = {};
    // SDK Configuration
    this.AppId = null;
    this.baseURL = "https://api.qiscus.com";
    this.mqttURL = "wss://mqtt.qisc.us:1900/mqtt";
    this.HTTPAdapter = null;
    this.realtimeAdapter = null;
    this.isInit = false;
    this.isSynced = false;
    this.sync = "socket"; // possible values 'socket', 'http', 'both'
    this.httpsync = null;
    this.eventsync = null;
    this.extras = null;
    this.last_received_comment_id = 0;
    this.options = {
      avatar: true
    };

    // UI related Properties
    this.UI = {};
    this.mode = "widget";
    this.avatar = true;
    this.plugins = [];
    this.isLogin = false;
    this.isLoading = false;
    this.isInit = false;
    this.emoji = false;
    this.isTypingStatus = "";
    this.customTemplate = false;
    this.templateFunction = null;
    this.debugMode = false;
    this.debugMQTTMode = false;

    //to prevent double receive newmessages callback
    this.lastReceiveMessages = [];
  }

  /**
   * Initializing the SDK, set Event Listeners (callbacks)
   * @param {any} config - Qiscus SDK Configurations
   * @return {void}
   */
  init(config) {
    // set AppID
    if (!config.AppId) throw new Error("Please provide valid AppId");
    this.AppId = config.AppId;

    if (config.baseURL) this.baseURL = config.baseURL;
    if (config.mqttURL) this.mqttURL = config.mqttURL;
    if (config.sync) this.sync = config.sync;
    if (config.mode) this.mode = config.mode;
    if (config.allowedFileTypes)
      this.allowedFileTypes = config.allowedFileTypes;
    // Let's initialize the app based on options
    if (config.options)
      this.options = Object.assign({}, this.options, config.options);
    if (config.customTemplate) this.customTemplate = config.customTemplate;
    if (config.templateFunction)
      this.templateFunction = config.templateFunction;

    // set Event Listeners
    this.setEventListeners();

    // mini garbage collector
    // window.setInterval(this.clearRoomsCache.bind(this), 90000);
  }

  readComment(roomId, commentId) {
    const self = this;
    const isSelected = self.selected || self.selected.id !== roomId;
    const isChannel = self.selected.isChannel;
    if(!isSelected || isChannel) return false;
    self.userAdapter.updateCommentStatus(roomId, commentId, null)
    .then( res => {
      // ambil semua yang belum di read selain komen ini, kemudian mark as read
      self.sortComments()
    })
  }

  receiveComment(roomId, commentId) {
    const self = this;
    const isSelected = self.selected != null;
    const isChannel = (self.selected) ? self.selected.isChannel : false;
    if(!isSelected || isChannel) return false;
    self.userAdapter.updateCommentStatus(roomId, null, commentId)
    .then( res => {
      // get this room
      // const roomToFind = self.rooms.find(room => room.id == roomId);
      // if (roomToFind) {
      //   roomToFind.comments
      //     .filter(comment => comment.isSent == true && comment.isDelivered == false)
      //     .map(comment => comment.markAsDelivered())
      // }
      // self.emit('comment-delivered', {roomId, commentId});
      self.sortComments()
    })
  }

  setEventListeners() {
    const self = this;
    self.on("room-changed", function(room) {
      this.logging("room changed", room);
      if (self.options.roomChangedCallback)
        self.options.roomChangedCallback(room);
    });

    self.on("file-uploaded", function(url) {
      if (self.options.fileUploadedCallback)
        self.options.fileUploadedCallback(url);
    });

    /**
     * This event will be called when there's new post messages
     * @param {string} data - JSON Response from SYNC API / MQTT
     * @return {void}
     */
    self.on("newmessages", function(comments) {
      // let's convert the data into something we can use
      // first we need to make sure we sort this data out based on room_id
      this.logging("newmessages", comments);

      if (
        this.lastReceiveMessages.length > 0 &&
        this.lastReceiveMessages[0].unique_temp_id == comments[0].unique_temp_id
      ) {
        this.logging("lastReceiveMessages double", comments);
        return;
      }

      this.lastReceiveMessages = comments;

      self._callNewMessagesCallback(comments);
      comments.map(comment => {
        // find this comment room
        const room = self.rooms.find(r => r.id == comment.room_id);
        const isAlreadyRead =
          comment.id <= self.last_received_comment_id ? true : false;
        if (!room) {
          if (!isAlreadyRead) {
            if (self.user_id != comment.email) {
              self.receiveComment(comment.room_id, comment.id);
            }
            self.updateLastReceivedComment(comment.id);
          }
          return false;
        } else {
          // sync ulang jika before id dari komen ini tidak ada di listing komen
          // (ada komen yang hilang berarti)
          // ambil room id, ambil komen terakhir, sync
          const roomLastCommentId =
            room.comments.length > 0
              ? room.comments[room.comments.length - 1].id
              : self.last_received_comment_id;
          const commentBeforeThis = room.comments.find(
            cmt => cmt.id == comment.comment_before_id
          );
          if (!commentBeforeThis && comment.room_id == self.selected.id) {
            this.logging("comment before id not found! ", comment.comment_before_id);

            // need to fix, these method does not work
            // self.synchronize(roomLastCommentId);
            // self.synchronizeEvent(roomLastCommentId);

            this.chatGroup(comment.room_id);
          }
        }

        // pastikan dulu komen ini komen baru, klo komen lama ga usah panggil cb
        const isExistingComment = room.comments.find(
          cmt => cmt.id == comment.id
        );
        const pendingComment = new Comment(comment);
        // set comment metadata (read or delivered) based on current selected room
        const isRoomSelected = !self.selected ? false : room.isCurrentlySelected(self.selected);

        // fetch the comment inside the room
        room.receiveComment(pendingComment);
        room.last_comment_id = pendingComment.id;
        room.last_comment_message = pendingComment.message;
        // update comment status
        // get last comment and update room status for it
        if (!isAlreadyRead && self.user_id != comment.email) {
          self.receiveComment(comment.room_id, comment.id);
        }
        // let's update last_received_comment_id
        self.updateLastReceivedComment(comment.id);
        this.sortComments();
      });
    });

    /**
     * This event will be called when login is sucess
     * Basically, it sets up necessary properties for qiscusSDK
     */
    self.on("login-success", (response) => {
      this.logging("login-success", response);

      const mqttURL = self.mqttURL;
      self.isLogin = true;
      self.userData = response.results.user;
      self.last_received_comment_id = self.userData.last_comment_id;

      // now that we have the token, etc, we need to set all our adapters
      // /////////////// API CLIENT /////////////////
      self.HTTPAdapter = new HttpAdapter(
        self.baseURL,
        self.AppId,
        self.user_id,
        self.version
      );
      self.HTTPAdapter.setToken(self.userData.token);

      // ////////////// CORE BUSINESS LOGIC ////////////////////////
      self.userAdapter = new UserAdapter(self.HTTPAdapter);
      self.roomAdapter = new RoomAdapter(self.HTTPAdapter);
      self.realtimeAdapter = new MqttAdapter(mqttURL, MqttCallback, self);
      self.realtimeAdapter.subscribeUserChannel();
      self.realtimeAdapter.mqtt.on('connect', () => this.onReconnectMqtt());
      window.setInterval(
        () => this.realtimeAdapter.publishPresence(this.user_id),
        3500
      );

      if (self.sync == "http" || self.sync == "both") self.activateSync();
      if (self.options.loginSuccessCallback)
        self.options.loginSuccessCallback(response);
    });

    /**
     * Called when there's something wrong when connecting to qiscus SDK
     */
    self.on("login-error", function(error) {
      if (self.options.loginErrorCallback)
        self.options.loginErrorCallback(error);
    });

    self.on("room-cleared", function(room) {
      // find room
      const roomToClear = self.rooms.find(r => r.unique_id == room.unique_id);
      if (roomToClear) {
        roomToClear.comments.length = 0;
        if (roomToClear.id == self.selected.id) {
          self.selected = null;
          self.selected = roomToClear;
        }
      }
      if (self.options.roomClearedCallback)
        self.options.roomClearedCallback(room);
    });

    self.on("comment-deleted", function(data) {
      // get to the room id and delete the comment
      const { roomId, commentUniqueIds, isForEveryone, isHard } = data;
      const roomToBeFound = self.rooms.find(room => room.id == roomId);
      if (roomToBeFound) {
        // loop through the array of unique_ids
        commentUniqueIds.map(id => {
          const commentToBeFound = roomToBeFound.comments.findIndex(
            comment => comment.unique_id == id
          );
          if (commentToBeFound > -1) {
            if (isHard) {
              roomToBeFound.comments.splice(commentToBeFound, 1);
            } else {
              roomToBeFound.comments[commentToBeFound].message =
                "this message has been deleted";
            }
          }
        });
      }
      if (self.options.commentDeletedCallback)
        self.options.commentDeletedCallback(data);
    });

    /**
     * Called when the comment has been delivered
     */
    self.on("comment-delivered", function(response) {
      if (self.options.commentDeliveredCallback)
        self.options.commentDeliveredCallback(response);
      // find comment with the id or unique id listed from response
      // const commentToFind = self.selected.comments.find(comment =>
      //   comment.id === response.id || comment.uniqueId === response.uniqueId);
    });

    /**
     * Called when new chatroom has been created
     */
    self.on("chat-room-created", function(response) {
      self.isLoading = false;
      if (self.options.chatRoomCreatedCallback)
        self.options.chatRoomCreatedCallback(response);
    });

    /**
     * Called when a new room with type of group has been created
     */
    self.on("group-room-created", function(response) {
      self.isLoading = false;
      if (self.options.groupRoomCreatedCallback)
        self.options.groupRoomCreatedCallback(response);
    });

    /**
     * Called when user clicked on Chat SDK Header
     */
    self.on("header-clicked", function(response) {
      if (self.options.headerClickedCallback)
        self.options.headerClickedCallback(response);
    });

    /**
     * Called when a comment has been read
     */
    self.on("comment-read", function(response) {
      if (self.options.commentReadCallback)
        self.options.commentReadCallback(response);
    });

    /**
     * Called when there's new presence data of currently subscribed target user (last seen timestamp)
     * @param {string} data MQTT Payload with format of "x:xxxxxxxxxxxxx"
     */
    self.on("presence", function(data) {
      const payload = data.split(":");
      if (self.chatmateStatus != payload[0]) {
        self.chatmateStatus =
          payload[0] == 1
            ? "Online"
            : `Last seen ${distanceInWordsToNow(
                Number(payload[1].substring(0, 13))
              )}`;
      }
      if (self.options.presenceCallback) self.options.presenceCallback(data);
    });

    self.on("typing", function(data) {
      if (self.options.typingCallback) self.options.typingCallback(data);
    });

    /**
     * Called when user clicked on Message Info
     */
    self.on("message-info", function(response) {
      if (self.options.messageInfoCallback)
        self.options.messageInfoCallback(response);
    });
  }

  onReconnectMqtt() {
    if (!this.selected) return;
    if (this.options.onReconnectCallback) this.options.onReconnectedCallback();
    this.loadComments(this.selected.id);
  }

  _callNewMessagesCallback(comments) {
    if (this.options.newMessagesCallback)
      this.options.newMessagesCallback(comments);
    // let's sort the comments
  }

  updateLastReceivedComment(id) {
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
  setUser(userId, key, username, avatarURL) {
    this.user_id = userId;
    this.key = key;
    this.username = username;
    this.avatar_url = avatarURL;

    // Connect to Login or Register API
    this.connectToQiscus().then(response => {
      if (response.status != 200)
        return this.emit("login-error", response.text);
      this.isInit = true;
      this.emit("login-success", response);
    });
  }

  connectToQiscus() {
    let body = {
      email: this.user_id,
      password: this.key,
      username: this.username
    };
    if (this.avatar_url) body.avatar_url = this.avatar_url;
    // let resp = await r2.post(`${this.baseURL}/api/v2/sdk/login_or_register`, {json: obj}).json
    // return resp
    return new Promise((resolve, reject) => {
      let req = request.post(`${this.baseURL}/api/v2/sdk/login_or_register`);
      req
        .send(body)
        .set("Content-Type", "application/x-www-form-urlencoded")
        .set("qiscus_sdk_app_id", `${this.AppId}`)
        .set("qiscus_sdk_version", `${this.version}`)
        .end((err, res) => {
          if (err) return resolve(res);
          return resolve(res.body);
        });
    });
  }

  setUserWithIdentityToken(data) {
    if (!data || !"user" in data) return this.emit("login-error", data);
    this.email = data.user.email;
    this.user_id = data.user.email;
    this.key = data.identity_token;
    this.username = data.user.username;
    this.avatar_url = data.user.avatar_url;
    this.isInit = true;
    this.emit("login-success", { results: data });
  }

  logout() {
    this.selected = null;
    this.isInit = false;
    this.isLogin = false;
    this.userData = null;
  }

  // Activate Sync Feature if `http` or `both` is chosen as sync value when init
  activateSync() {
    const self = this;
    if (self.isSynced) return false;
    self.isSynced = true;
    self.httpsync = window.setInterval(() => self.synchronize(), 3500);
    self.eventsync = window.setInterval(() => self.synchronizeEvent(), 3500);
  }

  disableSync() {
    const self = this;
    self.isSynced = false;
    window.clearInterval(self.httpsync);
    window.clearInterval(self.eventsync);
  }

  /**
   * This method let us get new comments from server
   * If comment count > 0 then we have new message
   */
  synchronize(last_id) {
    const idToBeSynced = last_id || this.last_received_comment_id;
    this.userAdapter.sync(idToBeSynced).then(comments => {
      if (comments.length > 0) this.emit("newmessages", comments);
    });
  }

  synchronizeEvent(last_id) {
    const self = this;
    const idToBeSynced = last_id || this.last_received_comment_id;
    this.userAdapter.syncEvent(idToBeSynced).then(res => {
      res.events.map(e => {
        if ("deleted_messages" in e.payload.data) {
          e.payload.data.deleted_messages.map(msgRoom => {
            self.emit("comment-deleted", {
              roomId: msgRoom.room_id,
              commentUniqueIds: msgRoom.message_unique_ids,
              isForEveryone: true,
              isHard: e.payload.data.is_hard_delete
            });
          });
        } else if ("deleted_rooms" in e.payload.data) {
          // get id of all rooms available
          e.payload.data.deleted_rooms.forEach(room => {
            self.emit("room-cleared", room);
          });
        }
      });
    });
  }

  disconnect() {
    this.isInit = false;
    this.userData = {};
    this.selected = null;
  }

  setActiveRoom(room) {
    // when we activate a room
    // we need to unsubscribe from typing event
    if (this.selected) {
      this.realtimeAdapter.unsubscribeTyping();
      // before we unsubscribe, we need to get the userId first
      // and only unsubscribe if the previous room is having a type of 'single'
      if (this.selected.room_type == "single") {
        const unsubscribedUserId = this.selected.participants.filter(
          p => p.email != this.user_id
        );
        if (unsubscribedUserId.length > 0)
          this.realtimeAdapter.unsubscribeRoomPresence(
            unsubscribedUserId[0].email
          );
      }
    }
    if (room.participants == null) room.participants = []
    const targetUserId = room.participants.filter(p => p.email != this.user_id);
    if (room.room_type === "single" && targetUserId.length > 0)
      this.realtimeAdapter.subscribeRoomPresence(targetUserId[0].email);
    this.chatmateStatus = null;
    this.isTypingStatus = null;
    this.selected = room;
    // we need to subscribe to new room typing event now
    if (!this.selected.isChannel) {
      this.realtimeAdapter.subscribeTyping(room.id);
      this.emit('room-changed', this.selected);
    }
  }

  /**
   * Chat with targetted email
   * @param userId {string} - target userId
   * @param options {object} - optional data sent to qiscus database
   * @param distinct_id {string | optional} - unique string to differentiate chat room with same target
   * @return room <Room>
   */
  chatTarget(userId, options = {}) {
    // make sure data already loaded first (user already logged in)
    if (this.userData.length != null) return false;

    const self = this;
    const initialMessage = options ? options.message : null;
    const distinctId = options.distinctId;

    self.isLoading = true;
    self.isTypingStatus = "";

    // We need to get room id 1st, based on room_name_id_map
    const roomId = self.room_name_id_map[userId] || null;
    let room = self.rooms.find(r => r.id == roomId);

    // for now, lets user always reload since message unreliabilit
    if (room) {
      // => Room is Found, just use this, no need to reload
      room.last_comment_id =
        room.comments.length <= 0
          ? null
          : room.comments[room.comments.length - 1].id;
      self.setActiveRoom(room);
      // make sure we always get the highest value of last_received_comment_id
      self.last_received_comment_id =
        self.last_received_comment_id < room.last_comment_id
          ? room.last_comment_id
          : self.last_received_comment_id;
      self.isLoading = false;
      self.emit("chat-room-created", { room: room });
      // id of last comment on this room
      const last_comment = room.comments[room.comments.length - 1];
      if (last_comment) self.readComment(room.id, last_comment.id);

      return this.roomAdapter.getOrCreateRoom(userId, options, distinctId).then(
      response => {
        const loaded_room = new Room(response);
        room.comments = loaded_room.comments;
        room.participants = loaded_room.participants;
        room.options = loaded_room.options;

        return Promise.resolve(room)
      }, (err) => {
        console.error('Error when creating room', err)
        self.isLoading = false
        return Promise.reject(err)
      })

    }

    // Create room
    return this.roomAdapter.getOrCreateRoom(userId, options, distinctId).then(
      response => {
        room = new Room(response);
        self.room_name_id_map[userId] = room.id;
        self.last_received_comment_id =
          self.last_received_comment_id < room.last_comment_id
            ? room.last_comment_id
            : self.last_received_comment_id;
        self.rooms.push(room);
        self.isLoading = false;
        self.setActiveRoom(room);
        // id of last comment on this room
        const last_comment = room.comments[room.comments.length - 1];
        if (last_comment) self.readComment(room.id, last_comment.id);
        self.emit("chat-room-created", { room: room });

        if (!initialMessage) return room;
        const topicId = room.id;
        const message = initialMessage;
        self
          .sendComment(topicId, message)
          .then()
          .catch(err => {
            console.error('Error when submit comment', err)
          })
        return Promise.resolve(room)
      }, (err) => {
        console.error('Error when creating room', err)
        self.isLoading = false
        return Promise.reject(err)
      })
  }

  /**
   *
   * Open a group chat or target a specific room id
   *
   * @param {int} id
   * @returns Room <Room>
   * @memberof QiscusSDK
   */
  chatGroup(id) {
    const self = this;
    if (!self.isInit) return;
    return self.getRoomById(id).then(
      response => {
        return Promise.resolve(response);
      },
      err => Promise.reject(err)
    );
  }

  /**
   * @param {int} id - Room Id
   * @return {Room} Room data
   */
  getRoomById(id) {
    const self = this;
    self.isLoading = true;
    self.isTypingStatus = "";
    return self.roomAdapter.getRoomById(id).then(
      response => {
        // make sure the room hasn't been pushed yet
        let room;
        let roomToFind = self.rooms.find(r => r.id == id);
        let roomData = response.results.room;
        roomData.name = roomData.room_name;
        roomData.comments = response.results.comments.reverse();
        room = new Room(roomData);

        if (!roomToFind) {
          self.room_name_id_map[room.name] = room.id;
          self.rooms.push(room);
        } else {
          if (roomToFind.comments.length > 0)
            roomToFind.last_comment_id =
              roomToFind.comments[roomToFind.comments.length - 1].id;
          roomToFind.comments = room.comments;
          room = roomToFind;
        }

        self.last_received_comment_id =
          self.last_received_comment_id < room.last_comment_id
            ? room.last_comment_id
            : self.last_received_comment_id;
        const roomToBeActivated = room || roomFind;
        self.setActiveRoom(roomToBeActivated);
        self.isLoading = false;
        // id of last comment on this room
        const last_comment = room.comments[room.comments.length - 1];
        if (last_comment) self.readComment(room.id, last_comment.id);
        return Promise.resolve(room);
      },
      error => {
        console.error("Error getting room by id", error);
        return Promise.reject(error);
      }
    );
  }

  /**
   * @param {int} id - Room Id
   * @param {string} room_name
   * @param {string} avatar_url
   * @return {Room} Room data
   */
  getOrCreateRoomByUniqueId(id, room_name, avatar_url) {
    const self = this;
    self.isLoading = true;
    self.isTypingStatus = "";
    return self.roomAdapter.getOrCreateRoomByUniqueId(id, room_name, avatar_url)
      .then((response) => {
        // make sure the room hasn't been pushed yet
        let room
        let roomToFind = self.rooms.find(room => { id: id});
        if (!roomToFind) {
          room = new Room(response)
          self.room_name_id_map[room.name] = room.id
          self.rooms.push(room)
        } else {
          room = roomToFind
        }
        self.last_received_comment_id = (self.last_received_comment_id < room.last_comment_id) ? room.last_comment_id : self.last_received_comment_id
        self.setActiveRoom(room)
        self.isLoading = false
        const last_comment = room.comments[room.comments.length-1];
        if (last_comment) self.readComment(room.id, last_comment.id);
        this.realtimeAdapter.subscribeChannel(this.AppId, room.unique_id);
        return Promise.resolve(room);
        // self.emit('group-room-created', self.selected)
      }, (error) => {
        // console.error('Error getting room by id', error)
        return Promise.reject(error);
      })
  }

  getOrCreateRoomByChannel(channel, name, avatar_url) {
    return this.getOrCreateRoomByUniqueId(channel, name, avatar_url);
  }

  /**
   * TODO: This operation is heavy, let's find another way
   *
   * @memberof QiscusSDK
   */
  sortComments() {
    this.selected && this.selected.comments.sort(function(leftSideComment, rightSideComment) {
      return leftSideComment.unix_timestamp - rightSideComment.unix_timestamp;
    });
  }

  async loadRoomList(params = {}) {
    const rooms = await this.userAdapter.loadRoomList(params);
    return rooms.map(room => {
      room.last_comment_id = room.last_comment.id;
      room.last_comment_message = room.last_comment.message;
      room.last_comment_message_created_at = room.last_comment.timestamp;
      room.room_type = room.chat_type;
      room.comments = [];
      return new Room(room);
    });
  }

  loadComments(room_id, options = {}) {
    const self = this;
    return self.userAdapter.loadComments(room_id, options).then(
      response => {
        self.selected.receiveComments(response.reverse());
        self.sortComments();
        return new Promise((resolve, reject) => resolve(response));
      },
      error => {
        console.error("Error loading comments", error);
        return new Promise(reject => reject(error));
      }
    );
  }

  loadMore(last_comment_id, options = {}) {
    options.last_comment_id = last_comment_id;
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
  async searchMessages(params = {}) {
    const messages = await this.userAdapter.searchMessages(params);
    return messages.map(message => {
      return new Comment(message);
    });
  }

  getNonce() {
    // request.set('qiscus_sdk_user_id', `${this.userId}`);
    // request.set('qiscus_sdk_to', `${this.token}`);
    return request
      .post(`${this.baseURL}/api/v2/sdk/auth/nonce`)
      .send()
      .set("qiscus_sdk_app_id", `${this.AppId}`)
      .set("qiscus_sdk_version", `${this.version}`)
      .then(
        res => Promise.resolve(res.body.results),
        err => Promise.reject(err)
      );
  }

  verifyIdentityToken(identity_token) {
    return request
      .post(`${this.baseURL}/api/v2/sdk/auth/verify_identity_token`)
      .send({ identity_token })
      .set("qiscus_sdk_app_id", `${this.AppId}`)
      .set("qiscus_sdk_version", `${this.version}`)
      .then(
        res => Promise.resolve(res.body.results),
        err => Promise.reject(err)
      );
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
  // #region
  sendComment(
    topicId,
    commentMessage,
    uniqueId,
    type = "text",
    payload,
    extras
  ) {
    var self = this;
    // set extra data, etc
    if (self.options.prePostCommentCallback)
      self.options.prePostCommentCallback(commentMessage);
    self.pendingCommentId--;
    var pendingCommentDate = new Date();
    var commentData = {
      message: commentMessage,
      username_as: this.username,
      username_real: this.user_id,
      user_avatar_url: this.userData.avatar_url,
      id: parseInt(Math.random() * 100000000),
      type: type || "text",
      timestamp: format(new Date()),
      unique_id: uniqueId
    };
    if (type != "text") commentData.payload = JSON.parse(payload);
    var pendingComment = self.prepareCommentToBeSubmitted(commentData);

    // push this comment unto active room
    if (type == "reply") {
      // change payload for pendingComment
      // get the comment for current replied id
      var parsedPayload = JSON.parse(payload)
      var replied_message = self.selected.comments.find(cmt => cmt.id == parsedPayload.replied_comment_id)
      parsedPayload.replied_comment_message =
        (replied_message.type == 'reply') ? replied_message.payload.text
                                          : replied_message.message;
      parsedPayload.replied_comment_sender_username = replied_message.username_as
      pendingComment.payload = parsedPayload
    }
    self.selected.comments.push(pendingComment);

    const extrasToBeSubmitted = extras || self.extras;
    return this.userAdapter
      .postComment(
        topicId,
        commentMessage,
        pendingComment.unique_id,
        type,
        payload,
        extrasToBeSubmitted
      )
      .then(
        res => {
          // When the posting succeeded, we mark the Comment as sent,
          // so all the interested party can be notified.
          pendingComment.markAsSent();
          pendingComment.id = res.id;
          pendingComment.before_id = res.comment_before_id;

          const commentBeforeThis = self.selected.comments.find(
            cmt => cmt.id == res.comment_before_id
          );
          if (!commentBeforeThis && res.room_id == self.selected.id) {
            this.logging("comment before id not found! ", res.comment_before_id);

            // need to fix, these method does not work
            // self.synchronize(roomLastCommentId);
            // self.synchronizeEvent(roomLastCommentId);

            this.chatGroup(res.room_id);
          }

          return new Promise((resolve, reject) => resolve(res));
        },
        err => {
          pendingComment.markAsFailed();
          return new Promise((resolve, reject) => reject(err));
        }
      );
  }
  // #endregion

  resendComment(comment) {
    var self = this;
    var room = self.selected;
    var pendingCommentDate = new Date();
    var commentData = {
      message: comment.message,
      username_as: self.username,
      username_real: self.email,
      user_avatar: self.avatar_url,
      id: comment.id,
      unique_id: comment.unique_id
    };
    var pendingComment = room.comments.find(
      cmtToFind => cmtToFind.id == comment.id
    );

    const extrasToBeSubmitted = self.extras;
    return this.userAdapter
      .postComment(
        room.id,
        pendingComment.message,
        pendingComment.unique_id,
        comment.type,
        comment.payload,
        extrasToBeSubmitted
      )
      .then(
        res => {
          // When the posting succeeded, we mark the Comment as sent,
          // so all the interested party can be notified.
          pendingComment.markAsSent();
          pendingComment.id = res.id;
          pendingComment.before_id = res.comment_before_id;
          return new Promise((resolve, reject) => resolve(self.selected));
        },
        err => {
          pendingComment.markAsFailed();
          return new Promise((resolve, reject) => reject(err));
        }
      );
  }

  prepareCommentToBeSubmitted(comment) {
    var commentToBeSubmitted, uniqueId;
    commentToBeSubmitted = new Comment(comment);
    // We're gonna use timestamp for uniqueId for now.
    // "bq" stands for "Bonjour Qiscus" by the way.
    uniqueId = "bq" + Date.now();
    if (comment.unique_id) uniqueId = comment.unique_id;
    commentToBeSubmitted.attachUniqueId(uniqueId);
    commentToBeSubmitted.markAsPending();
    commentToBeSubmitted.isDelivered = false;
    commentToBeSubmitted.isSent = false;
    commentToBeSubmitted.isRead = false;
    commentToBeSubmitted.unix_timestamp = Math.round((new Date()).getTime() / 1000);
    return commentToBeSubmitted;
  }

  /**
   * Update room
   * @param {id, room_name, avatar_url, options} args
   * @return Promise
   */
  updateRoom(args) {
    return this.roomAdapter.updateRoom(args);
  }
  /**
   * Create group chat room
   * @param {string} name - Chat room name
   * @param {string[]} emails - Participant to be invited
   * @returns {Promise.<Room, Error>} - Room detail
   */
  createGroupRoom(name, emails, options) {
    const self = this;
    if (!this.isLogin) throw new Error("Please initiate qiscus SDK first");
    return new GroupChatBuilder(this.roomAdapter)
      .withName(name)
      .withOptions(options)
      .addParticipants(emails)
      .create()
      .then(res => {
        self.emit("group-room-created", res);
        return Promise.resolve(res);
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
  uploadFile(roomId, file) {
    const self = this;
    var formData = new FormData();
    formData.append("file", file);
    formData.append("token", self.userData.token);
    var xhr = new XMLHttpRequest();
    xhr.open("POST", `${self.baseURL}/api/v2/sdk/upload`, true);
    xhr.setRequestHeader("qiscus_sdk_app_id", `${self.AppId}`);
    xhr.setRequestHeader("qiscus_sdk_user_id", `${self.user_id}`);
    xhr.setRequestHeader("qiscus_sdk_token", `${self.userData.token}`);
    xhr.setRequestHeader("qiscus_sdk_version", `${self.version}`);
    xhr.onload = function() {
      if (xhr.status === 200) {
        // file(s) uploaded), let's post to comment
        var url = JSON.parse(xhr.response).results.file.url;
        self.emit("fileupload", url);
        // send
        return self.sendComment(roomId, `[file] ${url} [/file]`);
      } else {
        return Promise.reject(xhr);
      }
    };
    xhr.send(formData);
  }

  addUploadedFile(name, roomId) {
    this.uploadedFiles.push(new FileUploaded(name, roomId));
  }

  removeUploadedFile(name, roomId) {
    const index = this.uploadedFiles.findIndex(
      file => file.name === name && file.roomId === roomId
    );
    this.uploadedFiles.splice(index, 1);
  }

  publishTyping(val) {
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
  getRoomsInfo(params) {
    return this.userAdapter.getRoomsInfo(params);
  }

  deleteComment(roomId, commentUniqueIds, isForEveryone, isHard) {
    if (!Array.isArray(commentUniqueIds))
      throw new Error(`unique ids' must be type of Array`);
    return this.userAdapter
      .deleteComment(roomId, commentUniqueIds, isForEveryone, isHard)
      .then(
        res => {
          this.emit("comment-deleted", {
            roomId,
            commentUniqueIds,
            isForEveryone,
            isHard
          });
          return Promise.resolve(res);
        },
        err => Promise.reject(err)
      );
  }

  clearRoomsCache() {
    // remove all room except currently selected
    if (this.selected) {
      // clear the map
      this.room_name_id_map = { [this.selected.name]: this.selected.id };
      // get current index and array length
      const roomLength = this.rooms.length;
      let curIndex = this.rooms.findIndex(room => room.id == this.selected.id);
      if (!(curIndex + 1 == roomLength))
        this.rooms.splice(curIndex + 1, roomLength - (curIndex + 1));
      // ambil ulang cur index nya, klo udah di awal ga perlu lagi kode dibawah ini
      curIndex = this.rooms.findIndex(room => room.id == this.selected.id);
      if (curIndex > 0 && this.rooms.length > 1)
        this.rooms.splice(1, this.rooms.length - 1);
    }
  }

  exitChatRoom() {
    // remove all subscriber
    this.realtimeAdapter.unsubscribeTyping();
    this.realtimeAdapter.unsubscribeRoomPresence();
    this.selected = null;
  }

  clearRoomMessages(room_ids) {
    if (!Array.isArray(room_ids))
      throw new Error("room_ids must be type of array");
    return this.userAdapter.clearRoomMessages(room_ids);
  }

  logging(message, params = {}) {
    if (this.debugMode) {
      console.log(message, params);
    }
  }

  getTotalUnreadCount() {
    const token = this.HTTPAdapter.token;
    return this.HTTPAdapter.get(`api/v2/sdk/total_unread_count?token=${token}`)
      .then((resp) => resp.body.results.total_unread_count);
  }
}

class FileUploaded {
  constructor(name, roomId) {
    this.name = name;
    this.roomId = roomId;
    this.progress = 0;
  }
}

module.exports = QiscusSDK;
