import { match, when } from '../utils/match'
import mitt from 'mitt'
import connect from 'mqtt/lib/connect'
import { atom, Atom, Derivable } from 'derivable'
import { IClientPublishOptions, MqttClient } from 'mqtt'
import { IQMessageAdapter, Subscription, Callback } from '../defs'

const reNewMessage = /^([\w]+)\/c/i;
const reNotification = /^([\w]+)\/n/i;
const reTyping = /^r\/([\d]+)\/([\d]+)\/([\S]+)\/t$/i;
const reDelivery = /^r\/([\d]+)\/([\d]+)\/([\S]+)\/d$/i;
const reRead = /^r\/([\d]+)\/([\d]+)\/([\S]+)\/r$/i;
const reOnlineStatus = /^u\/([\S]+)\/s$/i;
const reChannelMessage = /^([\S]+)\/([\S]+)\/c/i;
const reCustomEvent = /^r\/[\w]+\/[\w]+\/e$/i;


const noop = () => {};

export interface IQMqttAdapter {
  connect (userId: string): void
  onMqttConnected (callback: Callback<any>): Subscription
  onMqttReconnecting (callback: Callback<void>): Subscription
  onMqttDisconnected (callback: Callback<void>): Subscription
  onNewMessage (callback: Callback<any>): Subscription
  onMessageDelivered (callback: Callback<any>): Subscription
  onMessageRead (callback: Callback<any>): Subscription
  onUserTyping (callback: Callback<any>): Subscription
  onUserPresence (callback: Callback<any>): Subscription
  onNewChannelMessage (callback: Callback<any>): Subscription
  onMessageDeleted (callback: Callback<any>): Subscription
  onRoomDeleted (callback: Callback<any>): Subscription
  sendPresence(userId: string): void
  sendTyping(roomId: number, userId: string, isTyping: boolean): void
  publishCustomEvent(roomId: number, userId: string, data: any): void
  subscribeCustomEvent(roomId: number, callback: Callback<any>): void
  unsubscribeCustomEvent(roomId: number): void
  subscribeUser(userToken: string): Subscription
  subscribeRoom(roomId: string): Subscription
  subscribeChannel(appId: string, channelUniqueId: string): Subscription
  readonly mqtt: any
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
  channelMessageHandler: MQTTHandler,
  customEventHandler: MQTTHandler,
}

const getMqttHandler = (): IQMqttHandler => {
  return null
};

export default function getMqttAdapter (message: Derivable<IQMessageAdapter>, brokerUrl: Derivable<string>): IQMqttAdapter {
  // @ts-ignore
  const emitter = mitt();
  const handler = getMqttHandler();
  const subscribedCustomEventTopics = new Map<number, Function>();
  const getTopic = (roomId: number) => `r/${roomId}/${roomId}/e`;
  const logger = (...args: any[]) => console.log('MqttAdapter:', ...args);
  const matcher = match({
    [when(reNewMessage)]: (topic: string) => handler.newMessage(topic),
    [when(reNotification)]: (topic: string) => handler.notificationHandler(topic),
    [when(reTyping)]: (topic: string) => handler.typingHandler(topic),
    [when(reDelivery)]: (topic: string) => handler.deliveredHandler(topic),
    [when(reRead)]: (topic: string) => handler.readHandler(topic),
    [when(reOnlineStatus)]: (topic: string) => handler.onlineHandler(topic),
    [when(reChannelMessage)]: (topic: string) => handler.channelMessageHandler(topic),
    [when(reCustomEvent)]: (topic: string) => handler.customEventHandler(topic),
    [when()]: (topic: string) => (message: any) => logger('topic not handled', topic, message)
  });
  const mqtt: Atom<MqttClient | null> = atom(null);

  return {
    get mqtt() { return mqtt.get() },
    connect (userId: string): void {
      const _mqtt = connect(brokerUrl.get(), {
        will: {
          topic: `u/${userId}/s`,
          payload: 0,
          retain: 0
        }
      });
      mqtt.set(_mqtt);

      _mqtt.on('message', (topic: string, message: any) => {
        message = message.toString();
        const func = matcher(topic);
        if (func != null) func(message);
      });
      _mqtt.on('connect', () => {
        emitter.emit('mqtt::connected')
      });
      _mqtt.on('reconnect', () => {
        emitter.emit('mqtt:reconnecting')
      });
      _mqtt.on('close', () => {
        emitter.emit('mqtt::close')
      });
      _mqtt.on('error', () => {
        emitter.emit('mqtt::error')
      })
    },
    onMqttConnected (callback: Callback<any>): () => void {
      emitter.on('mqtt::connected', callback);
      return () => emitter.off('mqtt::connected', callback)
    },
    onMqttReconnecting (callback: Callback<void>): Subscription {
      emitter.on('mqtt::reconnecting', callback);
      return () => emitter.off('mqtt::reconnecting', callback);
    },
    onMqttDisconnected (callback: Callback<void>): Subscription {
      emitter.on('mqtt::close', callback);
      return () => emitter.off('mqtt::close', callback);
    },
    onMessageDeleted (callback: (data: any) => void): () => void {
      emitter.on('message::deleted', callback);
      return () => emitter.off('message::deleted', callback)
    },
    onMessageDelivered (callback: (data: any) => void): () => void {
      emitter.on('message::delivered', callback);
      return () => emitter.off('message::delivered', callback)
    },
    onMessageRead (callback: (data: any) => void): () => void {
      emitter.on('message::read', callback);
      return () => emitter.off('message::read', callback)
    },
    onNewChannelMessage (callback: (data: any) => void): () => void {
      emitter.on('channel-message::new', callback);
      return () => emitter.off('channel-message::new', callback)
    },
    onNewMessage (callback: (data: any) => void): () => void {
      emitter.on('message::new', callback);
      emitter.on('message::new', (message) => {
        console.log('mqtt.on:message', message)
      })
      return () => emitter.off('message::new', callback)
    },
    onRoomDeleted (callback: (data: any) => void): () => void {
      emitter.on('room::deleted', callback);
      return () => emitter.off('room::deleted', callback)
    },
    onUserPresence (callback: (data: any) => void): () => void {
      emitter.on('user::presence', callback);
      return () => emitter.off('user::presence', callback)
    },
    onUserTyping (callback: (data: any) => void): () => void {
      emitter.on('user::typing', callback);
      return () => emitter.off('user::typing', callback)
    },
    publishCustomEvent(roomId: number, userId: string, data: any): void {
      const payload = JSON.stringify({
        sender: userId,
        data: data
      });
      mqtt.get().publish(getTopic(roomId), payload)
    },
    subscribeCustomEvent(roomId: number, callback: Callback<any>): void {
      const topic = getTopic(roomId);
      if (subscribedCustomEventTopics.has(roomId)) return;

      mqtt.get().subscribe(topic);
      subscribedCustomEventTopics.set(roomId, callback)
    },
    unsubscribeCustomEvent(roomId: number): void {
      const topic = getTopic(roomId);
      if (!subscribedCustomEventTopics.has(roomId)) return;

      mqtt.get().unsubscribe(topic);
      subscribedCustomEventTopics.delete(roomId)
    },
    sendPresence (userId: string): void {
      mqtt.get().publish(`u/${userId}/s`, '1', { retain: true } as IClientPublishOptions)
    },
    sendTyping (roomId: number, userId: string, isTyping: boolean): void {
      const payload = isTyping ? '1' : '0';
      mqtt.get().publish(`r/${roomId}/${roomId}/${userId}/t`, payload)
    },
    subscribeUser(userToken: string): Subscription {
      mqtt.get()
        .subscribe(`${userToken}/c`)
        .subscribe(`${userToken}/n`);
      return () => mqtt.get()
        .unsubscribe(`${userToken}/c`)
        .unsubscribe(`${userToken}/n`);
    },
    subscribeRoom(roomId: string): Subscription {
      mqtt.get()
        .subscribe(`r/${roomId}/${roomId}/+/t`)
        .subscribe(`r/${roomId}/${roomId}/+/d`)
        .subscribe(`r/${roomId}/${roomId}/+/r`);
      return () => mqtt.get()
        .unsubscribe(`r/${roomId}/${roomId}/+/t`)
        .unsubscribe(`r/${roomId}/${roomId}/+/d`)
        .unsubscribe(`r/${roomId}/${roomId}/+/r`);
    },
    subscribeChannel(appId: string, channelUniqueId: string): Subscription {
      mqtt.get()
        .subscribe(`${appId}/${channelUniqueId}/c`);
      return () => mqtt.get()
        .unsubscribe(`${appId}/${channelUniqueId}/c`);
    }
  }
}
