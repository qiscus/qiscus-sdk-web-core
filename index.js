import {EventEmitter} from 'events';
import Comment from './lib/Comment';
import Room from './lib/Room';

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
    this.rooms           = [];
    this.selected        = null;

    this.userData        = {};
    // SDK Configuration
    this.baseURL         = null;
    this.HTTPAdapter     = null;
    this.realtimeAdapter = null;
    this.isInit          = false;
    this.isSynced        = false;
    this.sync            = 'both'; // possible values 'socket', 'http', 'both'
    this.last_received_comment_id = 0;

    // UI related Properties
    this.mode            = 'widget';
    this.plugins         = [];
    this.isLogin         = false;
    this.isLoading       = false;
    this.emoji           = false;
  }

  init (config) {
    // set AppID
    if (!config.AppId) throw new Error('Please provide valid AppId');
    this.baseURL = `https://${config.AppId}.qiscus.com`;

    if (config.sync) this.sync = config.sync;
    if (config.mode) this.mode = config.mode;
    if (config.emoji) this.emoji = config.emoji;

    // set Event Listeners
    this.setEventListeners();
  }

  updateCommentStatus(comment) {
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
        const isRoomSelected = room.isCurrentlySelected();
        if(isRoomSelected) comment.markAsRead();
        if(!isRoomSelected) comment.markAsDelivered();
        // fetch the comment inside the room
        room.receiveComment(new Comment(comment));
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
      self.isLogin  = true;
      self.userData = response.results.user;
      
      if (self.sync == 'http' || self.sync == 'both') self.activateSync();

      // now that we have the token, etc, we need to set all our adapters
      // /////////////// API CLIENT /////////////////
      self.HTTPAdapter  = new HttpAdapter(self.baseURL);
      self.HTTPAdapter.setToken(self.userData.token);

      // ////////////// CORE BUSINESS LOGIC ////////////////////////
      self.userAdapter  = new UserAdapter(self.HTTPAdapter);
      self.roomAdapter  = new RoomAdapter(self.HTTPAdapter);
      self.topicAdapter = new TopicAdapter(self.HTTPAdapter);
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
  }

  /**
  * Setting Up User Credentials for next API Request
  * @param {string} email - client email (will be used for login or register)
  * @param {string} key - client unique key
  * @param {string} username - client username
  * @param {string} avatar_url - the url for chat avatar (optional)
  * @return {void}
  */
  setUser (email, key, username, avatarURL) {
    this.email      = email
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
}
module.exports = QiscusSDK;