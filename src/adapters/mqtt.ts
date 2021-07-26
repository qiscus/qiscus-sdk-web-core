import { match, when } from '../utils/match'
import axios from 'axios'
import debounce from 'lodash.debounce'
import { EventEmitter } from 'pietile-eventemitter'
// @ts-ignore
// import connect from 'mqtt/lib/connect'
import connect from 'mqtt/lib/connect'
import { IClientPublishOptions, MqttClient, IClientOptions } from 'mqtt'
import { Callback, Subscription } from '../defs'
import * as m from '../model'
import * as Decoder from '../decoder'
import { getLogger } from './logger'
import { Storage } from '../storage'
import { tryCatch, wrapP, getOrThrow } from '../utils/try-catch'

const reNewMessage = /^([\w]+)\/c/i
const reNotification = /^([\w]+)\/n/i
const reTyping = /^r\/([\d]+)\/([\d]+)\/([\S]+)\/t$/i
const reDelivery = /^r\/([\d]+)\/([\d]+)\/([\S]+)\/d$/i
const reRead = /^r\/([\d]+)\/([\d]+)\/([\S]+)\/r$/i
const reOnlineStatus = /^u\/([\S]+)\/s$/i
const reChannelMessage = /^([\S]+)\/([\S]+)\/c/i
const reCustomEvent = /^r\/[\w]+\/[\w]+\/e$/i
const reMessageUpdated = /^([\w]+)\/update/i

function getMqttHandler(emitter: EventEmitter<Events>): IQMqttHandler {
  return {
    channelMessageHandler: (_) => (data) => {
      const message = tryCatch(
        () => Decoder.message(JSON.parse(data)),
        data,
        (error) => console.log('error when parsing data', error)
      )
      emitter.emit('message::received', message)
    },
    customEventHandler: (topic) => (data) => {
      const topicData = reCustomEvent.exec(topic)
      const roomId = parseInt(getOrThrow<string>(topicData?.[1], '`roomId` are null on customEventHandler'))
      const payload = JSON.parse(data)
      emitter.emit('custom-event', { roomId, payload })
    },
    notificationHandler: (_) => (data: string) => {
      const payload = JSON.parse(data) as MqttNotification

      if (payload.action_topic === 'delete_message') {
        const deletedMessagesData = payload.payload.data.deleted_messages
        deletedMessagesData.forEach((data) => {
          const roomId = parseInt(data.room_id, 10)
          data.message_unique_ids.forEach((uniqueId) => {
            emitter.emit('message::deleted', { roomId, uniqueId })
          })
        })
      }
      if (payload.action_topic === 'clear_room') {
        const clearedRooms = payload.payload.data.deleted_rooms
        clearedRooms.forEach((room) => {
          const roomId = room.id
          emitter.emit('room::cleared', roomId)
        })
      }
    },
    onlineHandler: (topic) => (data) => {
      const topicData = reOnlineStatus.exec(topic)
      const payload = data.split(':')
      const userId = getOrThrow<string>(topicData?.[1], '`userId` are null on onlineHandler')
      const isOnline = Number(payload[0]) === 1
      const lastSeen = new Date(Number(payload[1]))
      emitter.emit('user::presence', { userId, isOnline, lastSeen })
    },
    deliveredHandler: (topic) => (data) => {
      const topicData = reDelivery.exec(topic)
      const payload = data.split(':')
      const roomId = parseInt(getOrThrow<string>(topicData?.[1], '`roomId` are null on deliveredHandler'), 10)
      const userId = getOrThrow<string>(topicData?.[3], '`userId` are null on deliveredHandler')
      const messageId = payload[0]
      const messageUniqueId = payload[1]
      emitter.emit('message::delivered', {
        roomId,
        userId,
        messageId,
        messageUniqueId,
      })
    },
    newMessage: (_) => (data) => {
      const message: m.IQMessage = tryCatch(() => Decoder.message(JSON.parse(data)), data)
      emitter.emit('message::received', message)
    },
    readHandler: (topic) => (data) => {
      const topicData = reRead.exec(topic)
      const roomId = parseInt(getOrThrow<string>(topicData?.[1], '`roomId` are null on readHandler'), 10)
      const userId = getOrThrow<string>(topicData?.[3], '`userId` are null on readHandler')
      const payload = data.split(':')
      const messageId = payload[0]
      const messageUniqueId = payload[1]
      emitter.emit('message::read', {
        roomId,
        userId,
        messageId,
        messageUniqueId,
      })
    },
    typingHandler: (topic) => (data) => {
      const topicData = reTyping.exec(topic)
      const roomId = parseInt(getOrThrow<string>(topicData?.[1], '`roomId` are null on typingHandler'), 10)
      const userId = getOrThrow<string>(topicData?.[3], '`userId` are null on typingHandler')
      const isTyping = Number(data) === 1
      emitter.emit('user::typing', { roomId, userId, isTyping })
    },
    messageUpdatedHandler: (_) => (data) => {
      const message: m.IQMessage = tryCatch(() => Decoder.message(JSON.parse(data)), data)
      emitter.emit('message::updated', message)
    },
  }
}

export default function getMqttAdapter(s: Storage, opts?: { getClientId?: () => string }) {
  let mqtt: _MqttClient | undefined = undefined
  let cacheUrl: string = s.getBrokerUrl()
  const emitter = new EventEmitter<Events>()
  const handler = getMqttHandler(emitter)
  const subscribedCustomEventTopics = new Map<number, any>()
  const getTopicForCustomEvent = (roomId: number) => `r/${roomId}/${roomId}/e`
  const logger = getLogger(s)
  const matcher = match({
    [when(reNewMessage)]: handler.newMessage,
    [when(reNotification)]: handler.notificationHandler,
    [when(reTyping)]: handler.typingHandler,
    [when(reDelivery)]: handler.deliveredHandler,
    [when(reRead)]: handler.readHandler,
    [when(reOnlineStatus)]: handler.onlineHandler,
    [when(reChannelMessage)]: handler.channelMessageHandler,
    [when(reCustomEvent)]: handler.customEventHandler,
    [when(reMessageUpdated)]: handler.messageUpdatedHandler,
    [when()]: (topic: string) => (message: any) => logger.log('topic not handled', topic, message),
  })
  const getMqttNode = () =>
    axios
      .get(s.getBrokerLbUrl())
      .then((it) => it.data)
      .then((res) => {
        const url = res.data.url
        const port = res.data.wss_port
        return `wss://${url}:${port}/mqtt`
      })

  const __mqtt_connected_handler = () => emitter.emit('mqtt::connected')
  const __mqtt_reconnect_handler = () => emitter.emit('mqtt::reconnecting')
  const __mqtt_closed_handler = () => emitter.emit('mqtt::close')
  const __mqtt_message_handler = (t: string, m: string) => {
    const message = m.toString()
    const func = matcher(t)
    logger.log('message', t, message)
    if (func != null) func(message)
  }
  const __mqtt_error_handler = (err: Error) => {
    if (err && err.message === 'client disconnecting') return
    emitter.emit('mqtt::error', err.message)
    logger.log('error', err.message)
  }
  let intervalId = -1
  const _getClientId = () => {
    if (opts?.getClientId != null) opts?.getClientId()
    const appId = s.getAppId()
    const userId = s.getCurrentUser().id
    const now = Date.now()
    return `${appId}_${userId}_${now}`
  }
  const __mqtt_conneck = (brokerUrl: string) => {
    if (mqtt != null) {
      mqtt?.removeAllListeners()
      mqtt?.end(true)
      mqtt = undefined
    }
    const lastWill = `u/${s.getCurrentUser().id}/s`
    const opts: IClientOptions = {
      clientId: _getClientId(),
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

    intervalId = setInterval(() => {
      if (s.getCurrentUser() != null) {
        sendPresence(mqtt, s.getCurrentUser().id, true)
      }
    }, 3500) as unknown as number

    return mqtt_ as _MqttClient
  }

  cacheUrl = s.getBrokerUrl()

  emitter.on(
    'mqtt::close',
    debounce(async () => {
      if (s.getCurrentUser() == null) return
      if (!s.getBrokerLbEnabled()) return

      if (intervalId !== -1) {
        clearInterval(intervalId)
        intervalId = -1
      }

      // TODO: Need a better way to get all subscribed topics
      const topics = Object.keys((mqtt as any)._resubscribeTopics)
      const [url, err] = await wrapP(getMqttNode())
      if (err) {
        logger.log(`cannot get new brokerUrl, using old url instead (${cacheUrl})`)
        mqtt = __mqtt_conneck(cacheUrl)
      } else {
        cacheUrl = url
        logger.log(`connecting to new broker url ${url}`)
        mqtt = __mqtt_conneck(url)
      }
      logger.log(`resubscribe to old topics ${topics}`)
      topics.forEach((t) => mqtt?.subscribe(t))
    }, 300)
  )
  emitter.on('custom-event', (data) => {
    const roomId = data.roomId
    if (subscribedCustomEventTopics.has(roomId)) {
      const callback = subscribedCustomEventTopics.get(roomId)
      callback(data.payload)
    }
  })

  function sendPresence(mqttClient: MqttClient | undefined, userId: string, isOnline: boolean) {
    const status = isOnline ? '1' : '0'
    mqttClient?.publish(`u/${userId}/s`, status, {
      retain: true,
    } as IClientPublishOptions)
  }

  return {
    get mqtt() {
      return mqtt
    },
    clear() {
      // sendPresence(mqtt, userId, false)
      clearInterval(intervalId)
      Object.keys(mqtt?._resubscribeTopics ?? {}).forEach((it) => mqtt?.unsubscribe(it))
      mqtt?.end()
    },
    conneck() {
      mqtt = __mqtt_conneck(s.getBrokerUrl())
    },
    onMqttConnected(callback: () => void): () => void {
      emitter.on('mqtt::connected', callback)
      return () => emitter.off('mqtt::connected', callback)
    },
    onMqttReconnecting(callback: () => void): Subscription {
      emitter.on('mqtt::reconnecting', callback)
      return () => emitter.off('mqtt::reconnecting', callback)
    },
    onMqttDisconnected(callback: () => void): Subscription {
      emitter.on('mqtt::disconnected', callback)
      return () => emitter.off('mqtt::disconnected', callback)
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
      mqtt?.publish(getTopicForCustomEvent(roomId), payload)
    },
    subscribeCustomEvent(roomId: number, callback: Callback<any>): void {
      const topic = getTopicForCustomEvent(roomId)
      if (subscribedCustomEventTopics.has(roomId)) return

      mqtt?.subscribe(topic)
      subscribedCustomEventTopics.set(roomId, callback)
    },
    unsubscribeCustomEvent(roomId: number): void {
      const topic = getTopicForCustomEvent(roomId)
      if (!subscribedCustomEventTopics.has(roomId)) return

      mqtt?.unsubscribe(topic)
      subscribedCustomEventTopics.delete(roomId)
    },
    sendPresence(userId: string, isOnline: boolean): void {
      sendPresence(mqtt, userId, isOnline)
    },
    sendTyping(roomId: number, userId: string, isTyping: boolean): void {
      const payload = isTyping ? '1' : '0'
      mqtt?.publish(`r/${roomId}/${roomId}/${userId}/t`, payload)
    },
    subscribeUser(userToken: string): Subscription {
      mqtt //
        ?.subscribe(`${userToken}/c`)
        ?.subscribe(`${userToken}/n`)
        ?.subscribe(`${userToken}/update`)
      return () => {
        mqtt //
          ?.unsubscribe(`${userToken}/c`)
          ?.unsubscribe(`${userToken}/n`)
          ?.unsubscribe(`${userToken}/update`)
      }
    },
    subscribeUserPresence(userId: string): void {
      mqtt?.subscribe(`u/${userId}/s`)
    },
    unsubscribeUserPresence(userId: string): void {
      mqtt?.unsubscribe(`u/${userId}/s`)
    },
    subscribeRoom(roomId: number): void {
      mqtt
        ?.subscribe(`r/${roomId}/${roomId}/+/t`)
        ?.subscribe(`r/${roomId}/${roomId}/+/d`)
        ?.subscribe(`r/${roomId}/${roomId}/+/r`)
    },
    unsubscribeRoom(roomId: number): void {
      mqtt
        ?.unsubscribe(`r/${roomId}/${roomId}/+/t`)
        ?.unsubscribe(`r/${roomId}/${roomId}/+/d`)
        ?.unsubscribe(`r/${roomId}/${roomId}/+/r`)
    },
    subscribeChannel(appId: string, channelUniqueId: string): void {
      mqtt?.subscribe(`${appId}/${channelUniqueId}/c`)
    },
    unsubscribeChannel(appId: string, channelUniqueId: string): void {
      mqtt?.unsubscribe(`${appId}/${channelUniqueId}/c`)
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
}

interface MQTTHandler {
  (topic: string): (data: any) => void
}

interface IQMqttHandler {
  newMessage: MQTTHandler
  notificationHandler: MQTTHandler
  typingHandler: MQTTHandler
  deliveredHandler: MQTTHandler
  readHandler: MQTTHandler
  onlineHandler: MQTTHandler
  channelMessageHandler: MQTTHandler
  customEventHandler: MQTTHandler
  messageUpdatedHandler: MQTTHandler
}

type _MqttClient = MqttClient & {
  _resubscribeTopics: string[]
}
// endregion
