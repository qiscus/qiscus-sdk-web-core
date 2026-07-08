import { parseRealtimeEvent, type CanonicalEvent } from './realtime-parser'
import { EventEmitter } from 'pietile-eventemitter'

// import { connect } from '../lib/mqtt'
// import type { IClientPublishOptions, MqttClient, IClientOptions } from '../lib/mqtt'
import { connect } from 'mqtt'
import type { IClientPublishOptions, MqttClient, IClientOptions } from 'mqtt'

import type { Callback, Subscription } from '../defs'
import * as m from '../v3/model'
import * as Decoder from '../v3/decoder'
import { getLogger } from './logger'
import { Storage } from '../storage'
import { tryCatch, wrapP } from '../utils/try-catch'
import * as Api from '../api'
import { Provider } from '../provider'

/**
 * v3's per-shell adapter: maps a shared `CanonicalEvent` (from
 * `parseRealtimeEvent`) onto v3's decoded emitter events — the SAME emissions
 * `getMqttHandler` used to produce, but now the topic-matching + deserialization
 * live once in the shared parser. This is the v3 half of the single-source
 * realtime seam; its byte-parity is gated by the 74 core-v3 tests.
 */
function adaptCanonicalToV3(event: CanonicalEvent, emitter: EventEmitter<Events>): void {
  switch (event.kind) {
    case 'message':
    case 'channel-message': {
      const message = tryCatch(
        () => Decoder.message(event.rawComment),
        event.rawComment as m.IQMessage,
        (error) => console.log('error when parsing data', error)
      )
      emitter.emit('message::received', message)
      return
    }
    case 'notification': {
      if (event.actionTopic === 'delete_message') {
        event.deletedMessages.forEach((d) => {
          const roomId = parseInt(d.room_id, 10)
          d.message_unique_ids.forEach((uniqueId) => emitter.emit('message::deleted', { roomId, uniqueId }))
        })
      }
      if (event.actionTopic === 'clear_room') {
        event.deletedRooms.forEach((room) => emitter.emit('room::cleared', room.id))
      }
      return
    }
    case 'typing': {
      emitter.emit('user::typing', {
        roomId: parseInt(event.roomId, 10),
        userId: event.userId,
        isTyping: Number(event.payload) === 1,
      })
      return
    }
    case 'delivered': {
      emitter.emit('message::delivered', {
        roomId: parseInt(event.roomId, 10),
        userId: event.userId,
        messageId: event.messageId,
        messageUniqueId: event.messageUniqueId,
      })
      return
    }
    case 'read': {
      emitter.emit('message::read', {
        roomId: parseInt(event.roomId, 10),
        userId: event.userId,
        messageId: event.messageId,
        messageUniqueId: event.messageUniqueId,
      })
      return
    }
    case 'presence': {
      const parts = event.payload.split(':')
      emitter.emit('user::presence', {
        userId: event.userId,
        isOnline: Number(parts[0]) === 1,
        lastSeen: new Date(Number(parts[1])),
      })
      return
    }
    case 'message-updated': {
      const message = tryCatch(() => Decoder.message(event.rawComment), event.rawComment as m.IQMessage)
      emitter.emit('message::updated', message)
      return
    }
    case 'custom-event': {
      emitter.emit('custom-event', { roomId: parseInt(event.roomId, 10), payload: event.payload })
      return
    }
    case 'room-typing':
      // v3 has no consumer for the r/{roomId}/typing route yet (v2-only today);
      // the route lives in the shared parser so v3 can add `onRoomTyping` later.
      return
  }
}

export type MqttAdapter = ReturnType<typeof getMqttAdapter>
export default function getMqttAdapter(
  s: Storage,
  opts?: { getClientId?: () => string; enableHeartbeat?: boolean }
) {
  // Captured once, here — `__mqtt_conneck` below shadows this same param name
  // with its own local `IClientOptions` variable, so reading `opts?.enableHeartbeat`
  // from inside it would not see this flag.
  const enableHeartbeat = opts?.enableHeartbeat !== false
  let mqtt: _MqttClient | undefined = undefined
  let shouldConnect = true
  let reconnectFailures = 0
  let willConnectToRealtime = false
  let reconnectTimerId: ReturnType<typeof setTimeout> | undefined = undefined

  const emitter = new EventEmitter<Events>()
  const subscribedCustomEventTopics = new Map<number, any>()
  const getTopicForCustomEvent = (roomId: number) => `r/${roomId}/${roomId}/e`
  const logger = getLogger(s)

  const api = Api.getMqttNode(s)(Provider(s).withCredentials)
  const getMqttNode = () =>
    Api.makeApiRequest(s)
      .request<GetMqttNodeResponse>(api)
      .then((r) => {
        const url = r.data.url
        const port = r.data.wss_port
        return `wss://${url}:${port}/mqtt`
      })

  const __mqtt_connected_handler = () => {
    reconnectFailures = 0
    willConnectToRealtime = false
    emitter.emit('mqtt::connected')
  }
  const __mqtt_reconnect_handler = () => emitter.emit('mqtt::reconnecting')
  const __mqtt_closed_handler = () => emitter.emit('mqtt::close')
  const __mqtt_message_handler = (t: string, m: string) => {
    const message = m.toString()
    // Raw firehose first, for every topic (see `mqtt::message` in `Events`).
    emitter.emit('mqtt::message', { topic: t, payload: message })
    logger.log('message', t, message)
    // Shared parse -> v3 adapter (single source; see realtime-parser.ts).
    const event = parseRealtimeEvent(t, message)
    if (event != null) adaptCanonicalToV3(event, emitter)
  }
  const __mqtt_error_handler = (err: Error) => {
    if (err && err.message === 'client disconnecting') return
    emitter.emit('mqtt::error', err.message)
    logger.log('error', err.message)
  }
  let intervalId = -1
  const _getClientId = () => {
    if (opts?.getClientId != null) return opts.getClientId()
    const appId = s.getAppId()
    const userId = s.getCurrentUser()?.id
    const now = Date.now()
    return `${appId}_${userId}_${now}`
  }
  const __mqtt_conneck = (brokerUrl: string) => {
    if (mqtt != null) {
      mqtt?.removeAllListeners()
      mqtt?.end(true)
      mqtt = undefined
    }
    // `?.id` (not `.id`): v2 connects PRE-login (no current user yet), which
    // must produce a `u/undefined/s` will topic rather than throwing here.
    const lastWill = `u/${s.getCurrentUser()?.id}/s`
    const opts: IClientOptions = {
      clientId: _getClientId(),
      reconnectPeriod: 1000,
      will: {
        topic: lastWill,
        payload: '0',
        retain: true,
        qos: 1,
      },
    }

    const mqtt_: MqttClient = connect(brokerUrl, opts)
    mqtt_.addListener('connect', __mqtt_connected_handler)
    mqtt_.addListener('reconnect', __mqtt_reconnect_handler)
    mqtt_.addListener('close', __mqtt_closed_handler)
    mqtt_.addListener('error', __mqtt_error_handler)
    mqtt_.addListener('message', __mqtt_message_handler)

    // Clear any interval left from a previous `conneck()`/`open()` before
    // (maybe) starting a new one — otherwise repeated (re)connects stack
    // duplicate heartbeat timers.
    if (intervalId !== -1) {
      clearInterval(intervalId)
      intervalId = -1
    }
    if (enableHeartbeat) {
      intervalId = setInterval(() => {
        if (s.getCurrentUser() != null) {
          sendPresence(s.getCurrentUser().id, true)
        }
      }, 3500) as unknown as number
    }

    return mqtt_ as _MqttClient
  }

  const __mqtt_schedule_lb_reconnect = () => {
    if (willConnectToRealtime) return
    if (shouldConnect === false) return
    if (s.getCurrentUser() == null) return
    if (!s.getBrokerLbEnabled()) return

    if (reconnectTimerId != null) {
      clearTimeout(reconnectTimerId)
      reconnectTimerId = undefined
    }

    const delay = Math.min(1000 * 2 ** reconnectFailures, 30000)

    // Prevent the mqtt library's own 1s auto-retry from hammering a dead
    // broker while we wait for the backoff delay to elapse.
    mqtt?.end(true)

    reconnectTimerId = setTimeout(async () => {
      willConnectToRealtime = true
      reconnectFailures++

      if (intervalId !== -1) {
        clearInterval(intervalId)
        intervalId = -1
      }

      // TODO: Need a better way to get all subscribed topics
      const topics = Object.keys((mqtt as any)?._resubscribeTopics ?? {})
      const [url, err] = await wrapP(getMqttNode())
      if (err) {
        logger.log(`cannot get new brokerUrl, using old url instead (${s.getBrokerUrl()})`)
        mqtt = __mqtt_conneck(s.getBrokerUrl())
      } else {
        s.setBrokerUrl(url)
        logger.log(`connecting to new broker url ${url}`)
        mqtt = __mqtt_conneck(url)
      }
      logger.log(`resubscribe to old topics ${topics}`)
      topics.forEach((t) => subscribeTopic(t))
      willConnectToRealtime = false
    }, delay)
  }

  emitter.on('mqtt::close', __mqtt_schedule_lb_reconnect)
  emitter.on('custom-event', (data) => {
    const roomId = data.roomId
    if (subscribedCustomEventTopics.has(roomId)) {
      const callback = subscribedCustomEventTopics.get(roomId)
      callback(data.payload)
    }
  })

  // Buffered generic subscribe/unsubscribe/publish (single code path): every
  // domain method below (subscribeRoom, sendTyping, ...) routes through these
  // three so a call made before the client exists is never silently dropped —
  // this is a strict superset of v2's own subscribe/unsubscribe/publish
  // buffers (`packages/version-2/src/lib/adapters/mqtt.js`). Each push is
  // followed by an immediate drain attempt (mqtt may already be connected, as
  // in v2), and `mqtt::connected` triggers one more drain so a buffered op
  // isn't stuck forever if nothing happens to call subscribe/publish again.
  const subscribeBuffer: string[] = []
  const unsubscribeBuffer: string[] = []
  const publishBuffer: { topic: string; payload: string; options?: object }[] = []

  function flushSubscribe() {
    while (mqtt != null && subscribeBuffer.length > 0) {
      const topic = subscribeBuffer.shift()
      if (topic != null) mqtt.subscribe(topic)
    }
  }
  function flushUnsubscribe() {
    while (mqtt != null && unsubscribeBuffer.length > 0) {
      const topic = unsubscribeBuffer.shift()
      if (topic != null) mqtt.unsubscribe(topic)
    }
  }
  function flushPublish() {
    while (mqtt != null && publishBuffer.length > 0) {
      const data = publishBuffer.shift()
      if (data != null) mqtt.publish(data.topic, data.payload, data.options as IClientPublishOptions)
    }
  }
  function flushAll() {
    flushSubscribe()
    flushUnsubscribe()
    flushPublish()
  }
  emitter.on('mqtt::connected', flushAll)

  function subscribeTopic(topic: string): void {
    subscribeBuffer.push(topic)
    flushSubscribe()
  }
  function unsubscribeTopic(topic: string): void {
    unsubscribeBuffer.push(topic)
    flushUnsubscribe()
  }
  function publishTopic(topic: string, payload: string, options?: object): void {
    publishBuffer.push({ topic, payload, options })
    flushPublish()
  }

  function sendPresence(userId: string, isOnline: boolean) {
    const status = isOnline ? '1' : '0'
    publishTopic(`u/${userId}/s`, status, { retain: true })
  }

  return {
    get mqtt() {
      return mqtt
    },
    clear() {
      // sendPresence(mqtt, userId, false)
      clearInterval(intervalId)
      Object.keys(mqtt?._resubscribeTopics ?? {}).forEach((it) => unsubscribeTopic(it))
      mqtt?.end()
    },
    async close() {
      shouldConnect = false
      this.mqtt?.end(true)
    },
    async open() {
      shouldConnect = true
      this.conneck()
    },
    conneck() {
      mqtt = __mqtt_conneck(s.getBrokerUrl())
    },
    onMqttConnected(callback: () => void): () => void {
      emitter.on('mqtt::connected', callback)
      return () => emitter.off('mqtt::connected', callback)
    },
    // Raw firehose subscription (see `mqtt::message`). Fires for every inbound
    // MQTT message with the topic + raw payload string, before decoding — the
    // seam v2's realtime bridge uses to run its own matcher/parsers.
    onMessage(callback: (topic: string, payload: string) => void): () => void {
      const handler = (data: { topic: string; payload: string }) => callback(data.topic, data.payload)
      emitter.on('mqtt::message', handler)
      return () => emitter.off('mqtt::message', handler)
    },
    onMqttReconnecting(callback: () => void): Subscription {
      emitter.on('mqtt::reconnecting', callback)
      return () => emitter.off('mqtt::reconnecting', callback)
    },
    onMqttDisconnected(callback: () => void): Subscription {
      // NOTE: 'mqtt::disconnected' is never emitted today (dead) — kept for
      // back-compat; use onMqttClose/onMqttError below for live signals.
      emitter.on('mqtt::disconnected', callback)
      return () => emitter.off('mqtt::disconnected', callback)
    },
    onMqttClose(callback: () => void): () => void {
      emitter.on('mqtt::close', callback)
      return () => emitter.off('mqtt::close', callback)
    },
    onMqttError(callback: (err: string) => void): () => void {
      emitter.on('mqtt::error', callback)
      return () => emitter.off('mqtt::error', callback)
    },
    onMessageDeleted(callback: (data: m.IQMessage) => void): () => void {
      const handler = (msg: { roomId: number; uniqueId: string }) => {
        const message = Decoder.message({
          room_id: msg.roomId,
          unique_temp_id: msg.uniqueId,
        } as any)
        callback(message)
      }
      emitter.on('message::deleted', handler)
      return () => emitter.off('message::deleted', handler)
    },
    onMessageDelivered(callback: (data: m.IQMessage) => void): () => void {
      const handler = (data: MqttMessageDelivery) => {
        const message = Decoder.message({
          unique_temp_id: data.messageUniqueId,
          id: parseInt(data.messageId),
          email: data.userId,
          room_id: data.roomId,
        } as any)
        callback(message)
      }

      emitter.on('message::delivered', handler)
      return () => emitter.off('message::delivered', handler)
    },
    onMessageRead(callback: (m: m.IQMessage) => void): () => void {
      const handler = (data: MqttMessageDelivery) => {
        const message = Decoder.message({
          unique_temp_id: data.messageUniqueId,
          id: parseInt(data.messageId),
          email: data.userId,
          room_id: data.roomId,
        } as any)
        callback(message)
      }

      emitter.on('message::read', handler)
      return () => emitter.off('message::read', handler)
    },
    onNewMessage(callback: (data: m.IQMessage) => void): () => void {
      emitter.on('message::received', callback)
      return () => emitter.off('message::received', callback)
    },
    onMessageUpdated(callback: (data: m.IQMessage) => void): () => void {
      emitter.on('message::updated', callback)
      return () => emitter.off('message::updated', callback)
    },
    onRoomDeleted(callback: (data: number) => void): () => void {
      emitter.on('room::cleared', callback)
      return () => emitter.off('room::cleared', callback)
    },
    onUserPresence(callback: (userId: string, isOnline: boolean, lastSeen: Date) => void): () => void {
      const handler = (data: MqttUserPresence) => {
        callback(data.userId, data.isOnline, data.lastSeen)
      }
      emitter.on('user::presence', handler)
      return () => emitter.off('user::presence', handler)
    },
    onUserTyping(callback: (userId: string, roomId: number, isTyping: boolean) => void): () => void {
      const handler = (data: MqttUserTyping) => {
        callback(data.userId, data.roomId, data.isTyping)
      }
      emitter.on('user::typing', handler)
      return () => emitter.off('user::typing', handler)
    },
    publishCustomEvent(roomId: number, userId: string, data: any): void {
      const payload = JSON.stringify({
        sender: userId,
        data: data,
      })
      publishTopic(getTopicForCustomEvent(roomId), payload)
    },
    subscribeCustomEvent(roomId: number, callback: Callback<any>): void {
      const topic = getTopicForCustomEvent(roomId)
      if (subscribedCustomEventTopics.has(roomId)) return

      subscribeTopic(topic)
      subscribedCustomEventTopics.set(roomId, callback)
    },
    unsubscribeCustomEvent(roomId: number): void {
      const topic = getTopicForCustomEvent(roomId)
      if (!subscribedCustomEventTopics.has(roomId)) return

      unsubscribeTopic(topic)
      subscribedCustomEventTopics.delete(roomId)
    },
    sendPresence(userId: string, isOnline: boolean): void {
      sendPresence(userId, isOnline)
    },
    sendTyping(roomId: number, userId: string, isTyping: boolean): void {
      const payload = isTyping ? '1' : '0'
      publishTopic(`r/${roomId}/${roomId}/${userId}/t`, payload)
    },
    subscribeUser(userToken: string): Subscription {
      subscribeTopic(`${userToken}/c`)
      subscribeTopic(`${userToken}/n`)
      subscribeTopic(`${userToken}/update`)
      return () => {
        unsubscribeTopic(`${userToken}/c`)
        unsubscribeTopic(`${userToken}/n`)
        unsubscribeTopic(`${userToken}/update`)
      }
    },
    subscribeUserPresence(userId: string): void {
      subscribeTopic(`u/${userId}/s`)
    },
    unsubscribeUserPresence(userId: string): void {
      unsubscribeTopic(`u/${userId}/s`)
    },
    // 4 topics, incl. `r/{roomId}/typing` (v2-only route today; the shared
    // parser already has a `room-typing` CanonicalEvent kind for it).
    subscribeRoom(roomId: number): void {
      subscribeTopic(`r/${roomId}/typing`)
      subscribeTopic(`r/${roomId}/${roomId}/+/t`)
      subscribeTopic(`r/${roomId}/${roomId}/+/d`)
      subscribeTopic(`r/${roomId}/${roomId}/+/r`)
    },
    unsubscribeRoom(roomId: number): void {
      unsubscribeTopic(`r/${roomId}/typing`)
      unsubscribeTopic(`r/${roomId}/${roomId}/+/t`)
      unsubscribeTopic(`r/${roomId}/${roomId}/+/d`)
      unsubscribeTopic(`r/${roomId}/${roomId}/+/r`)
    },
    subscribeChannel(appId: string, channelUniqueId: string): void {
      subscribeTopic(`${appId}/${channelUniqueId}/c`)
    },
    unsubscribeChannel(appId: string, channelUniqueId: string): void {
      unsubscribeTopic(`${appId}/${channelUniqueId}/c`)
    },
    // Buffered generics (see the buffer block above) — the seam v2's
    // `custom-event.js` and other v2 facade methods call directly.
    subscribe(topic: string): void {
      subscribeTopic(topic)
    },
    unsubscribe(topic: string): void {
      unsubscribeTopic(topic)
    },
    publish(topic: string, payload: string, options?: object): void {
      publishTopic(topic, payload, options)
    },
  }
}

// region Type
export type MqttMessage = {
  id: number
  comment_before_id: number
  message: string
  username: string
  email: string
  user_avatar: string
  timestamp: string
  unix_timestamp: number
  created_at: Date
  room_id: number
  room_name: string
  topic_id: number
  unique_temp_id: string
  disable_link_preview: boolean
  chat_type: string
  comment_before_id_str: string
  extras: object
  is_public_channel: boolean
  payload: object
  raw_room_name: string
  room_avatar: string
  room_id_str: string
  room_options: string
  room_type: string
  status: string
  topic_id_str: string
  type: string
  unix_nano_timestamp: number
  user_avatar_url: string
  user_id: number
  user_id_str: string
}
export type MqttNotification = {
  id: number
  timestamp: number
  action_topic: string
  payload: {
    actor: {
      id: string
      email: string
      name: string
    }
    data: {
      deleted_messages: [
        {
          message_unique_ids: string[]
          room_id: string
        }
      ]
      is_hard_delete: boolean
      deleted_rooms: [
        {
          avatar_url: string
          chat_type: string
          id: number
          id_str: string
          options: object
          raw_room_name: string
          room_name: string
          unique_id: string
          last_comment: object
        }
      ]
    }
  }
}
export type MqttMessageReceived = {
  message: MqttMessage
}
export type MqttMessageDelivery = {
  roomId: number
  userId: string
  messageId: string
  messageUniqueId: string
}
export type MqttUserPresence = {
  userId: string
  isOnline: boolean
  lastSeen: Date
}
export type MqttUserTyping = {
  isTyping: boolean
  userId: string
  roomId: number
}
export type MqttCustomEvent = { roomId: number; payload: any }

interface Events {
  'message::received': (message: m.IQMessage) => void
  'message::delivered': (message: MqttMessageDelivery) => void
  'message::read': (message: MqttMessageDelivery) => void
  'message::deleted': (data: { roomId: number; uniqueId: string }) => void
  'message::updated': (data: m.IQMessage) => void
  'room::cleared': (roomId: number) => void
  'user::typing': (data: MqttUserTyping) => void
  'user::presence': (data: MqttUserPresence) => void
  'channel-message::new': (message: { message: m.IQMessage; channelUniqueId: string }) => void
  'custom-event': (payload: MqttCustomEvent) => void
  'mqtt::connected': () => void
  'mqtt::disconnected': () => void
  'mqtt::reconnecting': () => void
  'mqtt::error': (err: string) => void
  'mqtt::close': () => void
  // Raw firehose: every inbound MQTT message (topic + raw payload string),
  // emitted BEFORE core-v3's own decode/matcher runs. Additive — the decoded
  // events above are unchanged. Consumers that need the raw payload (e.g. v2's
  // realtime bridge, which does its own topic-matching + parsing) subscribe via
  // `onMessage`, so topics core-v3's matcher doesn't handle still reach them.
  'mqtt::message': (data: { topic: string; payload: string }) => void
}

type _MqttClient = MqttClient & {
  _resubscribeTopics: string[]
}

type GetMqttNodeResponse = {
  data: {
    ssl_port: string
    url: string
    wss_port: string
  }
  node: string
  status: number
}
// endregion
