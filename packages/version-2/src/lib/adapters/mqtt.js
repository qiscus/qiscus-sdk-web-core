import { parseRealtimeEvent } from '@qiscus/core-v3'
import { adaptCanonicalToV2 } from '../../compat/realtime-bridge'
import mitt from 'mitt'
import connect from 'mqtt/lib/connect'
import request from 'superagent'
import debounce from 'lodash.debounce'
import { wrapP } from '../util'

export default class MqttAdapter {
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
   */
  /**
   * @param {string} url
   * @param {QiscusSDK} core
   * @param {boolean} login
   * @param {MqttAdapterParams} obj
   */
  constructor(
    url,
    core,
    login,
    {
      shouldConnect = true,
      brokerLbUrl,
      enableLb,
      getClientId,
      // Test seam: allow injecting a fake `connect` implementation so the
      // facade (topic strings, buffering, disconnect, presence/typing
      // payloads, mitt passthrough) can be characterized without opening a
      // real socket. Defaults to the real `mqtt/lib/connect` import, so this
      // is fully backward-compatible.
      connect: connectImpl = connect,
    }
  ) {
    this.emitter = mitt()
    this.core = core
    this.mqtt = null
    this.brokerLbUrl = brokerLbUrl
    this.getClientId = getClientId
    this.enableLb = enableLb
    this.shouldConnect = shouldConnect
    this._connect = connectImpl

    let mqtt = this.__mqtt_conneck(url)
    this.mqtt = mqtt

    // if appConfig set realtimeEnabled to false,
    // we intentionally end mqtt connection here.
    // TODO: Make a better way to not connect
    //       to broker, but still having mqtt client initiated.
    if (!shouldConnect) mqtt.end(true)

    this.willConnectToRealtime = false

    // handle load balencer
    this.emitter.on('close', this._on_close_handler)
    // this.emitter.on('connected', () => {
    //   this.willConnectToRealtime = false
    // })
  }

  _getClientId = () => {
    if (this.getClientId == null)
      return `${this.core.AppId}_${this.core.user_id}_${Date.now()}`
    return this.getClientId()
  }

  __mqtt_connected_handler = () => {
    this.emitter.emit('connected')
  }
  __mqtt_reconnect_handler = () => {
    this.emitter.emit('reconnect')
  }
  __mqtt_closed_handler = (...args) => {
    this.emitter.emit('close', args)
  }
  __mqtt_message_handler = (t, m) => {
    const message = m.toString()
    this.logger('message', t, m)
    // Phase 4 single-source (docs/v2-on-core-v3-plan.md §7): classify + parse
    // via core-v3's shared `parseRealtimeEvent`, then adapt to v2's mitt shapes
    // (`compat/realtime-bridge.js` `adaptCanonicalToV2`). This supersedes this
    // adapter's own per-topic handlers/matcher below (now dead — removed in a
    // follow-up); the emit shapes are pinned by
    // `compat/realtime-bridge.test.js`. Connection + subscribe/publish facade
    // stay here (per-shell transport policy).
    const event = parseRealtimeEvent(t, message)
    if (event != null) adaptCanonicalToV2(event, (...args) => this.emit(...args), this.core)
  }
  __mqtt_error_handler = (err) => {
    if (err && err.message === 'client disconnecting') return
    this.emitter.emit('error', err.message)
    this.logger('error', err.message)
  }
  __mqtt_conneck = (brokerUrl) => {
    const topics = []
    const opts = {
      will: {
        topic: `u/${this.core.user_id}/s`,
        payload: 0,
        retain: true,
      },
      clientId: this._getClientId(),
      // reconnectPeriod: 0,
      // connectTimeout: 1 * 1000,
    }

    if (brokerUrl == null) brokerUrl = this.cacheRealtimeURL
    if (this.mqtt != null) {
      const _topics = Object.keys(this.mqtt._resubscribeTopics)
      topics.push(..._topics)

      this.mqtt.removeAllListeners()
      this.mqtt.end(true)
      delete this.mqtt
      this.mqtt = null
    }

    const mqtt = this._connect(brokerUrl, opts)

    // #region Mqtt Listener
    mqtt.addListener('connect', this.__mqtt_connected_handler)
    mqtt.addListener('reconnect', this.__mqtt_reconnect_handler)
    mqtt.addListener('close', this.__mqtt_closed_handler)
    mqtt.addListener('error', this.__mqtt_error_handler)
    mqtt.addListener('message', this.__mqtt_message_handler)
    // #endregion

    this.logger(`resubscribe to old topics ${topics}`)
    topics.forEach((topic) => mqtt.subscribe(topic))

    return mqtt
  }
  _on_close_handler = debounce(async () => {
    const shouldReconnect =
      this.enableLb === true && // appConfig enabling realtime lb
      this.core.isLogin === true && // is logged in
      this.shouldConnect === true && // should reconnect?
      !this.willConnectToRealtime // is there still reconnect process in progress?

    if (this.logEnabled) {
      console.group('@mqtt.closed')
      console.log(`this.enableLb(${this.enableLb})`)
      console.log(`this.core.isLogin(${this.core.isLogin})`)
      console.log(`this.shouldConnect(${this.shouldConnect})`)
      console.log(`this.willConnectToRealtime(${this.willConnectToRealtime})`)
      console.log(`shouldReconnect(${shouldReconnect})`)
      console.groupEnd()
    }

    if (!shouldReconnect) return
    this.willConnectToRealtime = true

    const [url, err] = await wrapP(this.getMqttNode())
    if (err) {
      this.logger(
        `cannot get new brokerURL, using old url instead (${this.cacheRealtimeURL})`
      )
      this.mqtt = this.__mqtt_conneck(this.cacheRealtimeURL)
    } else {
      this.cacheRealtimeURL = url
      this.logger('trying to reconnect to', url)
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
    this.mqtt = this.__mqtt_conneck()
  }

  /**
   * @return {Promise<boolean>}
   */
  async closeConnection() {
    this.shouldConnect = false
    this.mqtt.end(true, (err) => {
      if (err) {
        this.logger('error when close connection', err.message)
      }
    })
    this.mqtt = null
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

  subscribtionBuffer = []
  subscribe(...args) {
    this.subscribtionBuffer.push(args)
    while (this.mqtt != null && this.subscribtionBuffer.length > 0) {
      const subs = this.subscribtionBuffer.shift()
      if (subs != null) {
        this.logger('subscribe topic', subs)
        this.mqtt.subscribe(...subs)
      }
    }
  }

  unsubscribtionBuffer = []
  unsubscribe(...args) {
    this.unsubscribtionBuffer.push(args)
    while (this.mqtt != null && this.unsubscribtionBuffer.length > 0) {
      const subs = this.unsubscribtionBuffer.shift()
      if (subs != null) {
        this.logger('unsubscribe topic', subs)
        this.mqtt.unsubscribe(...subs)
      }
    }
  }

  publishBuffer = []
  publish(topic, payload, options = {}) {
    this.publishBuffer.push({ topic, payload, options })
    while (this.mqtt != null && this.publishBuffer.length > 0) {
      const data = this.publishBuffer.shift()
      if (data != null) {
        this.logger('publish to', data.topic, data.payload, data.options)
        this.mqtt.publish(
          data.topic,
          data.payload.toString(),
          data.options
        )
      }
    }
  }

  emit(...args) {
    this.emitter.emit(...args)
  }

  on(...args) {
    this.emitter.on(...args)
  }
  off(...args) {
    this.emitter.off(...args)
  }

  get logEnabled() {
    return this.core.debugMQTTMode
  }
  get logger() {
    if (!this.core.debugMQTTMode) return this.noop
    return console.log.bind(console, 'QRealtime ->')
  }

  noop() { }

  // #region old-methods
  subscribeChannel(appId, uniqueId) {
    this.subscribe(`${appId}/${uniqueId}/c`)
  }

  subscribeRoom(roomId) {
    if (this.core.selected == null) return
    roomId = roomId || this.core.selected.id
    this.subscribe(`r/${roomId}/typing`)
    this.subscribe(`r/${roomId}/${roomId}/+/t`)
    this.subscribe(`r/${roomId}/${roomId}/+/d`)
    this.subscribe(`r/${roomId}/${roomId}/+/r`)
  }

  unsubscribeRoom(roomId) {
    if (this.core.selected == null) return
    roomId = roomId || this.core.selected.id
    this.unsubscribe(`r/${roomId}/typing`)
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
    this.subscribe(`${this.core.userData.token}/c`)
    this.subscribe(`${this.core.userData.token}/n`)
    this.subscribe(`${this.core.userData.token}/update`)
  }

  subscribeUserChannelByToken(token) {
    this.subscribe(`${token}/c`)
    this.subscribe(`${token}/n`)
    this.subscribe(`${token}/update`)
  }
  unsubscribeUserChannel() {
    this.unsubscribe(`${this.core.userData.token}/c`)
    this.unsubscribe(`${this.core.userData.token}/n`)
    this.unsubscribe(`${this.core.userData.token}/update`)
  }
  unsusbcribeUserChannelByToken(token) {
    this.unsubscribe(`${token}/c`)
    this.unsubscribe(`${token}/n`)
    this.unsubscribe(`${token}/update`)
  }

  publishPresence(userId, isOnline = true) {
    isOnline
      ? this.publish(`u/${userId}/s`, 1, { retain: true })
      : this.publish(`u/${userId}/s`, 0, { retain: true })
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
