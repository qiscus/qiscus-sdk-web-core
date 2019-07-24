import * as mitt from 'mitt'
import { interval, observe, pipe } from 'callbag-basics'
import takeWhile from 'callbag-take-while'
import { IQHttpAdapter } from './http'
import { IQUserAdapter } from './user'
import { IQMessage } from './message'
import { IQRoom } from './room'
import getSyncAdapter from './sync'

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
export default function getRealtimeAdapter (
  syncInterval: number = 5000,
  { http, user, shouldSync, brokerUrl }: RealtimeAdapterExtraParams
): IQRealtimeAdapter {
  const emitter = new mitt()
  let isMqttConnected = false
  const sync = getSyncAdapter({ http, user })

  pipe(
    interval(syncInterval),
    takeWhile(() => !isMqttConnected || shouldSync()),
    observe(() => {
      sync.synchronize()
      sync.synchronizeEvent()
    })
  )

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
