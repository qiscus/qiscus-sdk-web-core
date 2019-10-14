import request from 'superagent'
import mitt from 'mitt'
import is from 'is_js'
import format from 'date-fns/format'
import distanceInWordsToNow from 'date-fns/distance_in_words_to_now'
import Comment from './lib/Comment'
import Room from './lib/Room'
import HttpAdapter from './lib/adapters/http'
import AuthAdapter from './lib/adapters/auth'
import UserAdapter from './lib/adapters/user'
import RoomAdapter from './lib/adapters/room'
import MqttAdapter from './lib/adapters/mqtt'
import CustomEventAdapter from './lib/adapters/custom-event'
import SyncAdapter from './lib/adapters/sync'
import { GroupChatBuilder } from './lib/utils'
import Package from '../package.json'

/**
 * Qiscus Web SDK Core Class
 *
 * @export
 * @class QiscusSDK
 */
class QiscusSDK {
  /**
   * Creates an instance of QiscusSDK.
   */
  constructor() {
    this.events = mitt()
    this.rooms = []
    this.selected = null
    this.room_name_id_map = {}
    this.pendingCommentId = 0
    this.uploadedFiles = []
    this.chatmateStatus = null
    this.version = `WEB_${Package.version}`

    this.userData = {}
    // SDK Configuration
    this.AppId = null
    this.baseURL = 'https://api.qiscus.com'
    this.uploadURL = `${this.baseURL}/api/v2/sdk/upload`
    this.mqttURL = 'wss://mqtt.qiscus.com:1886/mqtt'
    this.HTTPAdapter = null
    this.realtimeAdapter = null
    this.customEventAdapter = null
    this.isInit = false
    this.isSynced = false
    this.syncInterval = 5000
    this.sync = 'socket' // possible values 'socket', 'http', 'both'
    this.httpsync = null
    this.eventsync = null
    this.extras = null
    this.last_received_comment_id = 0
    this.googleMapKey = ''
    this.options = {
      avatar: true
    }

    // UI related Properties
    this.UI = {}
    this.mode = 'widget'
    this.avatar = true
    this.plugins = []
    this.isLogin = false
    this.isLoading = false
    this.isInit = false
    this.emoji = false
    this.isTypingStatus = ''
    this.customTemplate = false
    this.templateFunction = null
    this.debugMode = false
    this.debugMQTTMode = false

    // to prevent double receive newmessages callback
    this.lastReceiveMessages = []
  }

  /**
   * Initializing the SDK, set Event Listeners (callbacks)
   * @param {any} config - Qiscus SDK Configurations
   * @return {void}
   */
  init(config) {
    // set AppID
    if (!config.AppId) throw new Error('Please provide valid AppId')
    this.AppId = config.AppId

    if (config.baseURL) this.baseURL = config.baseURL
    if (config.mqttURL) this.mqttURL = config.mqttURL
    if (config.uploadURL) this.uploadURL = config.uploadURL
    if (config.sync) this.sync = config.sync
    if (config.mode) this.mode = config.mode
    if (config.syncInterval) this.syncInterval = config.syncInterval || 5000
    if (config.googleMapKey) this.googleMapKey = config.googleMapKey
    if (config.allowedFileTypes) {
      this.allowedFileTypes = config.allowedFileTypes
    }
    // Let's initialize the app based on options
    if (config.options) {
      this.options = Object.assign({}, this.options, config.options)
    }
    if (config.customTemplate) this.customTemplate = config.customTemplate
    if (config.templateFunction) {
      this.templateFunction = config.templateFunction
    }

    if (config.syncInterval != null) this.syncInterval = config.syncInterval
    this._customHeader = {}

    // set Event Listeners
    this.setEventListeners()

    this.syncAdapter = SyncAdapter(() => this.HTTPAdapter, {
      getToken: () => this.userData.token,
      interval: this.syncInterval
    })
    this.syncAdapter.events.on('message.new', message => {
      if (this.selected != null) {
        const index = this.selected.comments.findIndex(
          it => it.id === message.id || it.unique_id === message.unique_temp_id
        )
        if (index === -1) {
          const _message = new Comment(message)
          if (_message.room_id === this.selected.id) {
            this.selected.comments.push(_message)
            this.sortComments()
          }
          this.events.emit('newmessages', [message])
        }
      } else {
        this.events.emit('newmessages', [message])
      }
    })
    this.syncAdapter.events.on('message.delivered', message => {
      this._setDelivered(
        message.comment_id,
        message.comment_unique_id,
        message.email
      )
    })
    this.syncAdapter.events.on('message.read', message => {
      this._setRead(
        message.comment_id,
        message.comment_unique_id,
        message.email
      )
    })
    this.syncAdapter.events.on('message.deleted', data => {
      data.deleted_messages.forEach(it => {
        this.events.emit('comment-deleted', {
          roomId: it.room_id,
          commentUniqueIds: it.message_unique_ids,
          isForEveryone: true,
          isHard: true
        })
      })
    })
    this.syncAdapter.events.on('room.deleted', data => {
      data.deleted_rooms.forEach(room => {
        this.events.emit('room-cleared', room)
      })
    })

    this.realtimeAdapter = new MqttAdapter(this.mqttURL, this)
    this.realtimeAdapter.on(
      'message-delivered',
      ({ commentId, commentUniqueId, userId }) =>
        this._setDelivered(commentId, commentUniqueId, userId)
    )
    this.realtimeAdapter.on(
      'message-read',
      ({ commentId, commentUniqueId, userId }) =>
        this._setRead(commentId, commentUniqueId, userId)
    )
    this.realtimeAdapter.on('new-message', message =>
      this.events.emit('newmessages', [message])
    )
    this.realtimeAdapter.on('presence', data =>
      this.events.emit('presence', data)
    )
    this.realtimeAdapter.on('comment-deleted', data =>
      this.events.emit('comment-deleted', data)
    )
    this.realtimeAdapter.on('room-cleared', data =>
      this.events.emit('room-cleared', data)
    )
    this.realtimeAdapter.on('typing', data =>
      this.events.emit('typing', {
        message: data.message,
        username: data.userId,
        room_id: data.roomId
      })
    )
    this.customEventAdapter = CustomEventAdapter(
      this.realtimeAdapter,
      this.user_id
    )
  }

  _setRead(messageId, messageUniqueId, userId) {
    if (this.selected == null) return
    const room = this.selected
    const message = room.comments.find(
      it => it.id === messageId || it.unique_id === messageUniqueId
    )
    if (message == null) return
    if (message.status === 'read') return

    const options = {
      participants: room.participants,
      actor: userId,
      comment_id: messageId,
      activeActorId: this.user_id
    }
    room.comments.forEach(it => {
      if (it.id <= message.id) {
        it.markAsRead(options)
      }
    })
    if (!message.isRead) return
    this.events.emit('comment-read', { comment: message, userId })
  }
  _setDelivered(messageId, messageUniqueId, userId) {
    if (this.selected == null) return
    const room = this.selected
    const message = room.comments.find(
      it => it.id === messageId || it.unique_id === messageUniqueId
    )
    if (message == null) return
    if (message.status === 'read') return

    const options = {
      participants: room.participants,
      actor: userId,
      comment_id: messageId,
      activeActorId: this.user_id
    }
    room.comments.forEach(it => {
      if (it.id <= message.id) {
        it.markAsDelivered(options)
      }
    })
    if (!message.isDelivered) return
    this.events.emit('comment-delivered', { comment: message, userId })
  }

  readComment(roomId, commentId) {
    const isSelected = (this.selected && this.selected.id === roomId) || false
    const isChannel = (this.selected && this.selected.isChannel) || false
    if (!isSelected || isChannel) return false
    this.userAdapter.updateCommentStatus(roomId, commentId, null)
  }

  receiveComment(roomId, commentId) {
    const isChannel = this.selected ? this.selected.isChannel : false
    if (isChannel) return false
    this.userAdapter.updateCommentStatus(roomId, null, commentId)
  }

  setEventListeners() {
    const self = this
    self.events.on('start-init', () => {
      self.HTTPAdapter = new HttpAdapter({
        baseURL: self.baseURL,
        AppId: self.AppId,
        userId: self.user_id,
        version: self.version,
        getCustomHeader: () => this._customHeader
      })
      self.HTTPAdapter.setToken(self.userData.token)
      self.authAdapter = new AuthAdapter(self.HTTPAdapter)
    })

    self.events.on('room-changed', room => {
      this.logging('room changed', room)
      if (self.options.roomChangedCallback) {
        self.options.roomChangedCallback(room)
      }
    })

    self.events.on('file-uploaded', url => {
      if (self.options.fileUploadedCallback) {
        self.options.fileUploadedCallback(url)
      }
    })

    self.events.on('profile-updated', user => {
      self.username = user.name
      self.avatar_url = user.avatar_url
      if (self.options.updateProfileCallback) {
        self.options.updateProfileCallback(user)
      }
    })

    /**
     * This event will be called when there's new post messages
     * @param {string} data - JSON Response from SYNC API / MQTT
     * @return {void}
     */
    self.events.on('newmessages', comments => {
      // let's convert the data into something we can use
      // first we need to make sure we sort this data out based on room_id
      this.logging('newmessages', comments)

      const lastReceivedMessageNotEmpty = this.lastReceiveMessages.length > 0
      if (
        lastReceivedMessageNotEmpty &&
        this.lastReceiveMessages[0].unique_temp_id ===
          comments[0].unique_temp_id
      ) {
        this.logging('lastReceiveMessages double', comments)
        return
      }

      this.lastReceiveMessages = comments

      self._callNewMessagesCallback(comments)
      comments.forEach(comment => {
        // we have this comment, so means it's already delivered, update it's delivered status
        self.receiveComment(comment.room_id, comment.id)

        const isActiveRoom = self.selected
          ? comment.room_id === self.selected.id
          : false
        const isAlreadyRead = comment.id <= self.last_received_comment_id

        // kalau comment ini ada di currently selected
        if (isActiveRoom) {
          const selected = self.selected
          const lastComment =
            self.selected.comments[self.selected.comments.length - 1]
          // kirim event read kalau ini bukan komen kita sendiri
          if (
            !lastComment.isPending &&
            !isAlreadyRead &&
            self.user_id !== comment.email
          ) {
            self.readComment(comment.room_id, comment.id)
          }
          // pastiin sync
          const roomLastCommentId = lastComment.id
          const commentBeforeThis = self.selected.comments.find(
            c => c.id === lastComment.comment_before_id
          )
          if (!lastComment.isPending && !commentBeforeThis) {
            this.logging(
              'comment before id not found! ',
              comment.comment_before_id
            )
            // need to fix, these method does not work
            self.synchronize(roomLastCommentId)
          }
          // pastikan dulu komen ini komen baru, klo komen lama ga usah panggil cb
          const pendingComment = new Comment(comment)
          // fetch the comment inside the room
          selected.receiveComment(pendingComment)
          selected.last_comment_id = pendingComment.id
          selected.last_comment_message = pendingComment.message
        }

        // let's update last_received_comment_id
        self.updateLastReceivedComment(comment.id)
        this.sortComments()
      })
    })

    /**
     * This event will be called when login is sucess
     * Basically, it sets up necessary properties for qiscusSDK
     */
    this.events.on('login-success', response => {
      this.logging('login-success', response)

      this.isLogin = true
      this.userData = response.user
      this.last_received_comment_id = this.userData.last_comment_id

      // now that we have the token, etc, we need to set all our adapters
      this.HTTPAdapter = new HttpAdapter({
        baseURL: this.baseURL,
        AppId: this.AppId,
        userId: this.user_id,
        version: this.version,
        getCustomHeader: () => this._customHeader
      })
      this.HTTPAdapter.setToken(this.userData.token)

      this.userAdapter = new UserAdapter(this.HTTPAdapter)
      this.roomAdapter = new RoomAdapter(this.HTTPAdapter)

      this.realtimeAdapter.subscribeUserChannel()
      if (this.presensePublisherId != null && this.presensePublisherId !== -1)
        clearInterval(this.presensePublisherId)
      this.presensePublisherId = setInterval(
        () => this.realtimeAdapter.publishPresence(this.user_id),
        3500
      )

      if (this.sync === 'http' || this.sync === 'both') this.activateSync()
      if (this.options.loginSuccessCallback) {
        this.options.loginSuccessCallback(response)
      }
    })

    /**
     * Called when there's something wrong when connecting to qiscus SDK
     */
    self.events.on('login-error', function(error) {
      if (self.options.loginErrorCallback) {
        self.options.loginErrorCallback(error)
      }
    })

    self.events.on('room-cleared', function(room) {
      // find room
      if (self.selected) {
        const currentRoom = self.selected
        if (self.selected.unique_id === room.unique_id) {
          self.selected = null
          self.selected = currentRoom
        }
      }
      if (self.options.roomClearedCallback)
        self.options.roomClearedCallback(room)
    })

    self.events.on('comment-deleted', function(data) {
      // get to the room id and delete the comment
      const {
        roomId,
        commentUniqueIds,
        // eslint-disable-next-line
        isForEveryone,
        isHard
      } = data
      if (self.selected && self.selected.id === roomId) {
        // loop through the array of unique_ids
        commentUniqueIds.map(id => {
          const commentToBeFound = self.selected.comments.findIndex(
            comment => comment.unique_id === id
          )
          if (commentToBeFound > -1) {
            if (isHard) {
              self.selected.comments.splice(commentToBeFound, 1)
            } else {
              self.selected.comments[commentToBeFound].message =
                'this message has been deleted'
            }
          }
        })
      }
      if (self.options.commentDeletedCallback) {
        self.options.commentDeletedCallback(data)
      }
    })

    /**
     * Called when the comment has been delivered
     */
    self.events.on('comment-delivered', function(response) {
      self.logging('comment-delivered', response)
      if (!response) return false
      if (self.options.commentDeliveredCallback) {
        return self.options.commentDeliveredCallback(response)
      }
      // find comment with the id or unique id listed from response
      // const commentToFind = self.selected.comments.find(comment =>
      //   comment.id === response.id || comment.uniqueId === response.uniqueId);
    })

    /**
     * Called when new chatroom has been created
     */
    self.events.on('chat-room-created', function(response) {
      self.isLoading = false
      if (self.options.chatRoomCreatedCallback) {
        self.options.chatRoomCreatedCallback(response)
      }
    })

    /**
     * Called when a new room with type of group has been created
     */
    self.events.on('group-room-created', function(response) {
      self.isLoading = false
      if (self.options.groupRoomCreatedCallback) {
        self.options.groupRoomCreatedCallback(response)
      }
    })

    /**
     * Called when user clicked on Chat SDK Header
     */
    self.events.on('header-clicked', function(response) {
      if (self.options.headerClickedCallback) {
        self.options.headerClickedCallback(response)
      }
    })

    /**
     * Called when a comment has been read
     */
    self.events.on('comment-read', function(response) {
      self.logging('comment-read', response)
      if (self.options.commentReadCallback) {
        self.options.commentReadCallback(response)
      }
    })

    /**
     * Called when there's new presence data of currently subscribed target user (last seen timestamp)
     * @param {string} data MQTT Payload with format of "x:xxxxxxxxxxxxx"
     */
    self.events.on('presence', ({ message, userId }) => {
      const payload = message.split(':')
      if (this.chatmateStatus !== payload[0]) {
        this.chatmateStatus =
          payload[0] === 1
            ? 'Online'
            : `Last seen ${distanceInWordsToNow(
                Number(payload[1].substring(0, 13))
              )}`
      }
      if (this.options.presenceCallback)
        this.options.presenceCallback(message, userId)
    })

    self.events.on('typing', function(data) {
      if (self.options.typingCallback) self.options.typingCallback(data)
    })

    /**
     * Called when user clicked on Message Info
     */
    self.events.on('message-info', function(response) {
      if (self.options.messageInfoCallback) {
        self.options.messageInfoCallback(response)
      }
    })

    /**
     * Called when new particant was added into a group
     */
    self.events.on('participants-added', response => {
      if (response == null || this.selected == null) return
      this.selected.participants.push(...response)
    })

    /**
     * Called when particant was removed from a group
     */
    self.events.on('participants-removed', response => {
      if (response == null || this.selected == null) return
      const participants = this.selected.participants.filter(
        participant => response.indexOf(participant.email) <= -1
      )
      this.selected.participants = participants
    })

    /**
     * Called when user was added to blocked list
     */
    self.events.on('block-user', function(response) {
      if (self.options.blockUserCallback) {
        self.options.blockUserCallback(response)
      }
    })

    /**
     * Called when user was removed from blocked list
     */
    self.events.on('unblock-user', function(response) {
      if (self.options.unblockUserCallback) {
        self.options.unblockUserCallback(response)
      }
    })
  }

  onReconnectMqtt() {
    if (!this.selected) return
    if (this.options.onReconnectCallback) this.options.onReconnectedCallback()
    this.loadComments(this.selected.id)
  }

  _callNewMessagesCallback(comments) {
    if (this.options.newMessagesCallback) {
      this.options.newMessagesCallback(comments)
    }
  }

  updateLastReceivedComment(id) {
    if (this.last_received_comment_id < id) this.last_received_comment_id = id
  }

  /**
   * Setting Up User Credentials for next API Request
   * @param userId {string} - client userId (will be used for login or register)
   * @param key {string} - client unique key
   * @param username {string} - client username
   * @param avatarURL {string} - the url for chat avatar (optional)
   * @param extras {object} - extra data for user
   * @return {Promise}
   */
  setUser(userId, key, username, avatarURL, extras) {
    const self = this
    self.events.emit('start-init')

    self.user_id = userId
    self.key = key
    self.username = username
    self.avatar_url = avatarURL

    let params = {
      email: this.user_id,
      password: this.key,
      username: this.username,
      extras: extras ? JSON.stringify(extras) : null
    }
    if (this.avatar_url) params.avatar_url = this.avatar_url

    return self.authAdapter.loginOrRegister(params).then(
      response => {
        self.isInit = true
        self.events.emit('login-success', response)
      },
      error => {
        return self.events.emit('login-error', error)
      }
    )
  }

  setUserWithIdentityToken(data) {
    if (!data || !('user' in data)) return this.events.emit('login-error', data)
    this.email = data.user.email
    this.user_id = data.user.email
    this.key = data.identity_token
    this.username = data.user.username
    this.avatar_url = data.user.avatar_url
    this.isInit = true
    this.events.emit('login-success', data)
  }

  logout() {
    this.selected = null
    this.isInit = false
    this.isLogin = false
    this.userData = {}
    this.realtimeAdapter.disconnect()
  }

  // Activate Sync Feature if `http` or `both` is chosen as sync value when init
  get __isLogin() {
    return this.isLogin
  }
  activateSync() {
    if (this.isSynced) return
    this.isSynced = true

    this.httpsync = setInterval(() => {
      if (!this.realtimeAdapter.connected && this.__isLogin) this.synchronize()
    }, this.syncInterval)
    this.eventsync = setInterval(() => {
      if (!this.realtimeAdapter.connected && this.__isLogin) this.synchronizeEvent()
    }, this.syncInterval)
  }

  disableSync() {
    this.isSynced = false
    clearInterval(this.httpsync)
    clearInterval(this.eventsync)
  }

  get synchronize() {
    return this.syncAdapter.synchronize
  }
  get synchronizeEvent() {
    return this.syncAdapter.synchronizeEvent
  }

  disconnect() {
    this.logout()
  }

  setActiveRoom(room) {
    // when we activate a room
    // we need to unsubscribe from typing event
    if (this.selected) {
      this.realtimeAdapter.unsubscribeTyping()
      // before we unsubscribe, we need to get the userId first
      // and only unsubscribe if the previous room is having a type of 'single'
      if (this.selected.room_type === 'single') {
        const unsubscribedUserId = this.selected.participants.filter(
          p => p.email !== this.user_id
        )
        if (unsubscribedUserId.length > 0) {
          this.realtimeAdapter.unsubscribeRoomPresence(
            unsubscribedUserId[0].email
          )
        }
      }
    }
    if (room.participants == null) room.participants = []
    const targetUserId = room.participants.find(p => p.email !== this.user_id)
    this.chatmateStatus = null
    this.isTypingStatus = null
    this.selected = room
    // found a bug where there's a race condition, subscribing to mqtt
    // while mqtt is still connecting, so we'll have to do this hack
    const initialSubscribe = setInterval(() => {
      // Clear Interval when realtimeAdapter has been Populated

      if (this.debugMode) {
        console.log('Trying Initial Subscribe')
      }

      if (this.realtimeAdapter != null) {
        if (this.debugMode) {
          console.log(this.realtimeAdapter)
          console.log('MQTT Connected')
        }
        clearInterval(initialSubscribe)

        // before we unsubscribe, we need to get the userId first
        // and only unsubscribe if the previous room is having a type of 'single'
        if (room.room_type === 'single' && targetUserId != null) {
          this.realtimeAdapter.subscribeRoomPresence(targetUserId.email)
        }
        // we need to subscribe to new room typing event now
        if (this.selected != null && !this.selected.isChannel) {
          this.realtimeAdapter.subscribeTyping(room.id)
          this.events.emit('room-changed', this.selected)
        }
        if (this.debugMode && this.realtimeAdapter == null) {
          console.log('Retry')
        }
      } else {
        if (this.debugMode) {
          console.log('MQTT Not Connected, yet')
        }
      }
    }, 3000)
  }

  /**
   * Chat with targetted email
   * @param userId {string} - target userId
   * @param options {object} - optional data sent to qiscus database
   * @return room <Room>
   */
  chatTarget(userId, options = {}) {
    // make sure data already loaded first (user already logged in)
    if (this.userData.length != null) return false

    const initialMessage = options ? options.message : null
    const distinctId = options.distinctId

    this.isLoading = true
    this.isTypingStatus = ''

    // Create room
    return this.roomAdapter.getOrCreateRoom(userId, options, distinctId).then(
      resp => {
        const room = new Room(resp)

        if (this.last_received_comment_id < room.last_comment_id) {
          this.last_received_comment_id = room.last_comment_id
        }
        this.isLoading = false
        this.setActiveRoom(room)
        // id of last comment on this room
        const lastComment = room.comments[room.comments.length - 1]
        if (lastComment) this.readComment(room.id, lastComment.id)
        this.events.emit('chat-room-created', {
          room: room
        })

        if (!initialMessage) return room

        const topicId = room.id
        return this.sendComment(topicId, initialMessage)
          .then(() => Promise.resolve(room))
          .catch(err => {
            console.error('Error when submit comment', err)
          })
      },
      err => {
        console.error('Error when creating room', err)
        this.isLoading = false
        return Promise.reject(err)
      }
    )
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
    const self = this
    if (!self.isInit) return
    return self.getRoomById(id).then(
      response => {
        return Promise.resolve(response)
      },
      err => Promise.reject(err)
    )
  }

  /**
   * @param {int} id - Room Id
   * @return {Room} Room data
   */
  getRoomById(id) {
    if (!this.isInit) return

    const self = this
    self.isLoading = true
    self.isTypingStatus = ''
    return self.roomAdapter.getRoomById(id).then(
      response => {
        // make sure the room hasn't been pushed yet
        let roomData = response.results.room
        roomData.name = roomData.room_name
        roomData.comments = response.results.comments.reverse()
        let room = new Room(roomData)

        self.last_received_comment_id =
          self.last_received_comment_id < room.last_comment_id
            ? room.last_comment_id
            : self.last_received_comment_id
        self.setActiveRoom(room)
        self.isLoading = false
        // id of last comment on this room
        const lastComment = room.comments[room.comments.length - 1]
        if (lastComment) self.readComment(room.id, lastComment.id)
        if (room.isChannel) {
          this.realtimeAdapter.subscribeChannel(this.AppId, room.unique_id)
        }
        return Promise.resolve(room)
      },
      error => {
        console.error('Error getting room by id', error)
        return Promise.reject(error)
      }
    )
  }

  /**
   * @param {int} id - Room Id
   * @param {string} roomName
   * @param {string} avatarURL
   * @return {Room} Room data
   */
  getOrCreateRoomByUniqueId(id, roomName, avatarURL) {
    const self = this
    self.isLoading = true
    self.isTypingStatus = ''
    return self.roomAdapter
      .getOrCreateRoomByUniqueId(id, roomName, avatarURL)
      .then(
        response => {
          // make sure the room hasn't been pushed yet
          let room = new Room(response)
          self.last_received_comment_id =
            self.last_received_comment_id < room.last_comment_id
              ? room.last_comment_id
              : self.last_received_comment_id
          self.setActiveRoom(room)
          self.isLoading = false
          const lastComment = room.comments[room.comments.length - 1]
          if (lastComment) self.readComment(room.id, lastComment.id)
          this.realtimeAdapter.subscribeChannel(this.AppId, room.unique_id)
          return Promise.resolve(room)
          // self.events.emit('group-room-created', self.selected)
        },
        error => {
          // console.error('Error getting room by id', error)
          return Promise.reject(error)
        }
      )
  }

  getOrCreateRoomByChannel(channel, name, avatarURL) {
    return this.getOrCreateRoomByUniqueId(channel, name, avatarURL)
  }

  sortComments() {
    this.selected &&
      this.selected.comments.sort(function(leftSideComment, rightSideComment) {
        return leftSideComment.unix_timestamp - rightSideComment.unix_timestamp
      })
  }

  async loadRoomList(params = {}) {
    const rooms = await this.userAdapter.loadRoomList(params)
    return rooms.map(room => {
      room.last_comment_id = room.last_comment.id
      room.last_comment_message = room.last_comment.message
      room.last_comment_message_created_at = room.last_comment.timestamp
      room.room_type = room.chat_type
      room.comments = []
      return new Room(room)
    })
  }

  loadComments(roomId, options = {}) {
    return this.userAdapter.loadComments(roomId, options).then(comments => {
      if (this.selected != null) {
        this.selected.receiveComments(comments.reverse())
        this.sortComments()
      }
      return Promise.resolve(comments)
    })
  }

  loadMore(lastCommentId, options = {}) {
    if (this.selected == null) return
    options.last_comment_id = lastCommentId
    options.after = false
    return this.loadComments(this.selected.id, options)
  }

  /**
   *
   * Search Qiscus Messages
   *
   * @param {any} [params={query,room_id,last_comment_id}]
   * @memberof qiscusSDK
   */
  async searchMessages(params = {}) {
    console.warn('Deprecated: search message will be removed on next release')
    const messages = await this.userAdapter.searchMessages(params)
    return messages.map(message => {
      return new Comment(message)
    })
  }

  updateProfile(user) {
    return this.userAdapter.updateProfile(user).then(
      res => {
        this.events.emit('profile-updated', user)
      },
      err => console.log(err)
    )
  }

  getNonce() {
    return request
      .post(`${this.baseURL}/api/v2/sdk/auth/nonce`)
      .send()
      .set('qiscus_sdk_app_id', `${this.AppId}`)
      .set('qiscus_sdk_version', `${this.version}`)
      .then(
        res => Promise.resolve(res.body.results),
        err => Promise.reject(err)
      )
  }

  verifyIdentityToken(identityToken) {
    return request
      .post(`${this.baseURL}/api/v2/sdk/auth/verify_identity_token`)
      .send({
        identity_token: identityToken
      })
      .set('qiscus_sdk_app_id', `${this.AppId}`)
      .set('qiscus_sdk_version', `${this.version}`)
      .then(
        res => Promise.resolve(res.body.results),
        err => Promise.reject(err)
      )
  }

  /**
   *
   * Step of submitting:
   * - we need to create a new comment object
   * - attach it with negative number id, and also the uniqueId, uniqueId is used
   *   to target this particular comment when there's response from server (sent, delivered state)
   * @param {Int} topicId - the topic id of comment to be submitted
   * @param {String} commentMessage - comment to be submitted
   * @param uniqueId {String}
   * @param type     {String}
   * @param payload  {Object}
   * @param extras   {Object}
   * @return {Promise}
   */
  // #region sendComment
  sendComment(
    topicId,
    commentMessage,
    uniqueId,
    type = 'text',
    payload,
    extras
  ) {
    const self = this
    // set extra data, etc
    if (self.options.prePostCommentCallback) {
      self.options.prePostCommentCallback(commentMessage)
    }
    /**
     * example:
     * commentFormaterCallback(msg) {
     *  return filterBadWords(msg) // define your own filter function and return its' value
     * }
     */
    if (self.options.commentFormaterCallback) {
      commentMessage = self.options.commentFormaterCallback(commentMessage)
    }
    self.pendingCommentId--
    const commentData = {
      message: commentMessage,
      username_as: this.username,
      username_real: this.user_id,
      user_avatar_url: this.userData.avatar_url,
      id: Math.round(Math.random() * 10e6),
      type: type || 'text',
      timestamp: format(new Date()),
      unique_id: uniqueId
    }
    if (type !== 'text') commentData.payload = JSON.parse(payload)
    const pendingComment = self.prepareCommentToBeSubmitted(commentData)

    // push this comment unto active room
    if (type === 'reply') {
      // change payload for pendingComment
      // get the comment for current replied id
      var parsedPayload = JSON.parse(payload)
      var repliedMessage = self.selected.comments.find(
        cmt => cmt.id === parsedPayload.replied_comment_id
      )
      parsedPayload.replied_comment_message =
        repliedMessage.type === 'reply'
          ? repliedMessage.payload.text
          : repliedMessage.message
      parsedPayload.replied_comment_sender_username = repliedMessage.username_as
      pendingComment.payload = parsedPayload
    }
    if (self.selected) self.selected.comments.push(pendingComment)

    const extrasToBeSubmitted = extras || self.extras
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
          if (!self.selected) return Promise.resolve(res)
          // When the posting succeeded, we mark the Comment as sent,
          // so all the interested party can be notified.
          pendingComment.markAsSent()
          pendingComment.markAsRead({
            participants: this.selected.participants,
            actor: this.user_id,
            comment_id: res.id,
            activeActorId: this.user_id
          })
          pendingComment.id = res.id
          pendingComment.before_id = res.comment_before_id
          // update the timestamp also then re-sort the comment list
          pendingComment.unix_timestamp = res.unix_timestamp
          self.sortComments()

          return Promise.resolve(res)
        },
        err => {
          pendingComment.markAsFailed()
          return Promise.reject(err)
        }
      )
  }

  // #endregion

  getUsers(query = '', page = 1, limit = 20) {
    return this.HTTPAdapter.get_request('api/v2/sdk/get_user_list')
      .query({
        token: this.userData.token,
        query,
        page,
        limit
      })
      .then(resp => {
        return Promise.resolve(resp.body.results)
      })
  }

  getRoomParticipants(roomUniqueId, offset = 0) {
    return this.HTTPAdapter.get_request('api/v2/sdk/room_participants')
      .query({
        token: this.userData.token,
        room_unique_id: roomUniqueId,
        offset
      })
      .then(resp => {
        return Promise.resolve(resp.body.results)
      })
  }

  resendComment(comment) {
    if (this.selected == null) return
    var self = this
    var room = self.selected
    var pendingComment = room.comments.find(
      cmtToFind => cmtToFind.id === comment.id
    )

    const extrasToBeSubmitted = self.extras
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
          pendingComment.markAsSent()
          pendingComment.id = res.id
          pendingComment.before_id = res.comment_before_id
          return new Promise((resolve, reject) => resolve(self.selected))
        },
        err => {
          pendingComment.markAsFailed()
          return new Promise((resolve, reject) => reject(err))
        }
      )
  }

  prepareCommentToBeSubmitted(comment) {
    var commentToBeSubmitted, uniqueId
    commentToBeSubmitted = new Comment(comment)
    // We're gonna use timestamp for uniqueId for now.
    // "bq" stands for "Bonjour Qiscus" by the way.
    uniqueId = 'bq' + Date.now()
    if (comment.unique_id) uniqueId = comment.unique_id
    commentToBeSubmitted.attachUniqueId(uniqueId)
    commentToBeSubmitted.markAsPending()
    commentToBeSubmitted.isDelivered = false
    commentToBeSubmitted.isSent = false
    commentToBeSubmitted.isRead = false
    commentToBeSubmitted.unix_timestamp = Math.round(
      new Date().getTime() / 1000
    )
    return commentToBeSubmitted
  }

  /**
   * Update room
   * @param {id, room_name, avatar_url, options} args
   * @return Promise
   */
  updateRoom(args) {
    return this.roomAdapter.updateRoom(args)
  }

  removeSelectedRoomParticipants(values = [], payload = 'id') {
    if (is.not.array(values))
      return Promise.reject(new Error('`values` must have type of array'))

    const participants = this.selected.participants
    if (!participants) {
      return Promise.reject(new Error('Nothing selected room chat.'))
    }
    // start to changes selected participants with newest values
    let participantsExclude = participants
    if (payload === 'id') {
      participantsExclude = participants.filter(
        participant => values.indexOf(participant.id) <= -1
      )
    }
    if (payload === 'email') {
      participantsExclude = participants.filter(
        participant => values.indexOf(participant.email) <= -1
      )
    }
    if (payload === 'username') {
      participantsExclude = participants.filter(
        participant => values.indexOf(participant.username) <= -1
      )
    }
    this.selected.participants = participantsExclude
    return Promise.resolve(participants)
  }

  /**
   * Create group chat room
   * @param {string} name - Chat room name
   * @param {string[]} emails - Participant to be invited
   * @returns {Promise.<Room, Error>} - Room detail
   */
  createGroupRoom(name, emails, options) {
    const self = this
    if (!this.isLogin) throw new Error('Please initiate qiscus SDK first')
    return new GroupChatBuilder(this.roomAdapter)
      .withName(name)
      .withOptions(options)
      .addParticipants(emails)
      .create()
      .then(res => {
        self.events.emit('group-room-created', res)
        return Promise.resolve(res)
      })
  }

  /**
   * Add array of participant into a group
   *
   * @param {any} roomId the room id this file is required for selected room_id to be process
   * @param {any} emails emails is must be an array
   * @returns Promise
   * @memberof QiscusSDK
   */
  addParticipantsToGroup(roomId, emails) {
    const self = this
    if (!Array.isArray(emails)) {
      throw new Error(`emails' must be type of Array`)
    }
    return self.roomAdapter.addParticipantsToGroup(roomId, emails).then(
      res => {
        self.events.emit('participants-added', res)
        return Promise.resolve(res)
      },
      err => Promise.reject(err)
    )
  }

  /**
   * Remove array of participant from a group
   *
   * @param {any} roomId the room id this file is required for selected room_id to be process
   * @param {any} emails emails is must be an array
   * @returns Promise
   * @memberof QiscusSDK
   */
  removeParticipantsFromGroup(roomId, emails) {
    if (is.not.array(emails))
      return Promise.reject(new Error('`emails` must have type of array'))
    return this.roomAdapter
      .removeParticipantsFromGroup(roomId, emails)
      .then(res => {
        this.events.emit('participants-removed', emails)
        return Promise.resolve(res)
      })
  }

  /**
   * Get user block list
   *
   * @param {any} page the page is optional, default=1
   * @param {any} limit the limit is optional, default=20
   * @returns Promise
   * @memberof QiscusSDK
   */
  getBlockedUser(page = 1, limit = 20) {
    const self = this
    return self.userAdapter.getBlockedUser(page, limit).then(
      res => {
        return Promise.resolve(res)
      },
      err => Promise.reject(err)
    )
  }

  /**
   * Add user to block list
   *
   * @param {any} email the email is required
   * @returns Promise
   * @memberof QiscusSDK
   */
  blockUser(email) {
    const self = this
    return self.userAdapter.blockUser(email).then(
      res => {
        self.events.emit('block-user', res)
        return Promise.resolve(res)
      },
      err => Promise.reject(err)
    )
  }

  /**
   * Remove user from block list
   *
   * @param {any} email the email is required
   * @returns Promise
   * @memberof QiscusSDK
   */
  unblockUser(email) {
    const self = this
    return self.userAdapter.unblockUser(email).then(
      res => {
        self.events.emit('unblock-user', res)
        return Promise.resolve(res)
      },
      err => Promise.reject(err)
    )
  }

  upload(file, callback) {
    return request
      .post(this.uploadURL)
      .attach('file', file)
      .field('token', this.userData.token)
      .set('qiscus_sdk_app_id', this.AppId)
      .set('qiscus_sdk_token', this.userData.token)
      .set('qiscus_sdk_user_id', this.user_id)
      .on('progress', event => {
        if (event.direction === 'upload') callback(null, event)
      })
      .then(resp => {
        const url = resp.body.results.file.url
        callback(null, null, resp.body.results.file.url)
        return Promise.resolve(url)
      })
      .catch(error => {
        callback(error)
        return Promise.reject(error)
      })
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
    const self = this
    var formData = new FormData()
    formData.append('file', file)
    formData.append('token', self.userData.token)
    var xhr = new XMLHttpRequest()
    xhr.open('POST', `${self.baseURL}/api/v2/sdk/upload`, true)
    xhr.setRequestHeader('qiscus_sdk_app_id', `${self.AppId}`)
    xhr.setRequestHeader('qiscus_sdk_user_id', `${self.user_id}`)
    xhr.setRequestHeader('qiscus_sdk_token', `${self.userData.token}`)
    xhr.onload = function() {
      if (xhr.status === 200) {
        // file(s) uploaded), let's post to comment
        var url = JSON.parse(xhr.response).results.file.url
        self.events.emit('fileupload', url)
        // send
        return self.sendComment(roomId, `[file] ${url} [/file]`)
      } else {
        return Promise.reject(xhr)
      }
    }
    xhr.send(formData)
  }

  addUploadedFile(name, roomId) {
    this.uploadedFiles.push(new FileUploaded(name, roomId))
  }

  removeUploadedFile(name, roomId) {
    const index = this.uploadedFiles.findIndex(
      file => file.name === name && file.roomId === roomId
    )
    this.uploadedFiles.splice(index, 1)
  }

  publishTyping(val) {
    this.realtimeAdapter.publishTyping(val)
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
    return this.userAdapter.getRoomsInfo(params)
  }

  deleteComment(roomId, commentUniqueIds, isForEveryone, isHard) {
    if (!Array.isArray(commentUniqueIds)) {
      throw new Error(`unique ids' must be type of Array`)
    }
    return this.userAdapter
      .deleteComment(roomId, commentUniqueIds, isForEveryone, isHard)
      .then(
        res => {
          this.events.emit('comment-deleted', {
            roomId,
            commentUniqueIds,
            isForEveryone,
            isHard
          })
          return Promise.resolve(res)
        },
        err => Promise.reject(err)
      )
  }

  clearRoomsCache() {
    // remove all room except currently selected
    if (this.selected) {
      // clear the map
      this.room_name_id_map = {
        [this.selected.name]: this.selected.id
      }
      // get current index and array length
      const roomLength = this.rooms.length
      let curIndex = this.rooms.findIndex(room => room.id === this.selected.id)
      if (!(curIndex + 1 === roomLength)) {
        this.rooms.splice(curIndex + 1, roomLength - (curIndex + 1))
      }
      // ambil ulang cur index nya, klo udah di awal ga perlu lagi kode dibawah ini
      curIndex = this.rooms.findIndex(room => room.id === this.selected.id)
      if (curIndex > 0 && this.rooms.length > 1) {
        this.rooms.splice(1, this.rooms.length - 1)
      }
    }
  }

  exitChatRoom() {
    // remove all subscriber
    this.realtimeAdapter.unsubscribeTyping()
    this.realtimeAdapter.unsubscribeRoomPresence()
    this.selected = null
  }

  clearRoomMessages(roomIds) {
    if (!Array.isArray(roomIds)) {
      throw new Error('room_ids must be type of array')
    }
    return this.userAdapter.clearRoomMessages(roomIds)
  }

  logging(message, params = {}) {
    if (this.debugMode) {
      console.log(message, params)
    }
  }

  getTotalUnreadCount() {
    return this.roomAdapter.getTotalUnreadCount().then(
      response => {
        return Promise.resolve(response)
      },
      error => {
        return Promise.reject(error)
      }
    )
  }

  publishEvent(...args) {
    this.customEventAdapter.publishEvent(...args)
  }

  subscribeEvent(...args) {
    this.customEventAdapter.subscribeEvent(...args)
  }

  unsubscribeEvent(...args) {
    this.customEventAdapter.unsubscribeEvent(...args)
  }

  setCustomHeader(headers) {
    if (is.not.json(headers))
      throw new TypeError('`headers` must have type of object')
    this._customHeader = headers
  }

  getUserProfile() {
    return this.userAdapter.getProfile()
  }

  get logger() {
    if (this.debugMode) return console.log.bind(console, 'Qiscus ->')
    return this.noop
  }

  noop() {}
}

class FileUploaded {
  constructor(name, roomId) {
    this.name = name
    this.roomId = roomId
    this.progress = 0
  }
}

export default QiscusSDK
