import mitt from 'mitt'
import { IQHttpAdapter } from './http'
import getSyncAdapter from './sync'
import { IQMessage, IQRoom, IQUserAdapter } from '../defs'
import xs from 'xstream'

type Callback<T> = (data: T) => void
type Subscription = () => void

export interface IQRealtimeAdapter {
  onNewMessage (callback: Callback<IQMessage>): Subscription
  onMessageDelivered (callback: Callback<IQMessage>): Subscription
  onMessageRead (callback: Callback<IQMessage>): Subscription
  onMessageDeleted (callback: Callback<IQMessage>): Subscription
  onRoomCleared (callback: Callback<IQRoom>): Subscription
  onTyping (callback: Callback<boolean>): Subscription
  onPresence (callback: Callback<any>): Subscription

  synchronize (lastMessageId: number): void
  synchronizeEvent (lastEventId: number): void
  setTyping (isTyping: boolean): void
  setPresence (presence: boolean): void
}

export default function getRealtimeAdapter (
  http: IQHttpAdapter,
  syncInterval: number,
  brokerUrl: string,
  shouldSync: boolean,
  isLogin: boolean,
  token: string
): IQRealtimeAdapter {
  // @ts-ignore
  const emitter: mitt.Emitter = mitt()
  let isMqttConnected = false
  const sync = getSyncAdapter(http, token)

  xs.periodic(syncInterval)
    .filter(() => isLogin)
    .filter(() => isMqttConnected || shouldSync)
    .subscribe({
      next () {
        sync.synchronize()
        sync.synchronizeEvent()
      }
    })

  return {
    onMessageDeleted (callback: (data: IQMessage) => void): () => void {
      return sync.onMessageDeleted(callback)
    },
    onMessageDelivered (callback: (data: IQMessage) => void): () => void {
      return sync.onMessageDelivered(callback)
    },
    onMessageRead (callback: (data: IQMessage) => void): () => void {
      return sync.onMessageRead(callback)
    },
    onNewMessage (callback: (data: IQMessage) => void): () => void {
      return sync.onNewMessage(callback)
    },
    onPresence (callback: (data: any) => void): () => void {
      emitter.on('presence', callback)
      return () => emitter.off('presence', callback)
    },
    onRoomCleared (callback: (data: IQRoom) => void): () => void {
      return sync.onRoomCleared(callback)
    },
    onTyping (callback: (data: boolean) => void): () => void {
      emitter.on('typing', callback)
      return () => emitter.off('typing', callback)
    },
    setPresence (presence: boolean): void {
    },
    setTyping (isTyping: boolean): void {
    },
    synchronize (lastMessageId: number): void {
      sync.synchronize(lastMessageId)
    },
    synchronizeEvent (lastEventId: number): void {
      sync.synchronizeEvent(lastEventId)
    }
  }
}
/**
 *
 * const realtime = getRealtimeAdapter()
 * realtime.onNewMessage(callback)
 * realtime.onMessageRead(callback)
 * realtime.onMessageDelivered(callback)
 * realtime.onMessageDeleted(callback)
 * realtime.onRoomCleared(callback)
 * realtime.onTyping(callback)
 * realtime.onPresence(callback)
 *
 * realtime.synchronize(lastMessageId = 0)
 * realtime.synchronizeEvent(lastEventId = 0)
 * realtime.setTyping(isTyping)
 *
 * @param syncInterval
 * @param http () => IQHttpAdapter
 * @param user
 */
type RealtimeAdapterExtraParams = {
  http: () => IQHttpAdapter,
  user: () => IQUserAdapter,
  shouldSync: () => boolean,
  brokerUrl: () => string
}
