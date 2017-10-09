import r2 from 'r2';
import {EventEmitter} from 'events';
import {format} from 'date-fns';
import Comment from './lib/Comment';
import Room from './lib/Room';
import HttpAdapter from './lib/adapters/http';
import UserAdapter from './lib/adapters/user';
import RoomAdapter from './lib/adapters/room';
import MqttAdapter from './lib/adapters/MqttAdapter';
import MqttCallback from './lib/adapters/MqttCallback';
import {GroupChatBuilder,scrollToBottom} from './lib/utils';

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
  constructor () {
    super();
    this.rooms                    = [];
    this.selected                 = null;
    this.room_name_id_map         = {};
    this.pendingCommentId         = 0;

    this.userData                 = {};
    // SDK Configuration
    this.baseURL                  = null;
    this.HTTPAdapter              = null;
    this.realtimeAdapter          = null;
    this.isInit                   = false;
    this.isSynced                 = false;
    this.sync                     = 'both'; // possible values 'socket', 'http', 'both'
    this.last_received_comment_id = 0;
    this.options                  = {
      avatar:                       true,
    };

    // UI related Properties
    this.mode            = 'widget';
    this.avatar          = true;
    this.plugins         = [];
    this.isLogin         = false;
    this.isLoading       = false;
    this.emoji           = false;
    this.isTypingStatus  = '';
  }

  /**
  * Initializing the SDK, set Event Listeners (callbacks)
  * @param {any} config - Qiscus SDK Configurations
  * @return {void}
  */
  init (config) {
    // set AppID
    if (!config.AppId) throw new Error('Please provide valid AppId');
    this.baseURL = `https://${config.AppId}.qiscus.com`;

    if (config.sync) this.sync = config.sync;
    if (config.mode) this.mode = config.mode;
    if (config.emoji) this.emoji = config.emoji;
    // Let's initialize the app based on options
    if (config.options) this.options = Object.assign({}, this.options, config.options)

    // set Event Listeners
    this.setEventListeners();
  }

  updateCommentStatus(comment) {
    const self = this;
    if(!self.selected || self.selected.id != comment.room_id) return false;
    self.userAdapter.updateCommentStatus(self.selected.id, comment.id, comment.id)
    .then( res => {
      self.sortComments()
    })
  }

  setEventListeners() {
    const self = this;
    /**
     * This event will be called when there's new post messages
     * @param {string} data - JSON Response from SYNC API / MQTT
     * @return {void}
    */
    self.on('newmessages', function (comments) {
      // let's convert the data into something we can use
      // first we need to make sure we sort this data out based on room_id
      comments.map(comment => {
        // find this comment room
        const room = self.rooms.find(r => r.id == comment.room_id);
        if (!room) return false;
        const pendingComment = new Comment(comment);
        // set comment metadata (read or delivered) based on current selected room
        const isRoomSelected = room.isCurrentlySelected(self.selected);
        if(isRoomSelected) pendingComment.markAsRead();
        if(!isRoomSelected) pendingComment.markAsDelivered();
        // fetch the comment inside the room
        room.receiveComment(pendingComment);
        // let's update last_received_comment_id
        self.last_received_comment_id = (comment.id > self.last_received_comment_id) ? comment.id : self.last_received_comment_id;
        // update comment status, if only self.selected isn't null and it is the correct room
        self.updateCommentStatus(comment);
      })
      
      // call callbacks
      if (self.options.newMessagesCallback) self.options.newMessagesCallback(data);
    })

    /**
     * This event will be called when login is sucess
     * Basically, it sets up necessary properties for qiscusSDK
     */
    self.on('login-success', function (response) {
      const mqttURL = "wss://mqtt.qiscus.com:1886/mqtt";
      self.isLogin  = true;
      self.userData = response.results.user;

      if (self.sync == 'http' || self.sync == 'both') self.activateSync();

      // now that we have the token, etc, we need to set all our adapters
      // /////////////// API CLIENT /////////////////
      self.HTTPAdapter  = new HttpAdapter(self.baseURL);
      self.HTTPAdapter.setToken(self.userData.token);

      // ////////////// CORE BUSINESS LOGIC ////////////////////////
      self.userAdapter     = new UserAdapter(self.HTTPAdapter);
      self.roomAdapter     = new RoomAdapter(self.HTTPAdapter);
      self.realtimeAdapter = new MqttAdapter(mqttURL, MqttCallback, self);
      self.realtimeAdapter.subscribeUserChannel();
      if (self.options.loginSuccessCallback) self.options.loginSuccessCallback(response)
    })

    /**
     * Called when the comment has been delivered
     */
    self.on('comment-delivered', function (response) {
      if (self.options.commentDeliveredCallback) self.options.commentDeliveredCallback(response)
      // find comment with the id or unique id listed from response
      // const commentToFind = self.selected.comments.find(comment => 
      //   comment.id === response.id || comment.uniqueId === response.uniqueId);
    })

    /**
     * Called when new chatroom has been created
     */
    self.on('chat-room-created', function (response) {
      self.isLoading = false
      if (self.options.chatRoomCreatedCallback) self.options.chatRoomCreatedCallback(response)
    })

    /**
     * Called when a new room with type of group has been created
     */
    self.on('group-room-created', function (response) {
      self.isLoading = false
      if (self.options.groupRoomCreatedCallback) self.options.groupRoomCreatedCallback(response)
    })

    /**
     * Called when user clicked on Chat SDK Header
     */
    self.on('header-clicked', function (response) {
      if (self.options.headerClickedCallback) self.options.headerClickedCallback(response)
    })

    /**
     * Called when a comment has been read
     */
    self.on('comment-read', function (response) {
      if (self.options.commentReadCallback) self.options.commentReadCallback(response)
    })

    /**
     * Called when there's something wrong when connecting to qiscus SDK
     */
    self.on('login-error', function(error) {
      if (self.options.loginErrorCallback) self.options.loginErrorCallback(error);
    })

    /**
     * Called when there's new presence data of currently subscribed target user (last seen timestamp)
     * @param {string} data MQTT Payload with format of "x:xxxxxxxxxxxxx"
     */
    self.on('presence', function(data) {
      const payload = data.split(":");
      self.chatmateStatus = (payload[0] == 1)
        ? 'Online'
        : `Last seen ${distanceInWordsToNow(Number(payload[1]))}`
      if (self.options.presenceCallback) self.options.presenceCallback(data);
    })

    self.on('typing', function(data) {
      if (self.options.typingCallback) self.options.typingCallback(data);
    })

    self.on('comment-read', function(data) {
      if (self.options.commentReadCallback) self.options.commentReadCallback(data);
    })

    self.on('comment-delivered', function(data) {
      if (self.options.commentDeliveredCallback) self.options.commentDeliveredCallback(data);
    })
  }

  /**
  * Setting Up User Credentials for next API Request
  * @param {string} unique_id - client unique_id (will be used for login or register)
  * @param {string} key - client unique key
  * @param {string} username - client username
  * @param {string} avatar_url - the url for chat avatar (optional)
  * @return {void}
  */
  setUser (unique_id, key, username, avatarURL) {
    this.unique_id  = unique_id
    this.key        = key
    this.username   = username
    this.avatar_url = avatarURL

    // Connect to Login or Register API
    this.connectToQiscus().then((response) => {
      if(response.status != 200) return this.emit('login-error', response.error)
      this.isInit = true
      this.emit('login-success', response)
    })
  }

  async connectToQiscus () {
    let obj = {
      email: this.unique_id,
      password: this.key,
      username: this.username
    }
    if (this.avatar_url) obj.avatar_url = this.avatar_url;
    let resp = await r2.post(`${this.baseURL}/api/v2/sdk/login_or_register`, {json: obj}).json
    return resp
  }

  // Activate Sync Feature if `http` or `both` is chosen as sync value when init
  activateSync () {
    const self = this
    if (self.isSynced) return false;
    self.isSynced = true;
    window.setInterval(() => self.synchronize(), 3500);
  }

  /**
   * This method let us get new comments from server
   * If comment count > 0 then we have new message
   */
  synchronize () {
    this.realtimeAdapter.publishPresence(this.unique_id);
    this.userAdapter.sync(this.last_received_comment_id)
    .then((comments) => {
      if (comments.length > 0) this.emit('newmessages', comments)
    })
  }

  disconnect () {
    this.isInit = false;
    this.userData = {};
    this.selected = null;
  }

  /**
   * Chat with targetted email
   * @param unique_id {string} - target unique_id
   * @param options {object} - optional data sent to qiscus database
   * @param distinct_id {string | optional} - unique string to differentiate chat room with same target
   * @return room <Room>
   */
  chatTarget (unique_id, options = {}) {
    // make sure data already loaded first (user already logged in)
    if (this.userData.length != null) return false

    const self = this
    const initialMessage = (options) ? options.message  : null;
    const distinctId = options.distinctId;

    self.isLoading = true
    self.isTypingStatus = ''

    // We need to get room id 1st, based on room_name_id_map
    const roomId = self.room_name_id_map[unique_id] || null
    let room     = self.rooms.find(room => { id: roomId });
    if (room) { // => Room is Found, just use this, no need to reload
      // self.selected = null
      self.selected = room
      // make sure we always get the highest value of last_received_comment_id
      self.last_received_comment_id = (self.last_received_comment_id < room.last_comment_id) ? room.last_comment_id : self.last_received_comment_id
      self.isLoading = false
      self.emit('chat-room-created', { room: room })
      // id of last comment on this room
      const last_comment = room.comments[room.comments.length-1];
      if (last_comment) self.updateCommentStatus(room.id, last_comment);
      return Promise.resolve(room)
    }

    // Create room
    return this.roomAdapter.getOrCreateRoom(unique_id, options, distinctId)
      .then((response) => {
        room = new Room(response)
        self.room_name_id_map[unique_id] = room.id
        self.last_received_comment_id = (self.last_received_comment_id < room.last_comment_id) ? room.last_comment_id : self.last_received_comment_id
        self.rooms.push(room)
        self.isLoading = false
        self.selected = room
        // id of last comment on this room
        const last_comment = room.comments[room.comments.length-1];
        if (last_comment) self.updateCommentStatus(room.id, last_comment);
        self.emit('chat-room-created', { room: room })

        if (!initialMessage) return room
        const topicId = room.id
        const message = initialMessage
        self.submitComment(topicId, message)
          .then(() => console.log('Comment posted'))
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
  chatGroup (id) {
    const self = this;
    if (!self.isInit) return
    return self.getRoomById(id)
    .then((response) => {
      return Promise.resolve(response);
    })
  }

  /**
   * @param {int} id - Room Id
   * @return {Room} Room data
   */
  getRoomById (id) {
    const self = this
    self.isLoading = true;
    self.isTypingStatus = ''
    return self.roomAdapter.getRoomById(id)
      .then((response) => {
        // make sure the room hasn't been pushed yet
        let room;
        let roomToFind = self.rooms.find(room => { id: id});
        if (!roomToFind) {
          let roomData = response.results.room;
          roomData.name = roomData.room_name;
          roomData.room_type = 'group';
          roomData.comments = response.results.comments.reverse();
          room = new Room(roomData);
          self.room_name_id_map[room.name] = room.id;
          self.rooms.push(room);
        } else {
          room = roomToFind;
        } 
        self.last_received_comment_id = (self.last_received_comment_id < room.last_comment_id) ? room.last_comment_id : self.last_received_comment_id;
        self.selected = room || roomToFind;
        self.isLoading = false;
        // id of last comment on this room
        const last_comment = room.comments[room.comments.length-1];
        if (last_comment) self.updateCommentStatus(room.id, last_comment);
        return Promise.resolve(room);
      }, (error) => {
        console.error('Error getting room by id', error);
        return Promise.reject(error);
      })
  }

  /**
   * @param {int} id - Room Id
   * @param {string} room_name
   * @param {string} avatar_url
   * @return {Room} Room data
   */
  getOrCreateRoomByUniqueId (id, room_name, avatar_url) {
    const self = this
    self.isLoading = true;
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
        self.selected = room || roomToFind
        self.isLoading = false
        // self.emit('group-room-created', self.selected)
      }, (error) => {
        console.error('Error getting room by id', error)
      })
  }

  /**
   * Set read status for selected comment
   * 
   * @param {int} room_id 
   * @param {obj} comment 
   * @memberof qiscusSDK
   */
  updateCommentStatus(room_id, comment) {
    const self = this;
    self.userAdapter.updateCommentStatus(room_id, comment.id, comment.id)
    .then( res => {
      self.sortComments()
    })
  }

  /**
   * TODO: This operation is heavy, let's find another way
   * 
   * @memberof QiscusSDK
   */
  sortComments () {
    this.selected.comments.sort(function (leftSideComment, rightSideComment) {
      return leftSideComment.id - rightSideComment.id
    })
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
  submitComment (topicId, commentMessage, uniqueId, type = 'text', payload) {
    var self = this
    self.pendingCommentId--
    var pendingCommentDate = new Date()
    var commentData = {
      message: commentMessage,
      username_as: this.username,
      username_real: this.email,
      user_avatar_url: this.userData.avatar_url,
      id: self.pendingCommentId,
      type: type || 'text',
      timestamp: format(new Date())
    }
    if(type != 'text') commentData.payload = JSON.parse(payload)
    var pendingComment = self.prepareCommentToBeSubmitted(commentData)

    // push this comment unto active room
    if(type == 'reply') {
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
    self.selected.comments.push(pendingComment)

    return this.userAdapter.postComment(topicId, commentMessage, pendingComment.unique_id, type, payload)
    .then((res) => {
      // When the posting succeeded, we mark the Comment as sent,
      // so all the interested party can be notified.
      pendingComment.markAsSent()
      pendingComment.id = res.id
      pendingComment.before_id = res.comment_before_id
      return new Promise((resolve, reject) => resolve(self.selected))
    }, (err) => {
      pendingComment.markAsFailed()
      return new Promise((resolve, reject) => reject(err))
    })
  }

  prepareCommentToBeSubmitted (comment) {
    var commentToBeSubmitted, uniqueId
    commentToBeSubmitted = new Comment(comment)
    // We're gonna use timestamp for uniqueId for now.
    // "bq" stands for "Bonjour Qiscus" by the way.
    uniqueId = 'bq' + Date.now()
    if(comment.unique_id) uniqueId = comment.unique_id
    commentToBeSubmitted.attachUniqueId(uniqueId)
    commentToBeSubmitted.markAsPending()
    commentToBeSubmitted.isDelivered = false
    commentToBeSubmitted.isSent = false
    commentToBeSubmitted.isRead = false
    return commentToBeSubmitted
  }

  /**
   * Create group chat room
   * @param {string} name - Chat room name
   * @param {string[]} emails - Participant to be invited
   * @returns {Promise.<Room, Error>} - Room detail
   */
  createGroupRoom (name, emails, options) {
    const self = this
    if (!this.isLogin) throw new Error('Please initiate qiscus SDK first')
    return new GroupChatBuilder(this.roomAdapter)
      .withName(name)
      .withOptions(options)
      .addParticipants(emails)
      .create()
      .then((res) => {
        self.emit('group-room-created', res)
      })
  }

  _getRoomOfTopic (topic_id) {
    // TODO: This is expensive. We need to refactor
    // it using some kind map of topicId as the key
    // and roomId as its value.
    return this.rooms.find((room) =>
      room.topics.find(topic => topic.id === topic_id)
    )
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
    return self.userAdapter.uploadFile(file)
      .then( response => {
        // file(s) uploaded), let's post to comment
        var url = response.file.url
        return self.submitComment(roomId, `[file] ${url} [/file]`);
      });
  }

  loadComments(roomId, lastCommentId) {
    const self = this;
    return self.topicAdapter.loadComments(topic_id, last_comment_id)
      .then((response) => {
        self.selected.receiveComments(response.reverse())
        self.sortComments()
        return new Promise((resolve, reject) => resolve(response))
      }, (error) => {
        console.error('Error loading comments', error)
        return new Promise(reject => reject(error));
      });
  }

  sortComments () {
    this.selected.comments.sort(function (leftSideComment, rightSideComment) {
      return leftSideComment.id - rightSideComment.id
    })
  }
}

module.exports = QiscusSDK;