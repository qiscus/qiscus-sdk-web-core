import { getMqttAdapter, storageFactory, parseRealtimeEvent } from '@qiscus/core-v3'
import { adaptCanonicalToV2 } from '../../compat/realtime-bridge'
import mitt from 'mitt'

/**
 * P3c (docs/v2-full-shell-plan.md): v2's `MqttAdapter` keeps its exact public
 * facade + mitt surface (so `index.js` / `custom-event.js` are untouched), but
 * internally DELEGATES connection, topic subscription, and buffering to
 * core-v3's `getMqttAdapter`. Only the pieces byte-parity requires stay here:
 * the `core.selected`-null guards, the `core.mqttURL` read/write, and
 * `__mqtt_message_handler`/`__mqtt_error_handler` (single-source parsing via
 * `parseRealtimeEvent` + `adaptCanonicalToV2`, unchanged from before P3c).
 */
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
      shouldConnect,
      brokerLbUrl,
      enableLb,
      getClientId,
      // Test seam: allow injecting a fake `connect` implementation so the
      // facade (topic strings, buffering, disconnect, presence/typing
      // payloads, mitt passthrough) can be characterized without opening a
      // real socket. Defaults to `undefined`, in which case core-v3's
      // `getMqttAdapter` falls back to the real `mqtt` lib.
      connect,
    }
  ) {
    this.emitter = mitt()
    this.core = core
    this.brokerLbUrl = brokerLbUrl
    this.getClientId = getClientId
    this.enableLb = enableLb
    this.shouldConnect = shouldConnect

    // A storage facade bound LIVE to `core`'s mutable state (not a one-time
    // snapshot): core-v3's mqtt adapter reads/writes broker url, current
    // user, and LB config through this on every connect/reconnect, so it
    // must observe the SAME live fields v2's old adapter read directly off
    // `this.core` (pre->post-login transitions, LB reconnect write-back).
    const storage = storageFactory()
    storage.setBaseUrl(core.baseURL)
    storage.setAppId(core.AppId)
    storage.setVersion(core.version)
    storage.setCustomHeaders(core._customHeader || {})

    storage.getCurrentUser = () =>
      core.user_id != null ? { ...(core.userData || {}), id: core.user_id } : null
    storage.getToken = () => core.userData?.token
    storage.getBrokerUrl = () => core.mqttURL
    storage.setBrokerUrl = (u) => {
      core.mqttURL = u
    }
    storage.getBrokerLbUrl = () => core.brokerLbUrl
    storage.getBrokerLbEnabled = () => core.enableLb === true

    // enableHeartbeat MUST be false: v2's shell owns its own 3.5s heartbeat
    // (index.js, the `presensePublisherId` interval set right after login) —
    // a core-owned heartbeat too would double-publish presence and break
    // `publishOnlinePresence(false)` on logout.
    this._core = getMqttAdapter(storage, { enableHeartbeat: false, getClientId, connect })

    // Bridge core's connection events onto v2's mitt surface so `index.js`'s
    // `.on('connected'|'reconnect'|'close'|'error', …)` keep working.
    this._core.onMqttConnected(() => this.emit('connected'))
    this._core.onMqttReconnecting(() => this.emit('reconnect'))
    this._core.onMqttClose((...args) => this.emit('close', args))
    this._core.onMqttError((msg) => this.emit('error', msg))

    // Bridge raw messages to v2's existing single-source parsing path
    // (unchanged; see `__mqtt_message_handler` below).
    this._core.onMessage((t, m) => this.__mqtt_message_handler(t, m))

    // core-v3's `getMqttAdapter` does not auto-connect (only `conneck()`
    // does), whereas v2's old constructor connected immediately unless
    // `shouldConnect` was `false` (in which case it connected then
    // immediately `end(true)`d — net observable = never connected). Preserve
    // that: connect here unless the caller explicitly opted out.
    if (shouldConnect !== false) this._core.conneck()
  }

  __mqtt_message_handler = (t, m) => {
    const message = m.toString()
    this.logger('message', t, m)
    // Phase 4 single-source (docs/v2-on-core-v3-plan.md §7): classify + parse
    // via core-v3's shared `parseRealtimeEvent`, then adapt to v2's mitt
    // shapes (`compat/realtime-bridge.js` `adaptCanonicalToV2`). The emit
    // shapes are pinned by `compat/realtime-bridge.test.js`.
    const event = parseRealtimeEvent(t, message)
    if (event != null) adaptCanonicalToV2(event, (...args) => this.emit(...args), this.core)
  }

  // Kept for API compat / characterization tests, which call this directly.
  // Not wired to core's `onMqttError` bridge above: core-v3's own
  // `__mqtt_error_handler` already suppresses "client disconnecting"
  // internally, so this never fires in production, but the observable
  // suppression behavior must remain callable/testable on the facade.
  __mqtt_error_handler = (err) => {
    if (err && err.message === 'client disconnecting') return
    this.emitter.emit('error', err.message)
    this.logger('error', err.message)
  }

  get cacheRealtimeURL() {
    return this.core.mqttURL
  }
  set cacheRealtimeURL(url) {
    this.core.mqttURL = url
  }

  connect() {
    this._core.conneck()
  }

  /**
   * @return {Promise<boolean>}
   */
  async openConnection() {
    this.shouldConnect = true
    return this._core.open()
  }

  /**
   * @return {Promise<boolean>}
   */
  async closeConnection() {
    this.shouldConnect = false
    return this._core.close()
  }

  get mqtt() {
    return this._core.mqtt
  }

  get connected() {
    return this._core.mqtt?.connected === true
  }

  subscribe(topic) {
    this._core.subscribe(topic)
  }

  unsubscribe(topic) {
    this._core.unsubscribe(topic)
  }

  publish(topic, payload, options) {
    this._core.publish(topic, String(payload), options)
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
    this._core.subscribeChannel(appId, uniqueId)
  }

  subscribeRoom(roomId) {
    if (this.core.selected == null) return
    roomId = roomId || this.core.selected.id
    this._core.subscribeRoom(roomId)
  }

  unsubscribeRoom(roomId) {
    if (this.core.selected == null) return
    roomId = roomId || this.core.selected.id
    this._core.unsubscribeRoom(roomId)
  }

  get subscribeTyping() {
    return this.subscribeRoom.bind(this)
  }

  get unsubscribeTyping() {
    return this.unsubscribeRoom.bind(this)
  }

  subscribeUserChannel() {
    this._core.subscribeUser(this.core.userData.token)
  }

  subscribeUserChannelByToken(token) {
    this._core.subscribeUser(token)
  }
  unsubscribeUserChannel() {
    const token = this.core.userData.token
    this._core.unsubscribe(`${token}/c`)
    this._core.unsubscribe(`${token}/n`)
    this._core.unsubscribe(`${token}/update`)
  }
  unsusbcribeUserChannelByToken(token) {
    this._core.unsubscribe(`${token}/c`)
    this._core.unsubscribe(`${token}/n`)
    this._core.unsubscribe(`${token}/update`)
  }

  publishPresence(userId, isOnline = true) {
    this._core.sendPresence(userId, isOnline)
  }

  disconnect() {
    this.publishPresence(this.core.userData.email, false)
    Object.keys(this._core.mqtt?._resubscribeTopics ?? {}).forEach((topic) =>
      this._core.unsubscribe(topic)
    )
  }

  subscribeUserPresence(userId) {
    this._core.subscribeUserPresence(userId)
  }

  unsubscribeUserPresence(userId) {
    this._core.unsubscribeUserPresence(userId)
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
    this._core.publish(`r/${roomId}/${roomId}/${userId}/t`, String(status))
  }

  // #endregion
}
