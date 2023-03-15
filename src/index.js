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
import { tryCatch } from './lib/util'
import Package from '../package.json'
import { Hooks, hookAdapterFactory } from './lib/adapters/hook'
import { ExpiredTokenAdapter } from './lib/adapters/expired-token'

// helper for setup publishOnlinePresence status
let setBackToOnline

const UpdateCommentStatusMode = Object.freeze({
  disabled: 'UpdateCommentStatusMode.disabled',
  throttled: 'UpdateCommentStatusMode.throttled',
  enabled: 'UpdateCommentStatusMode.enabled',
})

/**
 * Qiscus Web SDK Core Class
 *
 * @export
 * @class QiscusSDK
 */
class QiscusSDK {
  static UpdateCommentStatusMode = UpdateCommentStatusMode

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
    this.mqttURL = 'wss://realtime-jogja.qiscus.com:1886/mqtt'
    this.brokerLbUrl = 'https://realtime-lb.qiscus.com'
    this.syncOnConnect = 10000
    this.enableEventReport = false
    this.enableRealtime = true
    this.enableRealtimeCheck = true
    this.enableSync = true
    this.enableSyncEvent = false
    this.HTTPAdapter = null
    this.expiredTokenAdapter = null;
    this.realtimeAdapter = null
    this.customEventAdapter = null
    this.isInit = false
    this.isSynced = false
    this.syncInterval = 5000
    this.sync = 'socket' // possible values 'socket', 'http', 'both'
    this.enableLb = true
    this.httpsync = null
    this.eventsync = null
    this.extras = null
    this.last_received_comment_id = 0
    this.googleMapKey = ''
    this.options = {
      avatar: true,
    }
    this.isConfigLoaded = false
    this.updateCommentStatusMode = QiscusSDK.UpdateCommentStatusMode.enabled
    this.updateCommentStatusThrottleDelay = 300

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
    this._customHeader = {}
    this._forceEnableSync = true

    // to prevent double receive newmessages callback
    this.lastReceiveMessages = []

    this._hookAdapter = hookAdapterFactory()
    this._uploadURL = null

    this._autoRefreshToken = false
  }

  // this.uploadURL = `${this.baseURL}/api/v2/sdk/upload`
  get uploadURL() {
    return this._uploadURL || `${this.baseURL}/api/v2/sdk/upload`
  }
  set uploadURL(uploadURL) {
    this._uploadURL = uploadURL
  }

  /**
   * Initializing the SDK, set Event Listeners (callbacks)
   * @param {any} config - Qiscus SDK Configurations
   * @return {Promise<void>}
   */
  async init(config) {
    // set AppID
    if (!config.AppId) throw new Error('Please provide valid AppId')
    this.AppId = config.AppId

    // We need to disable realtime load balancing if user are using custom server
    // and did not provide a brokerLbUrl
    const isDifferentBaseUrl =
      config.baseURL != null && this.baseURL !== config.baseURL
    const isDifferentMqttUrl =
      config.mqttURL != null && this.mqttURL !== config.mqttURL
    const isDifferentBrokerLbUrl =
      config.brokerLbURL != null && this.brokerLbUrl !== config.brokerLbURL
    // disable realtime lb if user change baseUrl or mqttUrl but did not change
    // broker lb url
    if ((isDifferentBaseUrl || isDifferentMqttUrl) && !isDifferentBrokerLbUrl) {
      this.logger(
        '' +
        'force disable load balancing for realtime server, because ' +
        '`baseURL` or `mqttURL` get changed but ' +
        'did not provide `brokerLbURL`'
      )
      this.enableLb = false
    } else if (config.enableRealtimeLB != null) {
      this.enableLb = config.enableRealtimeLB
    }

    if (config.updateCommentStatusMode != null)
      this.updateCommentStatusMode = config.updateCommentStatusMode
    if (config.updateCommentStatusThrottleDelay != null)
      this.updateCommentStatusThrottleDelay =
        config.updateCommentStatusThrottleDelay
    if (config.baseURL) this.baseURL = config.baseURL
    if (config.mqttURL) this.mqttURL = config.brokerUrl || config.mqttURL
    if (config.mqttURL) this.brokerUrl = config.brokerUrl || config.mqttURL
    if (config.brokerLbURL) this.brokerLbUrl = config.brokerLbURL
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
    // this._customHeader = {}

    // set appConfig
    this.HTTPAdapter = new HttpAdapter({
      baseURL: this.baseURL,
      AppId: this.AppId,
      userId: this.user_id,
      version: this.version,
      getCustomHeader: () => this._customHeader,
    })

    /**
     * @callback SetterCallback
     * @param {string | number} value
     * @return void
     */
    /**
     * @typedef {string | number | boolean | null} Parameter
     */
    /**
     *
     * @param {Parameter} fromUser
     * @param {Parameter} fromServer
     * @param {Parameter} defaultValue
     * @return {Parameter}
     */

    const setterHelper = (fromUser, fromServer, defaultValue) => {
      if (fromServer === '') {
        if (fromUser != null) {
          if (typeof fromUser !== 'string') return fromUser
          if (fromUser.length > 0) return fromUser
        }
      }
      if (fromServer != null) {
        if (fromServer.length > 0) return fromServer
        if (typeof fromServer !== 'string') return fromServer
      }
      return defaultValue
    }

    const mqttWssCheck = (mqttResult) => {
      if (mqttResult.includes('wss://')) {
        return mqttResult
      } else {
        return `wss://${mqttResult}:1886/mqtt`
      }
    }

    this.withConfig = config.withConfig ?? true

    if (this.withConfig === true) {
      await this.HTTPAdapter.get_request('api/v2/sdk/config')
        .then((resp) => {
          resp.status == 200
            ? (this.isConfigLoaded = true)
            : (this.isConfigLoaded = false)
          return resp.body.results
        })
        .then((cfg) => {
          const baseUrl = this.baseURL // default value for baseUrl
          const brokerLbUrl = this.brokerLbUrl // default value for brokerLbUrl
          const mqttUrl = this.mqttURL // default value for brokerUrl
          const enableRealtime = this.enableRealtime // default value for enableRealtime
          const enableRealtimeCheck = this.enableRealtimeCheck // default value for enableRealtimeCheck
          const syncInterval = this.syncInterval // default value for syncInterval
          const syncIntervalWhenConnected = this.syncOnConnect // default value for syncIntervalWhenConnected
          const enableEventReport = this.enableEventReport // default value for enableEventReport
          const configExtras = {} // default value for extras



          this.baseURL = setterHelper(config.baseURL, cfg.base_url, baseUrl)
          this.brokerLbUrl = setterHelper(
            config.brokerLbURL,
            cfg.broker_lb_url,
            brokerLbUrl
          )
          this.mqttURL = mqttWssCheck(
            setterHelper(config.mqttURL, cfg.broker_url, mqttUrl)
          )
          this.enableRealtime = setterHelper(
            config.enableRealtime,
            cfg.enable_realtime,
            enableRealtime
          )
          this.syncInterval = setterHelper(
            config.syncInterval,
            cfg.sync_interval,
            syncInterval
          )
          this.syncOnConnect = setterHelper(
            config.syncOnConnect,
            cfg.sync_on_connect,
            syncIntervalWhenConnected
          )
          // since user never provide this value
          this.enableRealtimeCheck = setterHelper(
            null,
            cfg.enable_realtime_check,
            enableRealtimeCheck
          )
          this.enableEventReport = setterHelper(
            null,
            cfg.enable_event_report,
            enableEventReport
          )
          this.extras = setterHelper(null, cfg.extras, configExtras)
          this.enableSync = setterHelper(null, cfg.enable_sync, this.enableSync)
          this.enableSyncEvent = setterHelper(null, cfg.enable_sync_event, this.enableSyncEvent)
          this._autoRefreshToken = setterHelper(null, cfg.auto_refresh_token, false)
        })
        .catch((err) => {
          this.logger('got error when trying to get app config', err)
          this.isConfigLoaded = true
        })
    } else {
      this.isConfigLoaded = true
    }

    // set Event Listeners

    this._getMqttClientId = () => `${this.AppId}_${this.user_id}_${Date.now()}`

    this.realtimeAdapter = new MqttAdapter(this.mqttURL, this, this.isLogin, {
      brokerLbUrl: this.brokerLbUrl,
      enableLb: this.enableLb,
      shouldConnect: this.enableRealtime,
      getClientId: this._getMqttClientId,
    })
    this.realtimeAdapter.on('connected', () => {
      if (this.isLogin || !this.realtimeAdapter.connected) {
        this.last_received_comment_id = this.userData.last_comment_id
        this.updateLastReceivedComment(this.last_received_comment_id)
      }
    })
    this.realtimeAdapter.on('close', () => { })
    this.realtimeAdapter.on('reconnect', () => {
      this.options.onReconnectCallback?.()
    })
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
    this.realtimeAdapter.on('new-message', async (message) => {
      message = await this._hookAdapter.trigger(
        Hooks.MESSAGE_BEFORE_RECEIVED,
        message
      )
      this.events.emit('newmessages', [message])
    })
    this.realtimeAdapter.on('presence', (data) =>
      this.events.emit('presence', data)
    )
    this.realtimeAdapter.on('comment-deleted', (data) =>
      this.events.emit('comment-deleted', data)
    )
    this.realtimeAdapter.on('room-cleared', (data) =>
      this.events.emit('room-cleared', data)
    )
    this.realtimeAdapter.on('typing', (data) =>
      this.events.emit('typing', {
        message: data.message,
        username: data.userId,
        room_id: data.roomId,
      })
    )
    this.realtimeAdapter.on('message:updated', (message) => {
      if (this.options.messageUpdatedCallback != null) {
        this.options.messageUpdatedCallback(message)
      }
    })

    this.syncAdapter = SyncAdapter(() => this.HTTPAdapter, {
      getToken: () => this.userData.token,
      syncInterval: () => this.syncInterval,
      getShouldSync: () => this._forceEnableSync
        && (this.isLogin && !this.realtimeAdapter.connected),
      syncOnConnect: () => this.syncOnConnect,
      lastCommentId: () => this.last_received_comment_id,
      statusLogin: () => this.isLogin,
      enableSync: () => this.enableSync,
      enableSyncEvent: () => this.enableSyncEvent,
    })
    this.syncAdapter.on('message.new', async (message) => {
      message = await this._hookAdapter.trigger(
        Hooks.MESSAGE_BEFORE_RECEIVED,
        message
      )
      if (this.selected != null) {
        const index = this.selected.comments.findIndex(
          (it) =>
            it.id === message.id || it.unique_id === message.unique_temp_id
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
    this.syncAdapter.on('message.delivered', (message) => {
      this._setDelivered(
        message.comment_id,
        message.comment_unique_id,
        message.email
      )
    })
    this.syncAdapter.on('message.read', (message) => {
      this._setRead(
        message.comment_id,
        message.comment_unique_id,
        message.email
      )
    })
    this.syncAdapter.on('message.deleted', (data) => {
      data.deleted_messages.forEach((it) => {
        this.events.emit('comment-deleted', {
          roomId: it.room_id,
          commentUniqueIds: it.message_unique_ids,
          isForEveryone: true,
          isHard: true,
        })
      })
    })
    this.syncAdapter.on('room.cleared', (data) => {
      data.deleted_rooms.forEach((room) => {
        this.events.emit('room-cleared', room)
      })
    })

    this.customEventAdapter = CustomEventAdapter(
      this.realtimeAdapter,
      this.user_id
    )

    this.setEventListeners()
  }

  _setRead(messageId, messageUniqueId, userId) {
    if (this.selected == null) return
    const room = this.selected
    const message = room.comments.find(
      (it) => it.id === messageId || it.unique_id === messageUniqueId
    )
    if (message == null) return
    if (message.status === 'read') return

    const options = {
      participants: room.participants,
      actor: userId,
      comment_id: messageId,
      activeActorId: this.user_id,
    }
    room.comments.forEach((it) => {
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
      (it) => it.id === messageId || it.unique_id === messageUniqueId
    )
    if (message == null) return
    if (message.status === 'read') return

    const options = {
      participants: room.participants,
      actor: userId,
      comment_id: messageId,
      activeActorId: this.user_id,
    }
    room.comments.forEach((it) => {
      if (it.id <= message.id) {
        it.markAsDelivered(options)
      }
    })
    if (!message.isDelivered) return
    this.events.emit('comment-delivered', { comment: message, userId })
  }

  setEventListeners() {
    const self = this

    this.authAdapter = new AuthAdapter(self.HTTPAdapter)
    if (this.userData.email != null) {
      this.authAdapter.userId = this.userData.email
    }

    self.events.on('start-init', () => {
      self.HTTPAdapter = new HttpAdapter({
        baseURL: self.baseURL,
        AppId: self.AppId,
        userId: self.user_id,
        version: self.version,
        getCustomHeader: () => this._customHeader,
      })
      self.HTTPAdapter.setToken(self.userData.token)
    })

    self.events.on('room-changed', (room) => {
      this.logging('room changed', room)
      if (self.options.roomChangedCallback) {
        self.options.roomChangedCallback(room)
      }
    })

    self.events.on('file-uploaded', (url) => {
      if (self.options.fileUploadedCallback) {
        self.options.fileUploadedCallback(url)
      }
    })

    self.events.on('profile-updated', (user) => {
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
    self.events.on('newmessages', (comments) => {
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
      comments.forEach((comment) => {
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
            (c) => c.id === lastComment.comment_before_id
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
    this.events.on('login-success', (response) => {
      this.isLogin = true
      this.userData = response.user
      this.last_received_comment_id = this.userData.last_comment_id
      if (!this.realtimeAdapter.connected)
        this.updateLastReceivedComment(this.last_received_comment_id)

      // now that we have the token, etc, we need to set all our adapters
      this.HTTPAdapter = new HttpAdapter({
        baseURL: this.baseURL,
        AppId: this.AppId,
        userId: this.user_id,
        version: this.version,
        getCustomHeader: () => this._customHeader,
      })
      this.HTTPAdapter.setToken(this.userData.token)

      let user = response.user;
      this.expiredTokenAdapter = new ExpiredTokenAdapter({
        httpAdapter: this.HTTPAdapter,
        refreshToken: user.refresh_token,
        expiredAt: user.token_expires_at,
        userId: this.user_id,
        onTokenRefreshed: (token, refreshToken, expiredAt) => {
          this.userData.token = token
          this.userData.refresh_token = refreshToken
          this.userData.token_expires_at = expiredAt?.toJSON()
          this.events.emit('token-refreshed', { token, refreshToken, expiredAt })
        },
        getAuthenticationStatus: () => {
          return this.user_id != null && this.isLogin
        }
      })

      this.userAdapter = new UserAdapter(this.HTTPAdapter)
      this.roomAdapter = new RoomAdapter(this.HTTPAdapter)

      this.realtimeAdapter.subscribeUserChannel()
      if (this.presensePublisherId != null && this.presensePublisherId !== -1) {
        clearInterval(this.presensePublisherId)
      }
      this.presensePublisherId = setInterval(() => {
        this.realtimeAdapter.publishPresence(this.user_id, true)
      }, 3500)

      // if (this.sync === "http" || this.sync === "both") this.activateSync();
      if (this.options.loginSuccessCallback) {
        this.options.loginSuccessCallback(response)
      }

      this.authAdapter.userId = this.userData.email
      this.authAdapter.refreshToken = this.userData.refresh_token
      this.authAdapter.autoRefreshToken = this._autoRefreshToken
    })

    /**
     * Called when there's something wrong when connecting to qiscus SDK
     */
    self.events.on('login-error', function (error) {
      if (self.options.loginErrorCallback) {
        self.options.loginErrorCallback(error)
      }
    })
    self.events.on('token-refreshed', (param) => {
      this.options.authTokenRefreshedCallback?.(param)
    })

    self.events.on('room-cleared', function (room) {
      // find room
      if (self.selected) {
        const currentRoom = self.selected
        if (self.selected.unique_id === room.unique_id) {
          self.selected = null
          self.selected = currentRoom
        }
      }
      if (self.options.roomClearedCallback) {
        self.options.roomClearedCallback(room)
      }
    })

    self.events.on('comment-deleted', function (data) {
      // get to the room id and delete the comment
      const {
        roomId,
        commentUniqueIds,
        // eslint-disable-next-line
        isForEveryone,
        isHard,
      } = data
      if (self.selected && self.selected.id == roomId) {
        // loop through the array of unique_ids
        commentUniqueIds.map((id) => {
          const commentToBeFound = self.selected.comments.findIndex(
            (comment) => comment.unique_id === id
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
    self.events.on('comment-delivered', function (response) {
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
    self.events.on('chat-room-created', function (response) {
      self.isLoading = false
      if (self.options.chatRoomCreatedCallback) {
        self.options.chatRoomCreatedCallback(response)
      }
    })

    /**
     * Called when a new room with type of group has been created
     */
    self.events.on('group-room-created', function (response) {
      self.isLoading = false
      if (self.options.groupRoomCreatedCallback) {
        self.options.groupRoomCreatedCallback(response)
      }
    })

    /**
     * Called when user clicked on Chat SDK Header
     */
    self.events.on('header-clicked', function (response) {
      if (self.options.headerClickedCallback) {
        self.options.headerClickedCallback(response)
      }
    })

    /**
     * Called when a comment has been read
     */
    self.events.on('comment-read', function (response) {
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
      if (self.options.presenceCallback)
        self.options.presenceCallback(message, userId)
    })

    self.events.on('typing', function (data) {
      if (self.options.typingCallback) self.options.typingCallback(data)
    })

    /**
     * Called when user clicked on Message Info
     */
    self.events.on('message-info', function (response) {
      if (self.options.messageInfoCallback) {
        self.options.messageInfoCallback(response)
      }
    })

    /**
     * Called when new particant was added into a group
     */
    self.events.on('participants-added', (response) => {
      if (response == null || this.selected == null) return
      this.selected.participants.push(...response)
    })

    /**
     * Called when particant was removed from a group
     */
    self.events.on('participants-removed', (response) => {
      if (response == null || this.selected == null) return
      const participants = this.selected.participants.filter(
        (participant) => response.indexOf(participant.email) <= -1
      )
      this.selected.participants = participants
    })

    /**
     * Called when user was added to blocked list
     */
    self.events.on('block-user', function (response) {
      if (self.options.blockUserCallback) {
        self.options.blockUserCallback(response)
      }
    })

    /**
     * Called when user was removed from blocked list
     */
    self.events.on('unblock-user', function (response) {
      if (self.options.unblockUserCallback) {
        self.options.unblockUserCallback(response)
      }
    })
  }

  onReconnectMqtt() {
    if (this.options.onReconnectCallback) this.options.onReconnectedCallback()
    if (!this.selected) return
    this.loadComments(this.selected.id)
  }

  _callNewMessagesCallback(comments) {
    if (this.options.newMessagesCallback) {
      this.options.newMessagesCallback(comments)
    }
  }

  updateLastReceivedComment(id) {
    if (this.last_received_comment_id < id) {
      this.last_received_comment_id = id
    }
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

    self.user_id = userId
    self.key = key
    self.username = username
    self.avatar_url = avatarURL

    let params = {
      email: this.user_id,
      password: this.key,
      username: this.username,
      extras: extras ? JSON.stringify(extras) : null,
    }
    if (this.avatar_url) params.avatar_url = this.avatar_url

    return new Promise((resolve, reject) => {
      let waitingConfig = setInterval(() => {
        if (!this.isConfigLoaded) {
          if (this.debugMode) {
            this.logger('Waiting for init config...')
          }
        } else {
          clearInterval(waitingConfig)
          this.logger('Config Success!')
          self.events.emit('start-init')
          let login$ = self.authAdapter.loginOrRegister(params).then(
            (response) => {
              self.isInit = true
              self.refresh_token = response.user.refresh_token
              self.events.emit('login-success', response)
              this.realtimeAdapter.connect()
              resolve(response)
            },
            (error) => {
              self.events.emit('login-error', error)
              reject(error)
            }
          )

          return login$;
        }
      }, 300)
    })
  }

  setUserWithIdentityToken(data) {
    if (!data || !('user' in data)) return this.events.emit('login-error', data)
    this.email = data.user.email
    this.user_id = data.user.email
    this.key = data.identity_token
    this.username = data.user.username
    this.avatar_url = data.user.avatar_url
    this.isInit = true
    let waitingConfig = setInterval(() => {
      if (!this.isConfigLoaded) {
        if (this.debugMode) {
          this.logger('Waiting for init config...')
        }
      } else {
        clearInterval(waitingConfig)
        this.logger('Config Success!')
        this.events.emit('login-success', data)
      }
    }, 300)
  }

  refreshAuthToken() {
    return this.expiredTokenAdapter.refreshAuthToken();
  }

  publishOnlinePresence(val) {
    if (val === true) {
      setBackToOnline = setInterval(() => {
        this.realtimeAdapter.publishPresence(this.user_id, true)
      }, 3500)
    } else {
      clearInterval(this.presensePublisherId)
      clearInterval(setBackToOnline)
      setTimeout(() => {
        this.realtimeAdapter.publishPresence(this.user_id, false)
      }, 3500)
    }
  }

  subscribeUserPresence(userId) {
    this.realtimeAdapter.subscribeUserPresence(userId)
  }

  unsubscribeUserPresence(userId) {
    this.realtimeAdapter.unsubscribeUserPresence(userId)
  }

  async logout() {
    await this.expiredTokenAdapter.logout()
    clearInterval(this.presensePublisherId)
    this.publishOnlinePresence(false)
    this.selected = null
    this.isInit = false
    this.isLogin = false
    this.realtimeAdapter.disconnect()
    this.userData = {}
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
          (p) => p.email !== this.user_id
        )
        if (unsubscribedUserId.length > 0) {
          this.realtimeAdapter.unsubscribeRoomPresence(
            unsubscribedUserId[0].email
          )
        }
      }
    }
    if (room.participants == null) room.participants = []
    const targetUserId = room.participants.find((p) => p.email !== this.user_id)
    this.chatmateStatus = null
    this.isTypingStatus = null
    this.selected = room
    // found a bug where there's a race condition, subscribing to mqtt
    // while mqtt is still connecting, so we'll have to do this hack
    const initialSubscribe = setInterval(() => {
      // Clear Interval when realtimeAdapter has been Populated

      if (this.debugMode) {
        this.logger('Trying Initial Subscribe')
      }

      if (this.realtimeAdapter != null) {
        if (this.debugMode) {
          this.logger('MQTT Connected')
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
          this.logger('Retry')
        }
      } else {
        if (this.debugMode) {
          this.logger('MQTT Not Connected, yet')
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
    return this.roomAdapter
      .getOrCreateRoom(userId, options, distinctId)
      .then(async (resp) => {
        const room = new Room(resp)

        this.updateLastReceivedComment(room.last_comment_id)
        this.isLoading = false

        const mapIntercept = async (it) => {
          return await this._hookAdapter.trigger(
            Hooks.MESSAGE_BEFORE_RECEIVED,
            it
          )
        }
        room.comments = await Promise.all(
          room.comments.map((comment) => mapIntercept(comment))
        )

        this.setActiveRoom(room)
        // id of last comment on this room
        const lastComment = room.comments[room.comments.length - 1]
        if (lastComment) this.readComment(room.id, lastComment.id)
        this.events.emit('chat-room-created', {
          room: room,
        })

        if (!initialMessage) return room

        const topicId = room.id
        return this.sendComment(topicId, initialMessage)
          .then(() => Promise.resolve(room))
          .catch((err) => {
            console.error('Error when submit comment', err)
          })
      })
      .catch((err) => {
        console.error('Error when creating room', err)
        this.isLoading = false
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
    const self = this
    if (!self.isInit) return
    return self.getRoomById(id).then(
      (response) => {
        return Promise.resolve(response)
      },
      (err) => Promise.reject(err)
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

    return self.roomAdapter
      .getRoomById(id)
      .then(async (resp) => {
        const roomData = resp.results.room
        const comments = []
        for (const comment of resp.results.comments.reverse()) {
          const c = await this._hookAdapter.trigger(
            Hooks.MESSAGE_BEFORE_RECEIVED,
            comment
          )
          comments.push(c)
        }
        // .map((it) =>
        //   this._hookAdapter.trigger(Hooks.MESSAGE_BEFORE_RECEIVED, it)
        // );
        const room = new Room({
          ...roomData,
          comments,
          name: roomData.room_name,
        })

        self.updateLastReceivedComment(room.last_comment_id)
        self.setActiveRoom(room)
        self.isLoading = false
        // id of last comment on this room
        const lastComment = room.comments[room.comments.length - 1]
        if (lastComment) self.readComment(room.id, lastComment.id)
        if (room.isChannel) {
          this.realtimeAdapter.subscribeChannel(this.AppId, room.unique_id)
        }
        return room
      })
      .catch((error) => {
        console.error('Error getting room by id', error)
        return Promise.reject(error)
      })
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
      .then(async (response) => {
        // make sure the room hasn't been pushed yet
        let room = new Room(response)
        self.updateLastReceivedComment(room.last_comment_id)
        const mapIntercept = async (item) =>
          await this._hookAdapter.trigger(Hooks.MESSAGE_BEFORE_RECEIVED, item)
        room.comments = await Promise.all(
          room.comments.map((it) => mapIntercept(it))
        )
        self.setActiveRoom(room)
        self.isLoading = false
        const lastComment = room.comments[room.comments.length - 1]
        if (lastComment) self.readComment(room.id, lastComment.id)
        this.realtimeAdapter.subscribeChannel(this.AppId, room.unique_id)
        return Promise.resolve(room)
        // self.events.emit('group-room-created', self.selected)
      })
      .catch((error) => {
        // console.error('Error getting room by id', error)
        return Promise.reject(error)
      })
  }

  getOrCreateRoomByChannel(channel, name, avatarURL) {
    return this.getOrCreateRoomByUniqueId(channel, name, avatarURL)
  }

  sortComments() {
    this.selected &&
      this.selected.comments.sort(function (leftSideComment, rightSideComment) {
        return leftSideComment.unix_timestamp - rightSideComment.unix_timestamp
      })
  }

  async loadRoomList(params = {}) {
    const rooms = await this.userAdapter.loadRoomList(params)
    return rooms.map((room) => {
      room.last_comment_id = room.last_comment.id
      room.last_comment_message = room.last_comment.message
      room.last_comment_message_created_at = room.last_comment.timestamp
      room.room_type = room.chat_type
      room.comments = []
      return new Room(room)
    })
  }

  loadComments(roomId, options = {}) {
    return this.userAdapter
      .loadComments(roomId, options)
      .then(async (comments_) => {
        const comments = []
        for (const comment of comments_) {
          comments.push(
            await this._hookAdapter.trigger(
              Hooks.MESSAGE_BEFORE_RECEIVED,
              comment
            )
          )
        }

        if (this.selected != null) {
          this.selected.receiveComments(comments.reverse())
          this.sortComments()
        }
        return comments
      })
  }

  loadMore(lastCommentId, options = {}) {
    if (this.selected == null) return
    options.last_comment_id = lastCommentId
    options.after = false
    return this.loadComments(this.selected.id, options)
  }

  async registerDeviceToken(token, isDevelopment = false) {
    const res = await this.HTTPAdapter.post(
      'api/v2/sdk/set_user_device_token',
      {
        device_token: token,
        device_platform: 'rn',
        is_development: isDevelopment,
      }
    )
    return res.body.results
  }
  async removeDeviceToken(token, isDevelopment = false) {
    const res = await this.HTTPAdapter.post(
      'api/v2/sdk/remove_user_device_token',
      {
        device_token: token,
        device_platform: 'rn',
        is_development: isDevelopment,
      }
    )
    return res.body.results
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
    return messages.map((message) => {
      return new Comment(message)
    })
  }

  updateProfile(user) {
    return this.userAdapter.updateProfile(user).then(
      (res) => {
        this.events.emit('profile-updated', user)
        this.userData = res
        return Promise.resolve(res)
      },
      (err) => this.logger(err)
    )
  }

  getNonce() {
    return request
      .post(`${this.baseURL}/api/v2/sdk/auth/nonce`)
      .send()
      .set('qiscus_sdk_app_id', `${this.AppId}`)
      .set('qiscus_sdk_version', `${this.version}`)
      .then(
        (res) => Promise.resolve(res.body.results),
        (err) => Promise.reject(err)
      )
  }

  verifyIdentityToken(identityToken) {
    return request
      .post(`${this.baseURL}/api/v2/sdk/auth/verify_identity_token`)
      .send({
        identity_token: identityToken,
      })
      .set('qiscus_sdk_app_id', `${this.AppId}`)
      .set('qiscus_sdk_version', `${this.version}`)
      .then(
        (res) => Promise.resolve(res.body.results),
        (err) => Promise.reject(err)
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
  async sendComment(
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
      user_extras: this.userData.user_extras,
      id: Math.round(Date.now() * 1e6 + Date.now()),
      type: type || 'text',
      timestamp: format(new Date()),
      unique_id: uniqueId ? String(uniqueId) : null,
      payload: tryCatch(
        () => JSON.parse(payload),
        payload,
        (error) => this.logger('Error when parsing payload', error.message)
      ),
    }
    const pendingComment = self.prepareCommentToBeSubmitted(commentData)

    // push this comment unto active room
    if (type === 'reply') {
      // change payload for pendingComment
      // get the comment for current replied id
      var parsedPayload = JSON.parse(payload)
      var repliedMessage = self.selected.comments.find(
        (cmt) => cmt.id === parsedPayload.replied_comment_id
      )
      parsedPayload.replied_comment_message =
        repliedMessage.type === 'reply'
          ? repliedMessage.payload.text
          : repliedMessage.message
      parsedPayload.replied_comment_sender_username = repliedMessage.username_as
      pendingComment.payload = parsedPayload
    }
    const extrasToBeSubmitted = extras || self.extras

    let messageData = await this._hookAdapter.trigger(
      Hooks.MESSAGE_BEFORE_SENT,
      {
        ...pendingComment,
        extras: extrasToBeSubmitted,
      }
    )
    messageData = self.prepareCommentToBeSubmitted(messageData)

    if (self.selected) self.selected.comments.push(messageData)

    return this.userAdapter
      .postComment(
        '' + topicId,
        messageData.message,
        messageData.unique_id,
        messageData.type,
        messageData.payload,
        messageData.extras
      )
      .then(async (res) => {
        res = await this._hookAdapter.trigger(
          Hooks.MESSAGE_BEFORE_RECEIVED,
          res
        )
        Object.assign(messageData, res)

        if (!self.selected) return Promise.resolve(messageData)
        // When the posting succeeded, we mark the Comment as sent,
        // so all the interested party can be notified.
        messageData.markAsSent()
        messageData.id = res.id
        messageData.before_id = res.comment_before_id
        // update the timestamp also then re-sort the comment list
        messageData.unix_timestamp = res.unix_timestamp

        self.sortComments()

        return messageData
      })
      .catch((err) => {
        messageData.markAsFailed()
        return Promise.reject(err)
      })
  }

  // #endregion
  getUsers(query = '', page = 1, limit = 20) {
    return this.HTTPAdapter.get_request('api/v2/sdk/get_user_list')
      .query({
        query,
        page,
        limit,
      })
      .then((resp) => {
        return Promise.resolve(resp.body.results)
      })
  }

  getParticipants(roomUniqueId, page = 1, limit = 20) {
    return this.HTTPAdapter.get_request('api/v2/sdk/room_participants')
      .query({
        room_unique_id: roomUniqueId,
        page,
        limit,
      })
      .then((resp) => resp.body.results)
  }
  getRoomParticipants(roomUniqueId, offset = 0) {
    console.warn(
      '`getRoomParticipants` are deprecated, use `getParticipants` instead.'
    )
    return this.HTTPAdapter.get_request('api/v2/sdk/room_participants')
      .query({
        room_unique_id: roomUniqueId,
        offset,
      })
      .then((resp) => {
        return Promise.resolve(resp.body.results)
      })
  }

  resendComment(comment) {
    if (this.selected == null) return
    var self = this
    var room = self.selected
    var pendingComment = room.comments.find(
      (cmtToFind) => cmtToFind.id === comment.id
    )

    const extrasToBeSubmitted = self.extras
    return this.userAdapter
      .postComment(
        '' + room.id,
        pendingComment.message,
        pendingComment.unique_id,
        comment.type,
        comment.payload,
        extrasToBeSubmitted
      )
      .then(
        (res) => {
          // When the posting succeeded, we mark the Comment as sent,
          // so all the interested party can be notified.
          pendingComment.markAsSent()
          pendingComment.id = res.id
          pendingComment.before_id = res.comment_before_id
          return new Promise((resolve, reject) => resolve(self.selected))
        },
        (err) => {
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
    if (is.not.array(values)) {
      return Promise.reject(new Error('`values` must have type of array'))
    }

    const participants = this.selected.participants
    if (!participants) {
      return Promise.reject(new Error('Nothing selected room chat.'))
    }
    // start to changes selected participants with newest values
    let participantsExclude = participants
    if (payload === 'id') {
      participantsExclude = participants.filter(
        (participant) => values.indexOf(participant.id) <= -1
      )
    }
    if (payload === 'email') {
      participantsExclude = participants.filter(
        (participant) => values.indexOf(participant.email) <= -1
      )
    }
    if (payload === 'username') {
      participantsExclude = participants.filter(
        (participant) => values.indexOf(participant.username) <= -1
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
      .then((res) => {
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
      (res) => {
        self.events.emit('participants-added', res)
        return Promise.resolve(res)
      },
      (err) => Promise.reject(err)
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
    if (is.not.array(emails)) {
      return Promise.reject(new Error('`emails` must have type of array'))
    }
    return this.roomAdapter
      .removeParticipantsFromGroup(roomId, emails)
      .then((res) => {
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
      (res) => {
        return Promise.resolve(res)
      },
      (err) => Promise.reject(err)
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
      (res) => {
        self.events.emit('block-user', res)
        return Promise.resolve(res)
      },
      (err) => Promise.reject(err)
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
      (res) => {
        self.events.emit('unblock-user', res)
        return Promise.resolve(res)
      },
      (err) => Promise.reject(err)
    )
  }

  getUserPresences(email = []) {
    if (is.not.array(email)) {
      return Promise.reject(new Error('`email` must have type of array'))
    }

    const self = this
    return self.userAdapter.getUserPresences(email).then(
      (res) => {
        self.events.emit('user-status', res)
        return Promise.resolve(res)
      },
      (err) => Promise.reject(err)
    )
  }
  upload(file, callback) {
    let req = request.post(this.uploadURL);

    req = this.HTTPAdapter.setupHeaders(req)
    return req.attach('file', file)
      .on('progress', (event) => {
        if (event.direction === 'upload') callback(null, event)
      })
      .then((resp) => {
        const url = resp.body.results.file.url
        callback(null, null, resp.body.results.file.url)
        return Promise.resolve(url)
      })
      .catch((error) => {
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
    var xhr = new XMLHttpRequest()
    xhr.open('POST', `${self.baseURL}/api/v2/sdk/upload`, true)
    xhr.setRequestHeader('qiscus_sdk_app_id', `${self.AppId}`)
    xhr.setRequestHeader('qiscus_sdk_user_id', `${self.user_id}`)
    xhr.setRequestHeader('qiscus_sdk_token', `${self.userData.token}`)
    xhr.onload = function () {
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
      (file) => file.name === name && file.roomId === roomId
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
        (res) => {
          this.events.emit('comment-deleted', {
            roomId,
            commentUniqueIds,
            isForEveryone,
            isHard,
          })
          return Promise.resolve(res)
        },
        (err) => Promise.reject(err)
      )
  }

  clearRoomsCache() {
    // remove all room except currently selected
    if (this.selected) {
      // clear the map
      this.room_name_id_map = {
        [this.selected.name]: this.selected.id,
      }
      // get current index and array length
      const roomLength = this.rooms.length
      let curIndex = this.rooms.findIndex(
        (room) => room.id === this.selected.id
      )
      if (!(curIndex + 1 === roomLength)) {
        this.rooms.splice(curIndex + 1, roomLength - (curIndex + 1))
      }
      // ambil ulang cur index nya, klo udah di awal ga perlu lagi kode dibawah ini
      curIndex = this.rooms.findIndex((room) => room.id === this.selected.id)
      if (curIndex > 0 && this.rooms.length > 1) {
        this.rooms.splice(1, this.rooms.length - 1)
      }
    }
  }

  exitChatRoom() {
    // remove all subscriber
    this.realtimeAdapter.unsubscribeTyping()
    tryCatch(
      () =>
        this.selected.participants
          .filter((it) => it.email !== this.user_id)
          .map((it) => it.email),
      null,
      this.noop,
      (userIds) =>
        userIds.forEach((userId) =>
          this.realtimeAdapter.unsubscribeRoomPresence(userId)
        )
    )
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
      (response) => {
        return Promise.resolve(response)
      },
      (error) => {
        return Promise.reject(error)
      }
    )
  }
  getRoomUnreadCount() {
    return this.roomAdapter.getRoomUnreadCount()
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
    if (is.not.json(headers)) {
      throw new TypeError('`headers` must have type of object')
    }
    this._customHeader = headers
  }

  getUserProfile() {
    return this.userAdapter.getProfile()
  }

  static Interceptor = Hooks
  get Interceptor() {
    return Hooks
  }
  intercept(interceptor, callback) {
    return this._hookAdapter.intercept(interceptor, callback)
  }

  getThumbnailURL(fileURL) {
    const reURL = /^https?:\/\/\S+(\/upload\/)\S+(\.\w+)$/i
    return fileURL.replace(reURL, (match, g1, g2) =>
      match.replace(g1, '/upload/w_320,h_320,c_limit/').replace(g2, '.png')
    )
  }
  getBlurryThumbnailURL(fileURL) {
    const reURL = /^https?:\/\/\S+(\/upload\/)\S+(\.\w+)$/i
    return fileURL.replace(reURL, (match, g1, g2) =>
      match
        .replace(g1, '/upload/w_320,h_320,c_limit,e_blur:300/')
        .replace(g2, '.png')
    )
  }

  get logger() {
    if (this.debugMode) return console.log.bind(console, 'Qiscus ->')
    return this.noop
  }

  noop() { }

  get _throttleDelay() {
    if (
      this.updateCommentStatusMode === QiscusSDK.UpdateCommentStatusMode.enabled
    ) {
      return 0
    }
    return this.updateCommentStatusThrottleDelay || 300
  }
  get _updateStatusEnabled() {
    return (
      this.updateCommentStatusMode !==
      QiscusSDK.UpdateCommentStatusMode.disabled
    )
  }

  _updateStatus(roomId, commentId1 = null, commentId2 = null) {
    // The rules:
    // if it is receive command
    // - it is prohibited to send command if current room are channel
    // - it is ok to send command even if no room selected
    // - it is prohibited to send command when `updateCommentStatusMode` is `disabled`
    // if it is read command
    // - it is prohibited to send command if current room are channel
    // - it is prohibited to send command if no room selected (but why was this a thing?)
    // - it is ok to send command when `updateCommentStatusMode` is `disabled`

    const isReceiveCommand = commentId2 != null
    const isReadCommand = commentId1 != null
    const isSelected =
      (this.selected != null && this.selected.id === roomId) || false
    const isChannel =
      (this.selected != null && this.selected.isChannel) || false
    const isUpdateStatusDisabled = !this._updateStatusEnabled

    const command = (() => {
      if (isReadCommand) return 'read'
      if (isReceiveCommand) return 'receive'
    })()
    const isAbleToRunCommand = (() => {
      if (isChannel) return false
      if (isReceiveCommand && isUpdateStatusDisabled) return false
      return true
    })()

    if (this.debugMode) {
      console.group('update-command-status')
      console.log(
        'run:',
        command,
        `on: roomId(${roomId}) commentId(${commentId1 || commentId2})`
      )
      console.log('is able to run command?', isAbleToRunCommand)
      console.groupEnd()
    }

    if (!isAbleToRunCommand) return false

    this.userAdapter
      .updateCommentStatus(roomId, commentId1, commentId2)
      .catch((err) => { })
  }

  _readComment = (roomId, commentId) => this._updateStatus(roomId, commentId)
  _readCommentT = this._throttle(
    (roomId, commentId) => {
      this._updateStatus(roomId, commentId)
    },
    () => this._throttleDelay
  )
  _deliverComment = (roomId, commentId) =>
    this._updateStatus(roomId, undefined, commentId)
  _deliverCommentT = this._throttle(
    (roomId, commentId) => {
      this._updateStatus(roomId, undefined, commentId)
    },
    () => this._throttleDelay
  )

  readComment(roomId, commentId) {
    if (
      this.updateCommentStatusMode === QiscusSDK.UpdateCommentStatusMode.enabled
    )
      return this._readComment(roomId, commentId)
    return this._readCommentT(roomId, commentId)
  }

  receiveComment(roomId, commentId) {
    if (
      this.updateCommentStatusMode === QiscusSDK.UpdateCommentStatusMode.enabled
    )
      return this._deliverComment(roomId, commentId)
    return this._deliverCommentT(roomId, commentId)
  }

  _throttle(func, getWait) {
    let isWaiting = false

    return (...args) => {
      let waitTime = getWait()

      if (!isWaiting) {
        func(...args)
        isWaiting = true

        setTimeout(() => (isWaiting = false), waitTime)
      }
    }
  }

  /**
   * @typedef {Object} SearchMessageParams
   * @property {string} query
   * @property {Array.<number>} roomIds
   * @property {string} userId
   * @property {Array.<string>} type
   * @property {string} roomType
   * @property {number} page
   * @property {number} limit
   */
  /**
   *
   * @param {SearchMessageParams} param0
   * @returns {Array.<Object>}
   */
  async searchMessage({
    query,
    roomIds = [],
    userId,
    type,
    roomType,
    page,
    limit,
  } = {}) {
    const url = 'api/v2/sdk/search'

    const isValidRoomType = ['group', 'single', 'channel'].some(
      (it) => it === roomType
    )
    if (roomType != null && !isValidRoomType) {
      return Promise.reject(
        'Invalid room type, valid room type are: `group`, `single`, and `channel`'
      )
    }

    const room = ((roomType) => {
      const rType =
        roomType == null
          ? undefined
          : roomType === 'single'
            ? 'single'
            : 'group'
      const isPublic =
        roomType == null ? undefined : roomType === 'channel' ? true : false

      return {
        type: rType,
        isPublic: isPublic,
      }
    })(roomType)

    return this.HTTPAdapter.post_json(url, {
      token: this.token,
      query: query,
      sender: userId,
      type: type,
      room_ids: roomIds.map((it) => String(it)),
      room_type: room.type || undefined,
      is_public: room.isPublic || undefined,
      page: page,
      limit: limit,
    }).then((res) => res.body)
  }

  /**
   * @typedef {Object} GetFileListParams
   * @property {Array.<number>} roomIds
   * @property {String} fileType
   * @property {Number} page
   * @property {Number} limit
   * @property {String} includeExtensions
   * @property {String} excludeExtensions
   * @property {String} userId
   */
  /**
   * @param {GetFileListParams} param0
   */
  async getFileList({
    roomIds = [],
    fileType,
    page,
    limit,
    sender,
    userId,
    includeExtensions,
    excludeExtensions,
  } = {}) {
    const url = 'api/v2/sdk/file_list'

    if (!this.isLogin)
      return Promise.reject('You need to login to use this method')

    // intended to check for undefined, so user can provide user
    // with null. If null, backend can determine that we want to
    // list files for all users
    if (sender === undefined) {
      sender = this.user_id
    }
    if (userId === undefined) {
      sender = userId = this.user_id
    }

    let opts = {
      room_ids: roomIds.map((it) => String(it)),
      file_type: fileType,
      page: page,
      limit: limit,
      include_extensions: includeExtensions,
      exclude_extensions: excludeExtensions,
    }

    if (sender != null) opts['sender'] = sender

    return this.HTTPAdapter.post_json(url, opts).then((res) => res.body)
  }

  _generateUniqueId() {
    return `javascript-${Date.now()}`
  }

  generateMessage({ roomId, text, extras }) {
    const id = Date.now()
    const comment = new Comment({
      id,
      message: text,
      room_id: roomId,
      extras: extras,
      timestamp: new Date(),
      unique_id: this._generateUniqueId(),
      before_id: 0,
      username: this.userData.username,
      email: this.userData.email,
      status: 'pending',
      type: 'text',
    })
    return comment
  }
  generateFileAttachmentMessage({
    roomId,
    caption,
    url,
    text = 'File attachment',
    extras,
    filename,
    size,
  }) {
    const id = Date.now()
    const comment = new Comment({
      id,
      message: text,
      room_id: roomId,
      extras: extras,
      timestamp: new Date(),
      unique_id: this._generateUniqueId(),
      before_id: 0,
      username: this.userData.username,
      email: this.userData.email,
      status: 'pending',
      type: 'file_attachment',
      payload: {
        url,
        file_name: filename,
        size,
        caption,
      },
    })
    return comment
  }
  generateCustomMessage({ roomId, text, type, payload, extras }) {
    const id = Date.now()
    const comment = new Comment({
      id,
      message: text,
      room_id: roomId,
      extras: extras,
      timestamp: new Date(),
      unique_id: this._generateUniqueId(),
      before_id: 0,
      username: this.userData.username,
      email: this.userData.email,
      status: 'pending',
      type: 'custom',
      payload: { type, content: payload },
    })
    return comment
  }
  generateReplyMessage({ roomId, text, repliedMessage, extras }) {
    const id = Date.now()

    const comment = new Comment({
      id,
      message: text,
      room_id: roomId,
      extras: extras,
      timestamp: new Date(),
      unique_id: this._generateUniqueId(),
      before_id: 0,
      username: this.userData.username,
      email: this.userData.email,
      status: 'pending',
      type: 'reply',
      payload: {
        text: text,
        replied_comment_id: repliedMessage.id,
        replied_comment_message: repliedMessage.message,
        replied_comment_type: repliedMessage.type,
        replied_comment_payload: repliedMessage.payload,
        replied_comment_sender_username: repliedMessage.username_as,
        replied_comment_sender_email: repliedMessage.username_real,
      },
    })
    return comment
  }

  async updateMessage(message) {
    return this.userAdapter.updateMessage(message)
  }
  onMessageUpdated(handler) {
    this.realtimeAdapter.on('message:updated', handler)
    return () => this.realtimeAdapter.off('message:updated', handler)
  }

  /**
   * Manually close connection to mqtt server
   * @return {Promise<boolean>} Wheter successfully close mqtt connection or not
   */
  async closeRealtimeConnection() {
    return this.realtimeAdapter.closeConnection()
  }

  /**
   * Manually open connection to mqtt server
   * @return {Promise<boolean>} Wheter successfully connect to mqtt server or not
   */
  async openRealtimeConnection() {
    return this.realtimeAdapter.openConnection()
  }

  async startSync() {
    this._forceEnableSync = true;
  }
  async stopSync() {
    this._forceEnableSync = false;
  }
}

class FileUploaded {
  constructor(name, roomId) {
    this.name = name
    this.roomId = roomId
    this.progress = 0
  }
}

export default QiscusSDK
