import { match, when } from '../match'
import mitt from 'mitt'
import connect from 'mqtt/lib/connect'
// import {connect} from 'mqtt'
import request from 'superagent'
import debounce from 'lodash.debounce'
import { wrapP } from '../util'

export default class MqttAdapter {
  /**
   * @type {import('pino').Logger}
   */
  logger

  /**
   * @type {import('mqtt').MqttClient | null}
   */
  mqtt = null

  /**
   * @typedef {Function} GetClientId
   * @return {string}
   */
  /**
   * @typedef {Object} MqttAdapterParams
   * @property {boolean} shouldConnect
   * @property {string} brokerLbUrl
   * @property {boolean} enableLb
   * @property {GetClientId} getClientId
   * @property {import('../../logger.js').Logger} logger
   */
  /**
   * @param {string} url
   * @param {import('../../index').default} core
   * @param {boolean} login
   * @param {MqttAdapterParams} obj
   */
  constructor(
    url,
    core,
    login,
    { shouldConnect = true, brokerLbUrl, enableLb, getClientId, logger }
  ) {
    this.logger = logger.child('MqttAdapter')

    this.emitter = mitt()
    this.core = core
    this.mqtt = null
    this.brokerLbUrl = brokerLbUrl
    this.getClientId = getClientId
    this.enableLb = enableLb
    this.shouldConnect = shouldConnect
    this.matcher = match({
      [when(this.reNewMessage)]: (topic) =>
        this.newMessageHandler.bind(this, topic),
      [when(this.reNotification)]: (topic) =>
        this.notificationHandler.bind(this, topic),
      [when(this.reTyping)]: (topic) => this.typingHandler.bind(this, topic),
      [when(this.reDelivery)]: (topic) =>
        this.deliveryReceiptHandler.bind(this, topic),
      [when(this.reRead)]: (topic) => this.readReceiptHandler.bind(this, topic),
      [when(this.reOnlineStatus)]: (topic) =>
        this.onlinePresenceHandler.bind(this, topic),
      [when(this.reChannelMessage)]: (topic) =>
        this.channelMessageHandler.bind(this, topic),
      [when(this.reMessageUpdated)]: (topic) =>
        this.messageUpdatedHandler.bind(this, topic),
      [when()]: (topic) => this.logger.debug('topic not handled', topic),
    })

    let mqtt = this.__mqtt_conneck(url)
    this.mqtt = mqtt

    // if appConfig set realtimeEnabled to false,
    // we intentionally end mqtt connection here.
    // TODO: Make a better way to not connect
    //       to broker, but still having mqtt client initiated.
    if (!shouldConnect) mqtt.end(true)

    this.willConnectToRealtime = false

    // handle load balancer
    this.emitter.on('close', this._on_close_handler)
  }

  _getClientId = () => {
    let clientId
    if (this.getClientId == null) {
      clientId = `${this.core.AppId}_${this.core.user_id}_${Date.now()}`
    } else {
      clientId = this.getClientId()
    }

    this.logger.debug('Generated clientId', { clientId })
    return clientId
  }

  __mqtt_connected_handler = () => {
    this.logger.debug('connected')
    this.emitter.emit('connected')
  }
  __mqtt_reconnect_handler = () => {
    this.logger.debug('reconnecting')
    this.emitter.emit('reconnect')
  }
  __mqtt_closed_handler = (...args) => {
    this.logger.debug('closed', { args })
    this.emitter.emit('close', args)
  }
  __mqtt_message_handler = (t, m) => {
    this.logger.debug('message', { t, m: JSON.stringify(m) })
    const message = m.toString()
    const func = this.matcher(t)
    if (func != null) func(message)
  }
  __mqtt_error_handler = (err) => {
    this.logger.debug('error', { err })
    if (err && err.message === 'client disconnecting') return
    this.emitter.emit('error', err.message)
  }
  __mqtt_conneck = (brokerUrl) => {
    const topics = []
    /**
     * @type {import('mqtt').IClientOptions}
     */
    const opts = {
      will: {
        topic: `u/${this.core.user_id}/s`,
        payload: '0',
        retain: true,
        qos: 1,
      },
      clientId: this._getClientId(),
      // reconnectPeriod: 0,
      // connectTimeout: 1 * 1000,
    }

    this.logger.debug('Connecting to', {
      brokerUrl,
      cachedRealtimeURL: this.cacheRealtimeURL,
      existingTopics: this.mqtt?._resubscribeTopics
        ? Object.keys(this.mqtt._resubscribeTopics)
        : [],
    })
    if (brokerUrl == null) brokerUrl = this.cacheRealtimeURL
    if (this.mqtt != null) {
      const _topics = Object.keys(this.mqtt._resubscribeTopics ?? {})
      topics.push(..._topics)

      this.mqtt.removeAllListeners()
      this.mqtt.end(true)
      // delete this.mqtt
      this.mqtt = null
    }

    const mqtt = connect(brokerUrl, opts)

    // #region Mqtt Listener
    mqtt.addListener('connect', this.__mqtt_connected_handler)
    mqtt.addListener('reconnect', this.__mqtt_reconnect_handler)
    mqtt.addListener('close', this.__mqtt_closed_handler)
    mqtt.addListener('error', this.__mqtt_error_handler)
    mqtt.addListener('message', this.__mqtt_message_handler)
    // #endregion

    this.logger.debug(`resubscribe to old topics ${topics}`)
    topics.forEach((topic) => mqtt.subscribe(topic))

    return mqtt
  }
  _on_close_handler = debounce(async () => {
    const shouldReconnect =
      this.enableLb === true && // appConfig enabling realtime lb
      this.core.isLogin === true && // is logged in
      this.shouldConnect === true && // should reconnect?
      !this.willConnectToRealtime // is there still reconnect process in progress?

    this.logger.debug('closed', {
      enableLb: this.enableLb,
      isLogin: this.core.isLogin,
      shouldConnect: this.shouldConnect,
      willConnectToRealtime: this.willConnectToRealtime,
      shouldReconnect,
    })

    if (!shouldReconnect) return
    this.willConnectToRealtime = true

    const [url, err] = await wrapP(this.getMqttNode())
    if (err) {
      this.logger.debug(
        `cannot get new brokerURL (through ${this.brokerLbUrl}), using old url instead (${this.cacheRealtimeURL})`
      )
      this.mqtt = this.__mqtt_conneck(this.cacheRealtimeURL)
    } else {
      this.cacheRealtimeURL = url
      this.logger.debug('trying to reconnect to', url)
      this.mqtt = this.__mqtt_conneck(url)
    }

    this.willConnectToRealtime = false
  }, 1000)

  get cacheRealtimeURL() {
    return this.core.mqttURL
  }
  set cacheRealtimeURL(url) {
    this.core.mqttURL = url
  }

  connect() {
    this.mqtt = this.__mqtt_conneck()
  }

  /**
   * @return {Promise<boolean>}
   */
  async openConnection() {
    this.shouldConnect = true
    this.__mqtt_conneck()
    return true
  }

  /**
   * @return {Promise<boolean>}
   */
  async closeConnection() {
    this.shouldConnect = false
    this.mqtt?.end(true)
    return true
  }

  async getMqttNode() {
    const res = await request.get(this.brokerLbUrl)
    const url = res.body.data.url
    const port = res.body.data.wss_port
    return `wss://${url}:${port}/mqtt`
  }

  get connected() {
    if (this.mqtt == null) return false
    return this.mqtt.connected
  }

  /**
   * @type {[string, import('mqtt').IClientSubscribeOptions][]}
   */
  subscribtionBuffer = []
  /**
   * Subscribe to a topic.
   * @param {[string, import('mqtt').IClientSubscribeOptions]} args - The topic to subscribe to.
   */
  subscribe(...args) {
    this.logger.debug('subscribe', { ...args })
    this.subscribtionBuffer.push(args)
    if (this.mqtt != null) {
      while (this.subscribtionBuffer.length > 0) {
        const subs = this.subscribtionBuffer.shift()
        if (subs != null)
          this.mqtt.subscribe(subs[0], subs[1], (err, granted) => {
            if (err) {
              this.logger.error('subscribe.error', { err, topic: subs[0] })
            } else {
              this.logger.debug('subscribe.success', {
                granted,
                topic: subs[0],
              })
            }
          })
      }
    }
  }

  /**
   * @type {[string, import('mqtt').IClientSubscribeOptions][]}
   */
  unsubscribtionBuffer = []
  /**
   * @param {[string, import('mqtt').IClientSubscribeOptions]} args
   */
  unsubscribe(...args) {
    this.logger.debug('unsubscribe', { ...args })
    this.unsubscribtionBuffer.push(args)
    if (this.mqtt != null) {
      while (this.unsubscribtionBuffer.length > 0) {
        const subs = this.unsubscribtionBuffer.shift()
        if (subs != null) {
          this.mqtt.unsubscribe(subs[0], subs[1], (err, packet) => {
            if (err) {
              this.logger.error('unsubscribe.error', { err, topic: subs[0] })
            } else {
              this.logger.debug('unsubscribe.success', {
                packet,
                topic: subs[0],
              })
            }
          })
        }
      }
    }
  }

  /**
   * @type {Array<{topic: string, payload: string | Buffer, options: import('mqtt').IClientPublishOptions}>}
   */
  publishBuffer = []
  /**
   * Publish a message to a topic.
   * @param {string} topic - The topic to publish to.
   * @param {string | Buffer} payload - The message to publish.
   * @param {import('mqtt').IClientPublishOptions} [options] - Options for publishing.
   */
  publish(topic, payload, options = {}) {
    this.publishBuffer.push({ topic, payload, options })
    if (this.mqtt != null) {
      while (this.publishBuffer.length > 0) {
        const data = this.publishBuffer.shift()
        if (data == null) continue
        this.logger.debug('publish', {
          topic: data.topic,
          payload: data.payload.toString(),
          options: data.options,
        })
        this.mqtt.publish(
          data.topic,
          data.payload.toString(),
          data.options,
          (err, packet) => {
            if (err) {
              this.logger.error('publish.error', { err, topic: data.topic })
            } else {
              this.logger.debug('publish.success', {
                packet,
                topic: data.topic,
              })
            }
          }
        )
      }
    }
  }

  /**
   * Emit an event with the given arguments.
   * @param {[string, any]} args - The arguments to emit.
   */
  emit(...args) {
    this.emitter.emit(...args)
  }

  /**
   * @param {[string, mitt.Handler]} args
   */
  on(...args) {
    this.emitter.on(...args)
  }
  /**
   * @param {[string, mitt.Handler]} args
   */
  off(...args) {
    this.emitter.off(...args)
  }

  // #region regexp
  get reNewMessage() {
    return /^(.+)\/c$/i
  }
  get reNotification() {
    return /^(.+)\/n$/i
  }
  get reTyping() {
    return /^r\/([\d]+)\/([\d]+)\/(.+)\/t$/i
  }
  get reDelivery() {
    return /^r\/([\d]+)\/([\d]+)\/(.+)\/d$/i
  }
  get reRead() {
    return /^r\/([\d]+)\/([\d]+)\/(.+)\/r$/i
  }
  get reOnlineStatus() {
    return /^u\/(.+)\/s$/i
  }
  get reChannelMessage() {
    return /^(.+)\/(.+)\/c$/i
  }
  get reMessageUpdated() {
    return /^(.+)\/update$/i
  }
  // #endregion

  noop() {}

  newMessageHandler(topic, message) {
    message = JSON.parse(message)
    this.logger.debug('on:new-message', message)
    this.emit('new-message', message)
  }

  notificationHandler(topic, message) {
    this.logger.debug('on:notification', message)
    message = JSON.parse(message)
    const data = message.payload.data
    if ('deleted_messages' in data) {
      data.deleted_messages.forEach((message) => {
        this.emit('comment-deleted', {
          roomId: message.room_id,
          commentUniqueIds: message.message_unique_ids,
          isForEveryone: true,
          isHard: true,
        })
      })
    }

    if ('deleted_rooms' in data) {
      data.deleted_rooms.forEach((room) => {
        this.emit('room-cleared', room)
      })
    }
  }

  typingHandler(t, message) {
    this.logger.debug('on:typing', t)
    // r/{roomId}/{roomId}/{userId}/t
    const topic = t.match(this.reTyping)
    if (topic[3] === this.core.user_id) return

    const userId = topic[3]
    const roomId = topic[1]

    this.emit('typing', {
      message,
      userId,
      roomId,
    })

    // TODO: Don't allow side-effect
    // it should be handled in the UI not core
    if (this.core.selected == null) return
    if (message === '1' && roomId === this.core.selected.id) {
      const actor = this.core.selected.participants.find(
        (it) => it.email === userId
      )
      if (actor == null) return
      const displayName = actor.username
      this.core.isTypingStatus = `${displayName} is typing ...`
    } else {
      this.core.isTypingStatus = ''
    }
  }

  deliveryReceiptHandler(t, message) {
    this.logger.debug('on:delivered', t, message)
    // r/{roomId}/{roomId}/{userId}/d
    const topic = t.match(this.reDelivery)
    const data = message.split(':')
    const commentId = Number(data[0])
    const commentUniqueId = data[1]
    const userId = topic[3]

    this.emit('message-delivered', {
      commentId,
      commentUniqueId,
      userId,
    })
  }

  readReceiptHandler(t, message) {
    this.logger.debug('on:read', t, message)
    // r/{roomId}/{roomId}/{userId}/r
    const topic = t.match(this.reRead)
    const data = message.split(':')
    const commentId = Number(data[0])
    const commentUniqueId = data[1]
    const userId = topic[3]

    this.emit('message-read', {
      commentId,
      commentUniqueId,
      userId,
    })
  }

  onlinePresenceHandler(topic, message) {
    this.logger.debug('on:online-presence', topic, message)
    // u/guest-1002/s
    const topicData = this.reOnlineStatus.exec(topic)
    const userId = topicData?.[1]

    this.emit('presence', { message, userId })
  }

  channelMessageHandler(topic, message) {
    this.logger.debug('on:channel-message', topic, message)
    this.emit('new-message', JSON.parse(message))
  }

  messageUpdatedHandler(topic, message) {
    message = JSON.parse(message)
    this.logger.debug('on:message-updated', topic, message)
    this.emit('message:updated', message)
  }

  // #region old-methods
  subscribeChannel(appId, uniqueId) {
    this.subscribe(`${appId}/${uniqueId}/c`)
  }

  subscribeRoom(roomId) {
    if (this.core.selected == null) return
    roomId = roomId || this.core.selected.id
    this.subscribe(`r/${roomId}/${roomId}/+/t`)
    this.subscribe(`r/${roomId}/${roomId}/+/d`)
    this.subscribe(`r/${roomId}/${roomId}/+/r`)
  }

  unsubscribeRoom(roomId) {
    if (this.core.selected == null) return
    roomId = roomId || this.core.selected.id
    this.unsubscribe(`r/${roomId}/${roomId}/+/t`)
    this.unsubscribe(`r/${roomId}/${roomId}/+/d`)
    this.unsubscribe(`r/${roomId}/${roomId}/+/r`)
  }

  get subscribeTyping() {
    return this.subscribeRoom.bind(this)
  }

  get unsubscribeTyping() {
    return this.unsubscribeRoom.bind(this)
  }

  subscribeUserChannel() {
    this.subscribe(`${this.core.userData.token}/c`, { qos: 1 })
    this.subscribe(`${this.core.userData.token}/n`, { qos: 1 })
    this.subscribe(`${this.core.userData.token}/update`, { qos: 1 })
  }

  publishPresence(userId, isOnline = true) {
    isOnline
      ? this.publish(`u/${userId}/s`, '1', { retain: true })
      : this.publish(`u/${userId}/s`, '0', { retain: true })
  }

  disconnect() {
    this.publishPresence(this.core.userData.email, false)
    this.unsubscribe(Object.keys(this.mqtt._resubscribeTopics))
  }

  subscribeUserPresence(userId) {
    this.subscribe(`u/${userId}/s`)
  }

  unsubscribeUserPresence(userId) {
    this.unsubscribe(`u/${userId}/s`)
  }

  get subscribeRoomPresence() {
    return this.subscribeUserPresence.bind(this)
  }

  get unsubscribeRoomPresence() {
    return this.unsubscribeUserPresence.bind(this)
  }

  publishTyping(status) {
    if (this.core.selected == null) return
    const roomId = this.core.selected.id
    const userId = this.core.user_id
    this.publish(`r/${roomId}/${roomId}/${userId}/t`, status)
  }

  // #endregion
}
