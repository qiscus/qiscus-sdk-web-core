import Kefir from 'kefir'
import { Callback, Subscription } from '../defs'
import * as model from '../model'
import { Storage } from '../storage'
import { subscribeOnNext } from '../utils/stream'
import { getLogger } from './logger'
import getMqttAdapter from './mqtt'
import getSyncAdapter from './sync'

export type SyncMethod<T extends any[]> = (callback: (...data: T) => void) => Subscription

function fromSync<T extends any[]>(method: SyncMethod<T>) {
  let subscription: Subscription

  return Kefir.stream<T, never>((emitter) => {
    subscription = method((...data) => {
      emitter.emit(data)
    })

    return () => subscription?.()
  })
}

export type RealtimeAdapter = ReturnType<typeof getRealtimeAdapter>
export default function getRealtimeAdapter(storage: Storage) {
  const mqtt = getMqttAdapter(storage)
  const logger = getLogger(storage)
  const sync = getSyncAdapter({
    s: storage,
    shouldSync() {
      // if (mqtt.mqtt == null) return true
      return mqtt.mqtt?.connected !== true
    },
    logger: (...args: string[]) => logger.log(...args),
  })

  // region emitter
  const newMessage$ = Kefir.merge([fromSync(sync.onNewMessage), fromSync(mqtt.onNewMessage)])
  const onMessageRead$ = Kefir.merge([fromSync(sync.onMessageRead), fromSync(mqtt.onMessageRead)])
  const onMessageDelivered$ = Kefir.merge([fromSync(sync.onMessageDelivered), fromSync(mqtt.onMessageDelivered)])
  const onMessageDeleted$ = Kefir.merge([fromSync(sync.onMessageDeleted), fromSync(mqtt.onMessageDeleted)])
  const onRoomCleared$ = Kefir.merge([
    fromSync(sync.onRoomCleared).map((r) => r.map((it) => it.id)),
    fromSync(mqtt.onRoomDeleted),
  ])
  const onMessageUpdated$ = Kefir.merge([fromSync(sync.onMessageUpdated), fromSync(mqtt.onMessageUpdated)])
  // endregion

  return {
    sync: sync,
    get mqtt() {
      return mqtt
    },
    clear(): void {
      mqtt.clear()
    },
    onMessageDeleted(callback: Callback<model.IQMessage>): Subscription {
      const subscription = subscribeOnNext<[model.IQMessage]>(([m]) => callback(m))(onMessageDeleted$)

      return () => subscription.unsubscribe()
    },
    onMessageDelivered(callback: Callback<model.IQMessage>): Subscription {
      const subscription = subscribeOnNext<[model.IQMessage]>(([it]) => callback(it))(onMessageDelivered$)

      return () => subscription.unsubscribe()
    },
    onMessageRead(callback: Callback<model.IQMessage>): Subscription {
      const subscription = subscribeOnNext<[model.IQMessage]>(([m]) => callback(m))(onMessageRead$)

      return () => subscription.unsubscribe()
    },
    onNewMessage(callback: Callback<model.IQMessage>): Subscription {
      const subscription = subscribeOnNext<[model.IQMessage]>(([m]) => callback(m))(newMessage$)

      return () => subscription.unsubscribe()
    },
    onMessageUpdated(callback: Callback<model.IQMessage>): Subscription {
      const subscription = subscribeOnNext<[model.IQMessage]>(([m]) => callback(m))(onMessageUpdated$)

      return () => subscription.unsubscribe()
    },
    onNewMessage$() {
      return newMessage$.map(([msg]) => msg)
    },
    get onMessageUpdated$() {
      return onMessageUpdated$.map(([msg]) => msg)
    },
    onMessageRead$() {
      return onMessageRead$.map(([it]) => it)
    },
    onMessageDelivered$() {
      return onMessageDelivered$.map(([it]) => it)
    },
    get onMessageDeleted$() {
      return onMessageDeleted$.map(([it]) => it)
    },
    onRoomCleared$() {
      return onRoomCleared$.map(([it]) => it)
    },

    onPresence(callback: (userId: string, isOnline: boolean, lastSeen: Date) => void): Subscription {
      const stream = fromSync(mqtt.onUserPresence)
      const subscription = subscribeOnNext<[string, boolean, Date]>((data) => callback(...data))(stream)

      return () => subscription.unsubscribe()
    },
    onRoomCleared(callback: Callback<number>): Subscription {
      const subscription = subscribeOnNext<number[]>(([roomId]) => callback(roomId))(onRoomCleared$)

      return () => subscription.unsubscribe()
    },
    onTyping(callback: (userId: string, roomId: number, isTyping: boolean) => void): Subscription {
      const subscription = subscribeOnNext<[string, number, boolean]>(([userId, roomId, isTyping]) =>
        callback(userId, roomId, isTyping)
      )(fromSync(mqtt.onUserTyping))

      return () => subscription.unsubscribe()
    },
    sendPresence(userId: string, isOnline: boolean): void {
      mqtt.sendPresence(userId, isOnline)
    },
    sendTyping(roomId: number, userId: string, isTyping: boolean): void {
      mqtt.sendTyping(roomId, userId, isTyping)
    },
    synchronize(lastMessageId: model.IQAccount['lastMessageId']): void {
      sync.synchronize(lastMessageId)
    },
    synchronizeEvent(lastEventId: model.IQAccount['lastSyncEventId']): void {
      sync.synchronizeEvent(lastEventId)
    },
  }
}
