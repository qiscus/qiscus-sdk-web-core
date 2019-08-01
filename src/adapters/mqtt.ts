import { match, when } from '../utils/match'
import mitt from 'mitt'
import connect from 'mqtt/lib/connect'

const reNewMessage = /^([\w]+)\/c/i
const reNotification = /^([\w]+)\/n/i
const reTyping = /^r\/([\d]+)\/([\d]+)\/([\S]+)\/t$/i
const reDelivery = /^r\/([\d]+)\/([\d]+)\/([\S]+)\/d$/i
const reRead = /^r\/([\d]+)\/([\d]+)\/([\S]+)\/r$/i
const reOnlineStatus = /^u\/([\S]+)\/s$/i
const reChannelMessage = /^([\S]+)\/([\S]+)\/c/i

const noop = () => {}
type Subscription = () => void

interface IQMqttAdapter {
  onNewMessage (callback: (data: any) => void): Subscription
  onMessageDelivered (callback: (data: any) => void): Subscription
  onMessageRead (callback: (data: any) => void): Subscription
  onUserTyping (callback: (data: any) => void): Subscription
  onUserPresence (callback: (data: any) => void): Subscription
  onNewChannelMessage (callback: (data: any) => void): Subscription
  onMessageDeleted (callback: (data: any) => void): Subscription
  onRoomDeleted (callback: (data: any) => void): Subscription
}

type MQTTHandler = (topic: string) => (data: any) => {}
interface IQMqttHandler {
  newMessage: MQTTHandler
  notificationHandler: MQTTHandler
  typingHandler: MQTTHandler
  deliveredHandler: MQTTHandler
  readHandler: MQTTHandler
  onlineHandler: MQTTHandler
  channelMessageHandler: MQTTHandler
}

const getMqttHandler = (): IQMqttHandler => {
  return null
}

export default function getMqttAdapter (getBrokerUrl: () => string) {
  // @ts-ignore
  const emitter = mitt()
  const handler = getMqttHandler()
  const logger = (...args: any[]) => console.log('MqttAdapter:', ...args)
  const matcher = match({
    [when(reNewMessage)]: (topic: string) => handler.newMessage(topic),
    [when(reNotification)]: (topic: string) => handler.notificationHandler(topic),
    [when(reTyping)]: (topic: string) => handler.typingHandler(topic),
    [when(reDelivery)]: (topic: string) => handler.deliveredHandler(topic),
    [when(reRead)]: (topic: string) => handler.readHandler(topic),
    [when(reOnlineStatus)]: (topic: string) => handler.onlineHandler(topic),
    [when(reChannelMessage)]: (topic: string) => handler.channelMessageHandler(topic),
    [when()]: (topic: string) => (message: any) => logger('topic not handled', topic, message)
  })

  return {
    connect(userId: string) {
      const mqtt = connect(getBrokerUrl(), {
        will: {
          topic: `u/${userId}/s`,
          payload: 0,
          retain: 0
        }
      })
      mqtt.on('message', (topic: string, message: any) => {
        message = message.toString()
        const func = matcher(topic)
        if (func != null) func(message)
      })
      mqtt.on('connect', () => {
        emitter.emit('mqtt::connected')
      })
      mqtt.on('reconnect', () => {
        emitter.emit('mqtt:reconnecting')
      })
      mqtt.on('close', () => {
        emitter.emit('mqtt::close')
      })
      mqtt.on('error', () => {
        emitter.emit('mqtt::error')
      })
    },
    onMqttConnected (callback: () => void): () => void {
      emitter.on('mqtt::connected', callback)
      return () => emitter.off('mqtt::connected', callback)
    },
    onMessageDeleted (callback: (data: any) => void): () => void {
      emitter.on('message::deleted', callback)
      return () => emitter.off('message::deleted', callback)
    },
    onMessageDelivered (callback: (data: any) => void): () => void {
      emitter.on('message::delivered', callback)
      return () => emitter.off('message::delivered', callback)
    },
    onMessageRead (callback: (data: any) => void): () => void {
      emitter.on('message::read', callback)
      return () => emitter.off('message::read', callback)
    },
    onNewChannelMessage (callback: (data: any) => void): () => void {
      emitter.on('channel-message::new', callback)
      return () => emitter.off('channel-message::new', callback)
    },
    onNewMessage (callback: (data: any) => void): () => void {
      emitter.on('message::new', callback)
      return () => emitter.off('message::new', callback)
    },
    onRoomDeleted (callback: (data: any) => void): () => void {
      emitter.on('room::deleted', callback)
      return () => emitter.off('room::deleted', callback)
    },
    onUserPresence (callback: (data: any) => void): () => void {
      emitter.on('user::presence', callback)
      return () => emitter.off('user::presence', callback)
    },
    onUserTyping (callback: (data: any) => void): () => void {
      emitter.on('user::typing', callback)
      return () => emitter.off('user::typing', callback)
    }
  }
}
