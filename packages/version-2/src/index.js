import throttle from 'lodash.throttle'
import mitt from 'mitt'
import is from './lib/is'
import format from 'date-fns/format'
import distanceInWordsToNow from 'date-fns/distance_in_words_to_now'
import Comment from './lib/Comment'
import Room from './lib/Room'
import HttpAdapter from './lib/adapters/http'
import AuthAdapter from './lib/adapters/auth'
import MqttAdapter from './lib/adapters/mqtt'
import CustomEventAdapter from './lib/adapters/custom-event'
import SyncAdapter from './lib/adapters/sync'
import { delayed } from './lib/utils'
import { tryCatch } from './lib/util'
import Package from '../package.json'
import { Hooks, hookAdapterFactory, Api, Provider } from '@qiscus/core-v3'
import { ExpiredTokenAdapter } from './lib/adapters/expired-token'
import { makeDeps } from './compat/deps'
import { rawRoomToV2, rawCreatedRoomToV2 } from './compat/to-v2'

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

    // Phase 1 re-platform (docs/v2-on-core-v3-plan.md §4a/§9): lazily-built,
    // memoized core-v3 `QiscusDeps` bundle wired to this instance's own
    // `HTTPAdapter` (see `compat/deps.js`/`compat/requester.js`). Built on
    // first access via the `deps` getter below, not here in the
    // constructor, since it needs `this.HTTPAdapter` to exist (i.e. must be
    // accessed post-`init()`).
    this._deps = null
  }

  // this.uploadURL = `${this.baseURL}/api/v2/sdk/upload`
  get uploadURL() {
    return this._uploadURL || `${this.baseURL}/api/v2/sdk/upload`
  }
  set uploadURL(uploadURL) {
    this._uploadURL = uploadURL
  }

  /**
   * Lazily-built, memoized core-v3 `QiscusDeps` bundle (docs/v2-on-core-v3-plan.md
   * §4/§4a/§9 Phase 1). Built once, on first access, from `makeDeps(this)` —
   * NOT rebuilt per call. Only meaningful after `init()` has set
   * `this.HTTPAdapter`; re-platformed methods that read `this.deps` are only
   * ever called post-`init()`, same as today.
   * @returns {import('@qiscus/core-v3').QiscusDeps}
   */
  get deps() {
    if (this._deps == null) {
      this._deps = makeDeps(this)
    }
    // Keep the core-v3 storage's MUTABLE fields live: `makeDeps` seeds them
    // once, but the memoized `deps` is reused across the instance's lifetime,
    // so a re-login (new `userData`) would otherwise leave `storage` stale.
    // The token itself is now written directly to `storage` at every
    // set site (login, `ExpiredTokenAdapter.refreshAuthToken`) — see
    // `lib/adapters/expired-token.js` — so it no longer needs a re-sync here.
    // A few methods still read `storage` VALUES directly — e.g. `updateUser`'s
    // `s.getCurrentUser().id` — so re-sync that here on every access (cheap).
    const storage = this._deps.storage
    if (this.user_id != null && typeof storage.setCurrentUser === 'function') {
      storage.setCurrentUser(this.userData)
    }
    // full-shell P5: `init()`'s config negotiation can change `this.baseURL`/
    // `this.mqttURL`/`this.brokerLbUrl` (and, in principle, `this.version`/
    // `this._customHeader`) AFTER `deps` was first built — leaving `storage`
    // stale for any descriptor built off it (e.g. `Provider.withBaseUrl`).
    // Re-sync those too, on every access (cheap; guarded setters).
    storage.setBaseUrl(this.baseURL)
    if (typeof storage.setBrokerUrl === 'function') {
      storage.setBrokerUrl(this.mqttURL)
    }
    if (typeof storage.setVersion === 'function') {
      storage.setVersion(this.version)
    }
    if (typeof storage.setCustomHeaders === 'function') {
      storage.setCustomHeaders(this._customHeader || {})
    }
    return this._deps
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
      // full-shell P5 (docs/v2-full-shell-plan.md): transport re-platformed onto
      // core-v3's shared axios via `deps.userAdapter.getAppConfig()`
      // (`Api.appConfig` = GET `/config`, headers-only, safe pre-login). The
      // `deps` getter re-syncs `storage`'s baseUrl live (see above), so this
      // first `this.deps` access builds/re-syncs it off the CURRENT
      // `this.baseURL` (already reflecting any explicit `config.baseURL`
      // override applied above, same as `this.HTTPAdapter` was just
      // constructed with) — i.e. the config request goes out pre-cfg-override,
      // matching the old HTTPAdapter call. The cfg-reading block below is
      // UNCHANGED. Errors (transport or cfg-processing) are still swallowed
      // the same way the old `.catch` did.
      try {
        const body = await this.deps.userAdapter.getAppConfig()
        this.isConfigLoaded = body.status === 200 ? true : false
        const cfg = body.results
        {
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
        }
      } catch (err) {
        this.logger('got error when trying to get app config', err)
        this.isConfigLoaded = true
      }
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
    this.realtimeAdapter.on('room-typing', (data) => {
      this.events.emit('typing', {
        message: data.text,
        username: data.sender_name,
        email: data.sender_id,
        room_id: data.room_id,
      })
      if (this.options.onRoomTypingCallback != null) {
        this.events.emit('room-typing', data)
        this.options.onRoomTypingCallback(data)
      }
    })

    this.syncAdapter = SyncAdapter(() => this.deps.messageAdapter, {
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
    this.syncAdapter.on('synchronize', () => {
      this._pendingComments.forEach((m) => this._retrySendComment(m))
    })
    this.syncAdapter.on('last-message-id.new', (id) => {
      this.last_received_comment_id = id
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
      this.deps.storage.setToken(this.userData.token)

      let user = response.user;
      this._delayedSync = delayed(() => {
        this.synchronize()
        this.synchronizeEvent()
      }, 500)
      this.expiredTokenAdapter = new ExpiredTokenAdapter({
        getUserAdapter: () => this.deps.userAdapter,
        getStorage: () => this.deps.storage,
        refreshToken: user.refresh_token,
        expiredAt: user.token_expires_at,
        userId: this.user_id,
        onTokenRefreshed: (token, refreshToken, expiredAt, oldToken) => {
          this.userData.token = token
          this.userData.refresh_token = refreshToken
          this.userData.token_expires_at = expiredAt?.toJSON()
          this.events.emit('token-refreshed', { token, refreshToken, expiredAt, oldToken })
          this.realtimeAdapter.unsusbcribeUserChannelByToken(oldToken)
          this.realtimeAdapter.subscribeUserChannelByToken(token)
          this._delayedSync()
        },
        getAuthenticationStatus: () => {
          return this.user_id != null && this.isLogin
        }
      })

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

          // Find last comment object on `self.selected.comments` array
          const lastComment = self.selected.comments[self.selected.comments.length - 1]
          self.selected.last_comment_id = lastComment.id
          self.selected.last_comment_message = lastComment.message
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

    this.isLoading = true
    this.isTypingStatus = ''

    // Create room — Phase 2b (docs/v2-on-core-v3-plan.md §9). Data-source swap
    // to core-v3's raw room adapter: `chatUser` hits the same
    // `get_or_create_room_with_target` POST (Api encoder emits the same
    // `{emails, options: JSON.stringify(...)}` body), then `rawRoomToV2` in
    // `targetEmail` mode reconstructs the exact object the old
    // `roomAdapter.getOrCreateRoom` handed to `new Room(...)` (avatar alias,
    // reversed comments, rival-username-or-'Room name' — pinned in
    // compat/to-v2.test.js and compat/phase2b.parity.test.js). The old adapter's
    // body-level envelope-status reject is reproduced here (reconstructed
    // `{status, body}` — see compat/requester.js). Divergences vs old, both
    // accepted: `emails` is sent as `[userId]` (array) not a bare string, and
    // the old buggy `distinctId` param (`params[distinctId]=distinctId`) is
    // dropped (strictly safer — the old key could collide with `emails`). Edge:
    // an explicit `chatTarget(userId, null)` sends `options: 'null'`
    // (`JSON.stringify(null)`) where old sent no `options` key (`if (options)`);
    // the default `{}` covers the normal call. The `.then(async (resp) => ...)`
    // body below is UNCHANGED.
    return this.deps.roomAdapter
      .chatUser(userId, options)
      .then((raw) => {
        if (raw.status !== 200) return Promise.reject({ status: 200, body: raw })
        return rawRoomToV2(raw.results.room, {
          comments: raw.results.comments,
          targetEmail: userId,
        })
      })
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

    // Phase 2b (docs/v2-on-core-v3-plan.md §9): data-source swap only. The old
    // `roomAdapter.getRoomById` resolved the raw `res.body` envelope
    // (`{status, results: {room, comments}}`) with no massaging, and everything
    // downstream here already reads `resp.results.room`/`resp.results.comments`
    // straight off that envelope — so `deps.roomAdapter.getRoom(id)`, which
    // resolves the identical raw envelope from the same `get_room_by_id` GET,
    // is byte-for-byte substitutable. No `rawRoomToV2` needed (this endpoint
    // never went through the massaging path). Parity is anchored at the adapter
    // level in `compat/phase2b.parity.test.js` (old `getRoomById` vs new
    // `getRoom` resolve/reject identically) rather than by a `_legacy*` copy of
    // this side-effect-heavy body.
    return self.deps.roomAdapter
      .getRoom(id)
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

    // Phase 2b (docs/v2-on-core-v3-plan.md §9). Data-source swap to core-v3's
    // raw room adapter: `getChannel` hits the same
    // `get_or_create_room_with_unique_id` POST — its `Api` encoder now emits
    // `{unique_id, name, avatar_url}` to match old v2 (the gated core-v3 fix,
    // approved; v3's own `getChannel(uniqueId)` still sends only `unique_id`).
    // `rawRoomToV2` in `useRoomName` mode reconstructs the object the old
    // `roomAdapter.getOrCreateRoomByUniqueId` handed to `new Room(...)`
    // (avatar alias, reversed comments, `name = room_name`) — pinned in
    // compat/to-v2.test.js + compat/phase2b.parity.test.js. Old adapter's
    // body-level envelope-status reject reproduced as `{status, body}`. The
    // `.then(async (response) => ...)` body below is UNCHANGED.
    return self.deps.roomAdapter
      .getChannel(id, roomName, avatarURL)
      .then((raw) => {
        if (raw.status !== 200) return Promise.reject({ status: 200, body: raw })
        return rawRoomToV2(raw.results.room, {
          comments: raw.results.comments,
          useRoomName: true,
        })
      })
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

  /**
   * Re-platformed on core-v3's raw room adapter (docs/v2-on-core-v3-plan.md
   * §9) — same `api/v2/sdk/user_rooms` GET. `getRoomList` now forwards
   * `roomType` (the approved gated core-v3 fix), so v2 sends
   * `room_type: params.room_type ?? 'default'` exactly like old v2 (v3 passes
   * no roomType, so its `room_type: 'all'` default is unchanged). Reproduces
   * the old adapter's body-level envelope-status reject (reconstructed
   * `{status, body}`) and resolved value (`results.rooms_info`); the
   * `new Room(...)` mapping below is UNCHANGED. Accepted divergence:
   * `show_removed: false` is now sent explicitly (old omitted it).
   */
  async loadRoomList(params = {}) {
    const rooms = await this.deps.roomAdapter
      .getRoomList(
        params.show_participants || true,
        undefined,
        params.show_empty,
        params.page,
        params.limit,
        params.room_type ?? 'default'
      )
      .then((raw) => {
        if (raw.status !== 200) return Promise.reject({ status: 200, body: raw })
        return raw.results.rooms_info
      })
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
    // Phase 3 (docs/v2-on-core-v3-plan.md §9). Data-source swap to core-v3's
    // raw message adapter: `getMessages` hits the same `load_comments` GET and
    // resolves the identical raw `{status, results: {comments}}` envelope the
    // old `userAdapter.loadComments` did — so `.then((raw) => raw.results.comments)`
    // reproduces its resolved value (the raw comments array), and the
    // hooks/`receiveComments`/`sortComments` body below is UNCHANGED. Anchored
    // adapter-level in compat/phase3.parity.test.js. `options.timestamp` is
    // forwarded (core-v3's `getComment` encoder now emits it — the approved
    // gated fix). Accepted divergence: unset `last_comment_id`/`limit` go as
    // core-v3's defaults (0 / 20) rather than being omitted from the query.
    return this.deps.messageAdapter
      .getMessages(roomId, options.last_comment_id, options.limit, options.after, options.timestamp)
      .then((raw) => raw.results.comments)
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

  /**
   * Re-platformed on core-v3's raw user adapter (docs/v2-full-shell-plan.md P2)
   * — same `set_user_device_token` POST; `Api.setDeviceToken`'s encoder is
   * byte-identical (`{device_token, device_platform: 'rn', is_development}`).
   * Resolves `results` like the old `res.body.results`.
   */
  async registerDeviceToken(token, isDevelopment = false) {
    const body = await this.deps.userAdapter.registerDeviceToken(token, isDevelopment)
    return body.results
  }

  /**
   * Re-platformed on core-v3's raw user adapter (docs/v2-full-shell-plan.md P2)
   * — same `remove_user_device_token` POST (byte-identical encoder). Resolves
   * `results`.
   */
  async removeDeviceToken(token, isDevelopment = false) {
    const body = await this.deps.userAdapter.unregisterDeviceToken(token, isDevelopment)
    return body.results
  }

  /**
   *
   * Search Qiscus Messages
   *
   * @param {any} [params={query,room_id,last_comment_id}]
   * @memberof qiscusSDK
   */
  /**
   * Re-platformed on core-v3's shared axios transport (docs/v2-full-shell-plan.md
   * P5) — same `api/v2/sdk/search_messages` POST, built inline via
   * `Api.searchMessages` (parameterized with a `lastCommentId` field added for
   * this old-style caller, which core-v3 v3 callers never pass). NOTE
   * divergence: the old `userAdapter.searchMessages` sent explicit `null`s for
   * omitted `query`/`room_id`/`last_comment_id`; the encoder here drops
   * `undefined` fields instead of sending `null` — flagged, not resolved (see
   * plan report).
   */
  async searchMessages(params = {}) {
    console.warn('Deprecated: search message will be removed on next release')
    const api = Api.searchMessages({
      ...Provider.withBaseUrl(this.deps.storage),
      ...Provider.withCredentials(this.deps.storage),
      query: params.query,
      roomId: params.room_id,
      lastCommentId: params.last_comment_id,
    })
    const body = await this.deps.apiAdapter.request(api)
    const messages = body.results.comments
    return messages.map((message) => {
      return new Comment(message)
    })
  }

  /**
   * Re-platformed on core-v3's raw user adapter (docs/v2-on-core-v3-plan.md
   * §9) — same `api/v2/sdk/my_profile` PATCH. `deps.userAdapter.updateUser`
   * maps `user.name`/`user.avatar_url`/`user.extras` onto `Api.patchProfile`;
   * the resolved value (`results.user`) and the `profile-updated` emit /
   * `this.userData = res` / error-swallowing `logger` behavior are unchanged.
   * Accepted wire divergences (v3-proven): `extras` is sent as a raw object
   * rather than old v2's `JSON.stringify`, and the body carries the current
   * user `id`; neither affects the resolved value.
   */
  updateProfile(user) {
    return this.deps.userAdapter
      .updateUser(user.name, user.avatar_url, user.extras)
      .then((raw) => raw.results.user)
      .then(
        (res) => {
          this.events.emit('profile-updated', user)
          this.userData = res
          return Promise.resolve(res)
        },
        (err) => this.logger(err)
      )
  }

  /**
   * Re-platformed on core-v3's raw user adapter (docs/v2-full-shell-plan.md P2)
   * — same `api/v2/sdk/auth/nonce` POST via `Api.getNonce`. Old v2 used
   * superagent directly (so no `_legacy` parity ref is possible); it resolved
   * `res.body.results`, which `deps.userAdapter.getNonce()` (returns the raw
   * body) reproduces via `.results`. Accepted divergence: core-v3 sends the
   * pre-auth headers as `qiscus-sdk-app-id`/`version` (hyphen) where old v2 sent
   * `qiscus_sdk_app_id`/`version` (underscore) — v3 uses these hyphen headers on
   * the nonce endpoint in prod.
   */
  getNonce() {
    return this.deps.userAdapter.getNonce().then(
      (raw) => Promise.resolve(raw.results),
      (err) => Promise.reject(err)
    )
  }

  /**
   * Re-platformed on core-v3's raw user adapter (docs/v2-full-shell-plan.md P2)
   * — same `api/v2/sdk/auth/verify_identity_token` POST via
   * `Api.verifyIdentityToken` (`setUserFromIdentityToken`). Resolves the raw
   * body's `.results` like the old direct-superagent call did. Same accepted
   * hyphen-vs-underscore header divergence as `getNonce`.
   */
  verifyIdentityToken(identityToken) {
    return this.deps.userAdapter.setUserFromIdentityToken(identityToken).then(
      (raw) => Promise.resolve(raw.results),
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
      room_id: topicId,
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

    const sendComment = () => this._postCommentViaCore(
      '' + topicId,
      messageData.message,
      messageData.unique_id,
      messageData.type,
      messageData.payload,
      messageData.extras
    )

    try {
      let res = await sendComment()
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
      this.options.commentSentCallback?.({ comment: messageData })
      self.events.emit('comment-sent', messageData)

      self.sortComments()
      const commentIndex = self._pendingComments.findIndex(c => c.unique_id === messageData.unique_id)
      if (commentIndex > -1) {
        self._pendingComments.splice(commentIndex, 1)
      }

      return messageData
    } catch (error) {
      messageData.markAsFailed()
      // From superagent: `https://forwardemail.github.io/superagent/#retrying-requests`
      const whitelistedErrorStatus = [undefined, 408, 413, 429, 500, 502, 503, 504, 521, 522, 524]
      const message = error.message?.toLowerCase() ?? ''
      const isOffline = message.includes('offline')
      if (whitelistedErrorStatus.includes(error.status) || isOffline) {
        this._pendingComments.push(messageData)
        this.logger('Failed sending comment', error)
      }
      return Promise.reject(error)
    }
  }

  _pendingComments = []

  // count of how much does a comment has been retried
  _pendingCommentsCount = {}
  async _retrySendComment(comment) {
    this.logger('Retrying send comment', comment);

    this._pendingCommentsCount[comment.unique_id] =
      (this._pendingCommentsCount[comment.unique_id] ?? 0) + 1

    // If it is exceeding the maximum retry count (which is 10), we will not retry anymore
    if (this._pendingCommentsCount[comment.unique_id] > 10) {
      this.logger(
        `Exceeding maximum retry count for comment ${comment.unique_id}, not retrying anymore`
      )
      this.options.commentRetryExceedCallback?.(comment)
      // Remove the comment from pending comments
      const index = this._pendingComments.findIndex(c => c.unique_id === comment.unique_id)
      if (index > -1) {
        this._pendingComments.splice(index, 1)
      }
      // Mark the comment as failed
      comment.markAsFailed()
      // Emit the event
      this.events.emit('comment-retry-exceed', comment)

      return Promise.reject(new Error('Exceeding maximum retry count'))
    }

    return this._postCommentViaCore(
      '' + comment.room_id,
      comment.message,
      comment.unique_id,
      comment.type,
      comment.payload,
      comment.extras
    ).then(async (res) => {
      if (this.selected?.id !== comment.room_id) {
        return res
      }

      Object.assign(comment, res)
      comment.markAsSent()
      comment.id = res.id
      comment.before_id = res.comment_before_id
      comment.unix_timestamp = res.unix_timestamp

      const index = this.selected?.comments.findIndex(
        (c) => c.unique_id === comment.unique_id
      )
      if (index > -1) {
        this.selected.comments[index] = comment
      }
      this.sortComments()

      this.options.commentSentCallback?.({ comment })
      this.events.emit('comment-sent', comment)
      const commentIndex = this._pendingComments.findIndex(c => c.unique_id === comment.unique_id)
      if (commentIndex > -1) {
        this._pendingComments.splice(commentIndex, 1)
      }

      return comment
    }).catch((err) => {
      comment.markAsFailed()
      return Promise.reject(err)
    })
  }

  // #endregion

  /**
   * Re-platformed on core-v3's raw user adapter (docs/v2-on-core-v3-plan.md
   * §9 Phase 1) — `deps.userAdapter.getUserList` hits the same
   * `api/v2/sdk/get_user_list` endpoint through the same `this.HTTPAdapter`
   * transport (via `compat/requester.js`), so headers/retry/error-shape are
   * unchanged. Resolved value is passed through as-is (`body.results`, i.e.
   * `{meta, users}`), exactly like the old implementation — no per-user
   * `compat/to-v2.js` normalization is applied here since the old code never
   * massaged this response either.
   */
  getUsers(query = '', page = 1, limit = 20) {
    return this.deps.userAdapter.getUserList(query, page, limit).then((body) => {
      return Promise.resolve(body.results)
    })
  }

  /**
   * Re-platformed on core-v3's raw room adapter (docs/v2-on-core-v3-plan.md
   * §9) — same `api/v2/sdk/room_participants` GET. `Api.getRoomParticipants`'s
   * encoder now emits `page`/`limit` (the approved gated fix), so the query
   * matches old v2. `getParticipantList` returns the raw envelope, so
   * `.then((raw) => raw.results)` reproduces the old resolved value
   * (`resp.body.results`). Accepted divergence: the new query also carries
   * `sorting=asc` (core-v3's default), which old v2 omitted — backend default
   * is asc, and version-3 already sends it in prod.
   */
  getParticipants(roomUniqueId, page = 1, limit = 20) {
    return this.deps.roomAdapter
      .getParticipantList(roomUniqueId, page, limit)
      .then((raw) => raw.results)
  }
  /**
   * Re-platformed on core-v3's shared axios transport (docs/v2-full-shell-plan.md
   * P5) — same `api/v2/sdk/room_participants` GET, built inline via
   * `Api.getRoomParticipants` (parameterized with an `offset` field added for
   * this old-style-pagination caller) instead of a raw HTTP call, so the wire
   * matches the old `room_unique_id`+`offset` query. `apiAdapter.request`
   * resolves the parsed body, so `.then((body) => body.results)` reproduces
   * the old resolved value (`resp.body.results`). Accepted divergence (same
   * as `getParticipants` above): the query also now carries `sorting=asc`
   * (core-v3's default), which old v2 omitted.
   */
  getRoomParticipants(roomUniqueId, offset = 0) {
    console.warn(
      '`getRoomParticipants` are deprecated, use `getParticipants` instead.'
    )
    const api = Api.getRoomParticipants({
      ...Provider.withBaseUrl(this.deps.storage),
      ...Provider.withCredentials(this.deps.storage),
      uniqueId: roomUniqueId,
      offset,
    })
    return this.deps.apiAdapter.request(api).then((body) => body.results)
  }

  /**
   * Phase 3 (docs/v2-on-core-v3-plan.md §9) transport for posting a comment,
   * replacing `userAdapter.postComment` at every send call site. Routes through
   * core-v3's raw message adapter (`deps.messageAdapter.sendMessage`), whose
   * `Api.postComment` encoder emits the byte-identical body (`{topic_id,
   * comment, unique_temp_id, type, payload, extras}`). Reproduces the old
   * adapter's body-level envelope-status reject (reconstructed `{status, body}`)
   * and its resolved value (`results.comment`, the raw comment). The optimistic-
   * send orchestration around each call site (`_pendingComments` retry,
   * `markAsSent`, `comment-sent`/callbacks, `selected.comments` mutation) is
   * UNCHANGED — only the transport swaps. Anchored in compat/phase3.parity.test.js.
   *
   * MUST be called with a non-nullish `uniqueId`: core-v3's `sendMessage`
   * substitutes `javascript-<nanoid>` for a nullish one, whereas old
   * `postComment` sent `unique_temp_id: null` through. All call sites here pass
   * `prepareCommentToBeSubmitted`'s `'bq'+Date.now()` id, so this stays
   * unreachable — do not introduce a nullish-id caller.
   */
  _postCommentViaCore(topicId, message, uniqueId, type, payload, extras) {
    return this.deps.messageAdapter
      .sendMessage('' + topicId, { text: message, uniqueId, type, payload, extras })
      .then((body) => {
        if (body.status !== 200) return Promise.reject({ status: 200, body })
        return body.results.comment
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
    return this._postCommentViaCore(
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
  /**
   * Re-platformed on core-v3's raw room adapter (docs/v2-on-core-v3-plan.md
   * §9 Phase 2) — same `api/v2/sdk/update_room` POST. `Api.updateRoom`'s
   * encoder emits a byte-identical body (`{id, room_name, avatar_url,
   * options: JSON.stringify(extras)}`), so `args.room_name -> name` and
   * `args.options -> extras` reproduce the old wire request exactly. Preserves
   * the old adapter's synchronous `throw` on a missing `id`, its body-level
   * envelope-status reject (reconstructed `{status, body}` — see
   * `compat/requester.js`), and its resolved value (`results.room`).
   */
  updateRoom(args) {
    if (!args.id) throw new Error('id is required')
    return this.deps.roomAdapter
      .updateRoom(args.id, args.room_name, args.avatar_url, args.options)
      .then(
        (body) => {
          if (body.status !== 200) return Promise.reject({ status: 200, body })
          return Promise.resolve(body.results.room)
        },
        (err) => Promise.reject(err)
      )
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
    // Phase 2b (docs/v2-on-core-v3-plan.md §9). Re-platformed off
    // `GroupChatBuilder`/`roomAdapter.createRoom` onto core-v3's raw room
    // adapter: `createGroup` hits the same `create_room` POST. The old
    // adapter REMAPPED the response to a summary object (not a `Room`);
    // `rawCreatedRoomToV2` reproduces that exact shape (pinned in
    // compat/to-v2.test.js + compat/phase2b.parity.test.js). `GroupChatBuilder`
    // only deduped participants and forwarded name/options — `createGroupRoom`
    // already passes `emails` straight through, so it is inlined here. Old
    // body-level envelope-status reject reproduced as `{status, body}`; the
    // `'group-room-created'` emit + resolved value are unchanged.
    //
    // NB `options` intentionally has NO default: the old path read
    // `options.avatarURL` unconditionally (via `GroupChatBuilder.create` ->
    // `roomAdapter.createRoom(name, emails, {avatarURL: options.avatarURL}, options)`),
    // so a call with no `options` threw `TypeError` synchronously and fired no
    // request — reproduced here by leaving `options` undefined.
    //
    // Accepted wire divergences (Fable-reviewed; not observable in the
    // resolved value, which comes from the response): the `create_room` body
    // sends `participants` (JSON array) instead of old urlencoded
    // `participants[]`, and `options: JSON.stringify(options)` — so an empty
    // `{}` serializes to `"{}"` where the old adapter sent `null` for an empty
    // options object. Both are backend-proven by version-3 in prod.
    return self.deps.roomAdapter
      .createGroup(name, emails, options.avatarURL, options)
      .then((raw) => {
        if (raw.status !== 200) return Promise.reject({ status: 200, body: raw })
        const res = rawCreatedRoomToV2(raw)
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
  /**
   * Re-platformed on core-v3's raw room adapter (docs/v2-on-core-v3-plan.md
   * §9 Phase 2) — same `api/v2/sdk/add_room_participants` POST. Preserves the
   * shell's non-array `throw`, the old adapter's synchronous
   * `throw new Error('room_id and emails is required')` on a falsy
   * `roomId`/`emails`, the body-level envelope-status reject (reconstructed
   * `{status, body}`), the resolved value (`results.participants_added`), and
   * the `'participants-added'` event emit.
   */
  addParticipantsToGroup(roomId, emails) {
    const self = this
    if (!Array.isArray(emails)) {
      throw new Error(`emails' must be type of Array`)
    }
    if (!roomId || !emails) throw new Error('room_id and emails is required')
    return self.deps.roomAdapter.addParticipants(roomId, emails).then(
      (body) => {
        if (body.status !== 200) return Promise.reject({ status: 200, body })
        const res = body.results.participants_added
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
  /**
   * Re-platformed on core-v3's raw room adapter (docs/v2-on-core-v3-plan.md
   * §9 Phase 2) — same `api/v2/sdk/remove_room_participants` POST. Preserves
   * the shell's non-array reject, the old adapter's synchronous
   * `throw new Error('room_id and emails is required')` on a falsy
   * `roomId`/`emails`, the body-level envelope-status reject (reconstructed
   * `{status, body}`), the resolved value (`results.participants_removed`),
   * and the `'participants-removed'` event emit (which carries `emails`, not
   * the response — unchanged).
   */
  removeParticipantsFromGroup(roomId, emails) {
    if (is.not.array(emails)) {
      return Promise.reject(new Error('`emails` must have type of array'))
    }
    if (!roomId || !emails) throw new Error('room_id and emails is required')
    return this.deps.roomAdapter.removeParticipants(roomId, emails).then((body) => {
      if (body.status !== 200) return Promise.reject({ status: 200, body })
      this.events.emit('participants-removed', emails)
      return Promise.resolve(body.results.participants_removed)
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
  /**
   * Re-platformed on core-v3's raw user adapter (docs/v2-on-core-v3-plan.md
   * §9 Phase 1) — same `api/v2/sdk/get_blocked_users` endpoint, same
   * `this.HTTPAdapter` transport. The old adapter checked the *body-level*
   * `status` field and rejected with the whole superagent-shaped `res`
   * (`{status, body}`) when it wasn't 200 (`lib/adapters/user.js:157`); that
   * check is replicated here in the shell (`compat/requester.js` only
   * returns the parsed body, not the outer HTTP status, so the outer
   * `status` is reconstructed as `200` — the only value it can ever be here,
   * since this branch only runs when the HTTP transport itself already
   * resolved successfully, and every one of this API's envelope endpoints
   * uses HTTP 200 for a resolved response). Resolved value
   * (`body.results.blocked_users`) is passed through as-is, exactly like
   * the old implementation.
   */
  getBlockedUser(page = 1, limit = 20) {
    const self = this
    return self.deps.userAdapter.getBlockedUser(page, limit).then(
      (body) => {
        if (body.status !== 200) return Promise.reject({ status: 200, body })
        return Promise.resolve(body.results.blocked_users)
      },
      (err) => Promise.reject(err)
    )
  }

  /**
   * Add user to block list
   *
   * Re-platformed on core-v3's raw user adapter (docs/v2-on-core-v3-plan.md
   * §9 Phase 1) — same `api/v2/sdk/block_user` endpoint/body
   * (`{user_email: email}`), same `this.HTTPAdapter` transport. Preserves
   * the old adapter's *synchronous* `throw` on a falsy `email`
   * (`lib/adapters/user.js:167`, called synchronously from this method
   * with no try/catch, so it always threw synchronously rather than
   * rejecting) and the body-level-status reject-with-`res` check — see the
   * comment on `getBlockedUser` above for why `status: 200` is
   * reconstructed. Preserves the `'block-user'` event emit.
   *
   * @param {any} email the email is required
   * @returns Promise
   * @memberof QiscusSDK
   */
  blockUser(email) {
    if (!email) throw new Error('email is required')
    const self = this
    return self.deps.userAdapter.blockUser(email).then(
      (body) => {
        if (body.status !== 200) return Promise.reject({ status: 200, body })
        const res = body.results.user
        self.events.emit('block-user', res)
        return Promise.resolve(res)
      },
      (err) => Promise.reject(err)
    )
  }

  /**
   * Remove user from block list
   *
   * Re-platformed on core-v3's raw user adapter (docs/v2-on-core-v3-plan.md
   * §9 Phase 1) — same `api/v2/sdk/unblock_user` endpoint/body, same
   * transport/throw/reject-shape preservation as `blockUser` above.
   * Preserves the `'unblock-user'` event emit.
   *
   * @param {any} email the email is required
   * @returns Promise
   * @memberof QiscusSDK
   */
  unblockUser(email) {
    if (!email) throw new Error('email is required')
    const self = this
    return self.deps.userAdapter.unblockUser(email).then(
      (body) => {
        if (body.status !== 200) return Promise.reject({ status: 200, body })
        const res = body.results.user
        self.events.emit('unblock-user', res)
        return Promise.resolve(res)
      },
      (err) => Promise.reject(err)
    )
  }

  /**
   * Re-platformed on core-v3's raw user adapter (docs/v2-full-shell-plan.md P2)
   * — same `api/v2/sdk/users/status` POST (body `{user_ids}`) via the new
   * `Api.getUserPresences` primitive. Preserves the non-array reject, the
   * body-level envelope-status reject (reconstructed `{status, body}`), the
   * resolved value (`results.user_status`), and the `'user-status'` emit.
   */
  getUserPresences(email = []) {
    if (is.not.array(email)) {
      return Promise.reject(new Error('`email` must have type of array'))
    }

    const self = this
    return self.deps.userAdapter.getUserPresences(email).then(
      (body) => {
        if (body.status !== 200) return Promise.reject({ status: 200, body })
        const res = body.results.user_status
        self.events.emit('user-status', res)
        return Promise.resolve(res)
      },
      (err) => Promise.reject(err)
    )
  }
  /**
   * Re-platformed on core-v3's upload primitive (docs/v2-full-shell-plan.md P2,
   * approved) — same `upload` multipart POST, now via axios + FormData +
   * `onUploadProgress` instead of superagent's `.attach()`/`.on('progress')`.
   * Honors the customizable `this.uploadURL`. The axios progress event is
   * re-shaped to v2's superagent-style `{direction:'upload', loaded, total,
   * percent, lengthComputable}` so `callback(null, event)` consumers are
   * unchanged; resolves `results.file.url` and calls
   * `callback(null, null, url)` / `callback(error)` as before. NB the actual
   * multipart transfer is browser-runtime and unit-tested only at the
   * adaptation level (progress/callback/resolve) with an injected stub.
   */
  upload(file, callback) {
    return this.deps.uploadAdapter
      .upload(file, {
        url: this.uploadURL,
        onProgress: (progress) => {
          callback(null, {
            direction: 'upload',
            loaded: progress.loaded,
            total: progress.total,
            percent: progress.total ? (progress.loaded / progress.total) * 100 : 0,
            lengthComputable: progress.total > 0,
          })
        },
      })
      .then((body) => {
        const url = body.results.file.url
        callback(null, null, url)
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
  /**
   * Re-platformed on core-v3's upload primitive (docs/v2-full-shell-plan.md P2)
   * — replaces the raw `XMLHttpRequest` multipart POST. Uploads the file, emits
   * `'fileupload'` with the resulting URL, then posts a `[file]...[/file]`
   * comment via `sendComment` — the same observable behavior as the old XHR
   * `onload`. Now returns a promise (the old XHR path returned `undefined`),
   * which is a superset. Header style unifies to core-v3's `qiscus-sdk-*`
   * (the old XHR used `qiscus_sdk_*`; the upload endpoint accepts both — v2's
   * own `upload` already used the `QISCUS-SDK-*` style).
   */
  uploadFile(roomId, file) {
    const self = this
    return self.deps.uploadAdapter.upload(file).then(
      (body) => {
        const url = body.results.file.url
        self.events.emit('fileupload', url)
        return self.sendComment(roomId, `[file] ${url} [/file]`)
      },
      (err) => Promise.reject(err)
    )
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
  /**
   * Re-platformed on core-v3's raw room adapter (docs/v2-on-core-v3-plan.md
   * §9) — same `api/v2/sdk/rooms_info` POST, resolves the raw `res.body`
   * envelope exactly like the old `userAdapter.getRoomsInfo`. Reproduces the
   * old adapter's default/quirk: `show_participants` defaults `true` (the old
   * `if (opts.show_participants)` guard could never set it `false`, so
   * `params.show_participants || true` matches), `show_removed` defaults
   * `false`. Accepted wire divergence: `Api.getRoomInfo` stringifies
   * `room_id` entries (`.map(String)`) where old sent them as-is; version-3
   * already sends them stringified in prod.
   */
  getRoomsInfo(params) {
    return this.deps.roomAdapter.getRoomInfo(
      params.room_ids,
      params.room_unique_ids,
      undefined,
      params.show_removed || false,
      params.show_participants || true
    )
  }

  /**
   * Re-platformed on core-v3's raw message adapter (docs/v2-full-shell-plan.md
   * P2) — same `api/v2/sdk/delete_messages` DELETE. `Api.deleteMessages` now
   * takes the `isForEveryone`/`isHard` flags (default true — the approved
   * primitive change), reproducing the old behavior + the deprecation warnings
   * (moved here from the old `userAdapter.deleteComment`). Old adapter resolved
   * the raw `res.body` envelope with no status check, so
   * `deps.messageAdapter.deleteMessage` (returns the raw body) reproduces the
   * resolved value; the `'comment-deleted'` emit is unchanged. Accepted wire
   * divergence: core-v3 sends ids/flags as query params (v3-proven) where old
   * v2 sent a JSON body — resolved value unaffected.
   */
  deleteComment(roomId, commentUniqueIds, isForEveryone, isHard) {
    if (!Array.isArray(commentUniqueIds)) {
      throw new Error(`unique ids' must be type of Array`)
    }
    if (isForEveryone === false) {
      console.warn(
        'Deprecated: delete comment for me will be removed on next release'
      )
    }
    if (isHard === false) {
      console.warn('Deprecated: soft delete will be removed on next release')
    }
    return this.deps.messageAdapter
      .deleteMessage(commentUniqueIds, isForEveryone, isHard)
      .then(
        (body) => {
          this.events.emit('comment-deleted', {
            roomId,
            commentUniqueIds,
            isForEveryone,
            isHard,
          })
          return Promise.resolve(body)
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

  /**
   * Re-platformed on core-v3's raw room adapter (docs/v2-full-shell-plan.md P2)
   * — same `api/v2/sdk/clear_room_messages` DELETE via `deps.roomAdapter.clearRoom`.
   * Old `userAdapter.clearRoomMessages` resolved the raw `res.body` (no status
   * check); `clearRoom` returns the raw body, so the resolved value matches.
   * Accepted wire divergence: core-v3 sends `room_channel_ids` as an array query
   * param (v3-proven) where old v2 sent a JSON body.
   */
  clearRoomMessages(roomIds) {
    if (!Array.isArray(roomIds)) {
      throw new Error('room_ids must be type of array')
    }
    return this.deps.roomAdapter.clearRoom(roomIds)
  }

  logging(message, params = {}) {
    if (this.debugMode) {
      console.log(message, params)
    }
  }

  /**
   * Re-platformed on core-v3's raw room adapter (docs/v2-on-core-v3-plan.md
   * §9 Phase 2) — same `api/v2/sdk/total_unread_count` GET. The old adapter
   * resolved the bare number `res.body.results.total_unread_count` with no
   * envelope-status check; `getUnreadCount()` returns the raw envelope, so
   * `.then((body) => body.results.total_unread_count)` reproduces it exactly.
   */
  getTotalUnreadCount() {
    return this.deps.roomAdapter
      .getUnreadCount()
      .then((body) => body.results.total_unread_count)
  }

  /**
   * Re-platformed on core-v3's raw room adapter (docs/v2-on-core-v3-plan.md
   * §9 Phase 2) — same `api/v2/sdk/get_room_unread_count` GET. The old adapter
   * resolved the bare number `res.body.results.total_unread_count`; the raw
   * `getRoomUnreadCount()` returns the raw envelope, so
   * `.then((body) => body.results.total_unread_count)` reproduces it exactly.
   */
  getRoomUnreadCount() {
    return this.deps.roomAdapter
      .getRoomUnreadCount()
      .then((body) => body.results.total_unread_count)
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

  /**
   * Re-platformed on core-v3's raw user adapter (docs/v2-on-core-v3-plan.md
   * §9 Phase 1) — same `api/v2/sdk/my_profile` GET, same `this.HTTPAdapter`
   * transport. The old `userAdapter.getProfile()` resolved
   * `res.body.results.user` with no envelope-status check; the raw adapter's
   * `getUserData()` returns the raw envelope body (`{status, results}`), so
   * `.then((body) => body.results.user)` reproduces the exact same resolved
   * value. The error path is the unchanged superagent rejection — there is no
   * envelope-status check on either side, so nothing to reconstruct.
   */
  getUserProfile() {
    return this.deps.userAdapter.getUserData().then((body) => body.results.user)
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

    this._updateCommentStatusViaCore(roomId, commentId1, commentId2)
      ?.catch((err) => { })
  }

  /**
   * Phase 3 (docs/v2-on-core-v3-plan.md §9) transport for read/received
   * receipts, replacing the old `userAdapter.updateCommentStatus`. That old
   * method was a single `lodash.throttle(fn, 500)` at the adapter instance
   * level, dispatching read-vs-received inside one throttled fn — so this is a
   * single combined `throttle` over a dispatch to core-v3's `markAsRead`/
   * `markAsDelivered` (Fable-reviewed: reproduces lodash leading+trailing
   * coalescing across interleaved read/received calls; two separate throttles
   * would NOT). The inner fn returns the adapter promise so the throttle's
   * suppressed-call return + `_updateStatus`'s fire-and-forget `?.catch` behave
   * as before. `Api.updateCommentStatus` emits the same
   * `{room_id, last_comment_read_id?, last_comment_received_id?}` body (unset
   * ids serialize away). Divergence vs old: this throttle lives for the
   * `QiscusSDK` instance lifetime rather than being recreated per login with
   * `userAdapter` — a ≤500ms window straddling a re-login, negligible.
   */
  _updateCommentStatusViaCore = throttle(
    (roomId, readId, receivedId) => {
      if (readId != null) return this.deps.messageAdapter.markAsRead(roomId, readId)
      if (receivedId != null) return this.deps.messageAdapter.markAsDelivered(roomId, receivedId)
    },
    500
  )

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
  /**
   * Re-platformed on core-v3's raw message adapter (docs/v2-full-shell-plan.md
   * P2) — same `api/v2/sdk/search` POST via `Api.searchMessagesV2`, whose
   * encoder carries the identical `roomType -> {room_type, is_public}` mapping
   * and `room_ids` stringify that used to live here. The `roomType` validation
   * stays in the shell; resolves the raw `res.body` like before. Accepted
   * divergence: old v2 also put `token` in the body (redundant — the token is
   * in the headers); core-v3 omits it.
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
    const isValidRoomType = ['group', 'single', 'channel'].some(
      (it) => it === roomType
    )
    if (roomType != null && !isValidRoomType) {
      return Promise.reject(
        'Invalid room type, valid room type are: `group`, `single`, and `channel`'
      )
    }

    return this.deps.messageAdapter.searchMessages({
      query,
      roomIds,
      userId,
      type,
      roomType,
      page,
      limit,
    })
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

    // Re-platformed on core-v3's raw message adapter (docs/v2-full-shell-plan.md
    // P2) — same `file_list` POST via `Api.getFileList` (byte-identical body);
    // the `isLogin` guard + sender/userId defaulting stay in the shell.
    // Resolves the raw `res.body` like before.
    return this.deps.messageAdapter.getFileList({
      roomIds,
      fileType,
      page,
      limit,
      sender,
      userId,
      includeExtensions,
      excludeExtensions,
    })
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

  /**
   * Re-platformed on core-v3's raw message adapter (docs/v2-on-core-v3-plan.md
   * §9 Phase 3) — same `api/v2/sdk/update_message` POST. `Api.updateMessage`'s
   * encoder emits the byte-identical body (`{token, comment, unique_id,
   * extras?, payload?}`), so mapping v2's message shape (`message.message` ->
   * `text`, `message.unique_id || message.unique_temp_id` -> `uniqueId`) onto
   * `deps.messageAdapter.updateMessage` reproduces the old request. The raw
   * adapter reads `token` from storage (seeded from `HTTPAdapter.token`, same
   * value the old adapter used). Resolved value (`results.comment`) is
   * unchanged; the old method had no envelope-status check either.
   */
  async updateMessage(message) {
    return this.deps.messageAdapter
      .updateMessage({
        text: message.message,
        uniqueId: message.unique_id || message.unique_temp_id,
        extras: message.extras,
        payload: message.payload,
      })
      .then((body) => body.results.comment)
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
