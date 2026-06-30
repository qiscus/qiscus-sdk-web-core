import xs from 'xstream'
import flattenConcurrently from 'xstream/extra/flattenConcurrently'
import { Callback, IQCallback1, Subscription } from '../defs'
import * as model from '../model'
import { tap } from '../utils/stream'
import {
  bufferUntil,
  process,
  subscribeOnNext,
  toCallbackOrPromise,
  toEventSubscription,
  toEventSubscription_,
} from '../utils/stream'
import {
  isOptBoolean,
  isOptJson,
  isReqBoolean,
  isReqNumber,
  isReqString,
  isRequired,
} from '../utils/param-utils'
import { isChatRoom } from '../utils/try-catch'
import { QiscusDeps } from './types'

// ---------------------------------------------------------------------------
// Stream factory functions (replicate the class's private stream fields)
// ---------------------------------------------------------------------------

export function makeOnMessageReceived$(deps: QiscusDeps) {
  return deps.realtimeAdapter
    .onNewMessage$()
    .map((it) => xs.fromPromise(deps.hookAdapter.triggerBeforeReceived$(it)))
    .compose(flattenConcurrently)
    .compose(
      tap((message) => {
        if (deps.storage.getCurrentUser()?.id !== message.sender.id) {
          deps.messageAdapter.markAsDelivered(message.chatRoomId, message.id)
        }
      })
    )
}

export function makeOnMessageUpdated$(deps: QiscusDeps) {
  return deps.realtimeAdapter.onMessageUpdated$
}

export function makeOnMessageRead$(deps: QiscusDeps) {
  return deps.realtimeAdapter
    .onMessageRead$()
    .map((data) => xs.fromPromise(deps.hookAdapter.triggerBeforeReceived$(data)))
    .compose(flattenConcurrently)
}

export function makeOnMessageDelivered$(deps: QiscusDeps) {
  return deps.realtimeAdapter
    .onMessageDelivered$()
    .map((it) => xs.fromPromise(deps.hookAdapter.triggerBeforeReceived$(it)))
    .compose(flattenConcurrently)
}

export function makeOnMessageDeleted$(deps: QiscusDeps) {
  return deps.realtimeAdapter.onMessageDeleted$
    .map((it) => xs.fromPromise(deps.hookAdapter.triggerBeforeReceived$(it)))
    .compose(flattenConcurrently)
}

export function makeOnRoomCleared$(deps: QiscusDeps) {
  return deps.realtimeAdapter
    .onRoomCleared$()
    .map((it) => xs.fromPromise(deps.hookAdapter.triggerBeforeReceived$(it)))
    .compose(flattenConcurrently)
}

// ---------------------------------------------------------------------------
// Methods
// ---------------------------------------------------------------------------

export function publishCustomEvent(deps: QiscusDeps, roomId: number, data: any, callback?: IQCallback1) {
  const userId = deps.storage.getCurrentUser()?.id
  return xs
    .combine(
      process(roomId, isReqNumber({ roomId })),
      process(userId, isReqString({ userId })),
      process(data, isOptJson({ data }))
    )
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map(([roomId, userId, data]) =>
      xs.fromPromise(Promise.resolve(deps.realtimeAdapter.mqtt.publishCustomEvent(roomId, userId, data)))
    )
    .compose(flattenConcurrently)
    .compose(toCallbackOrPromise<void>(callback))
}

export function publishOnlinePresence(deps: QiscusDeps, isOnline: boolean, callback?: IQCallback1): void | Promise<void> {
  const userId = deps.storage.getCurrentUser()?.id
  return xs
    .combine(process(isOnline, isReqBoolean({ isOnline })), process(userId, isReqString({ userId })))
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map(([isOnline, userId]) => xs.fromPromise(Promise.resolve(deps.realtimeAdapter.sendPresence(userId, isOnline))))
    .compose(flattenConcurrently)
    .compose(toCallbackOrPromise<void>(callback))
}

export function publishTyping(deps: QiscusDeps, roomId: number, isTyping?: boolean, callback?: IQCallback1): void | Promise<void> {
  return xs
    .combine(process(roomId, isReqNumber({ roomId })), process(isTyping, isOptBoolean({ isTyping })))
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map(([roomId, isTyping]) =>
      xs.fromPromise(Promise.resolve(deps.realtimeAdapter.sendTyping(roomId, deps.storage.getCurrentUser().id, isTyping ?? true)))
    )
    .compose(flattenConcurrently)
    .compose(toCallbackOrPromise<void>(callback))
}

export function subscribeCustomEvent(deps: QiscusDeps, roomId: number, callback: (data?: any, error?: Error) => void): void {
  deps.realtimeAdapter.mqtt.subscribeCustomEvent(roomId, callback)
}

export function unsubscribeCustomEvent(deps: QiscusDeps, roomId: number): void {
  deps.realtimeAdapter.mqtt.unsubscribeCustomEvent(roomId)
}

// ---------------------------------------------------------------------------
// on* handler methods — those referencing a shared stream$ take (deps, stream$, handler)
// those using adapter directly take (deps, handler)
// ---------------------------------------------------------------------------

export function onMessageReceived(
  deps: QiscusDeps,
  stream$: ReturnType<typeof makeOnMessageReceived$>,
  handler: (message: model.IQMessage) => void
) {
  return process(handler, isRequired({ handler }))
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .mapTo(stream$)
    .compose(flattenConcurrently)
    .compose(toEventSubscription_(handler))
}

export function onMessageUpdated(
  deps: QiscusDeps,
  stream$: ReturnType<typeof makeOnMessageUpdated$>,
  handler: (message: model.IQMessage) => void
): () => void {
  return process(handler, isRequired({ handler }))
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .mapTo(stream$)
    .compose(flattenConcurrently)
    .compose(toEventSubscription_(handler))
}

export function onMessageDeleted(
  deps: QiscusDeps,
  stream$: ReturnType<typeof makeOnMessageDeleted$>,
  handler: (message: model.IQMessage) => void
): Subscription {
  return process(handler, isRequired({ handler }))
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .mapTo(stream$)
    .compose(flattenConcurrently)
    .compose(toEventSubscription_(handler))
}

export function onMessageDelivered(
  deps: QiscusDeps,
  stream$: ReturnType<typeof makeOnMessageDelivered$>,
  handler: (message: model.IQMessage) => void
): Subscription {
  return process(handler, isRequired({ handler }))
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .mapTo(stream$)
    .compose(flattenConcurrently)
    .compose(toEventSubscription_(handler))
}

export function onMessageRead(
  deps: QiscusDeps,
  stream$: ReturnType<typeof makeOnMessageRead$>,
  handler: (message: model.IQMessage) => void
): Subscription {
  return process(handler, isRequired({ handler }))
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .mapTo(stream$)
    .compose(flattenConcurrently)
    .compose(toEventSubscription_(handler))
}

export function onUserTyping(
  deps: QiscusDeps,
  handler: (userId: string, roomId: number, isTyping: boolean) => void
): Subscription {
  return process(handler, isRequired({ handler }))
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .compose(toEventSubscription(deps.realtimeAdapter.onTyping))
}

export function onUserOnlinePresence(
  deps: QiscusDeps,
  handler: (userId: string, isOnline: boolean, lastSeen: Date) => void
): Subscription {
  return process(handler, isRequired({ handler }))
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .compose(toEventSubscription(deps.realtimeAdapter.onPresence))
}

export function onChatRoomCleared(
  deps: QiscusDeps,
  stream$: ReturnType<typeof makeOnRoomCleared$>,
  handler: Callback<number>
): Subscription {
  return process(handler, isRequired({ handler }))
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .mapTo(stream$)
    .compose(flattenConcurrently)
    .compose(
      toEventSubscription_((data) => {
        if (typeof data === 'number') return handler(data)
        if (isChatRoom(data)) return handler(data.id)
      })
    )
}

export function onConnected(deps: QiscusDeps, handler: () => void): Subscription {
  return process(handler, isRequired({ handler }))
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .compose(toEventSubscription(deps.realtimeAdapter.mqtt.onMqttConnected))
}

export function onReconnecting(deps: QiscusDeps, handler: () => void): Subscription {
  return process(handler, isRequired({ handler }))
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .compose(toEventSubscription(deps.realtimeAdapter.mqtt.onMqttReconnecting))
}

export function onDisconnected(deps: QiscusDeps, handler: () => void): Subscription {
  return process(handler, isRequired({ handler }))
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .compose(toEventSubscription(deps.realtimeAdapter.mqtt.onMqttDisconnected))
}

export function subscribeChatRoom(deps: QiscusDeps, room: model.IQChatRoom): void {
  process(room, isRequired({ room }))
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map((it) => [it])
    .compose(
      subscribeOnNext(([room]) => {
        if (room.type === 'channel') {
          deps.realtimeAdapter.mqtt.subscribeChannel(deps.storage.getAppId(), room.uniqueId)
        } else {
          deps.realtimeAdapter.mqtt.subscribeRoom(room.id)
        }
      })
    )
}

export function unsubscribeChatRoom(deps: QiscusDeps, room: model.IQChatRoom): void {
  process(room, isRequired({ room }))
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map((it) => [it])
    .compose(
      subscribeOnNext(([room]) => {
        if (room.type === 'channel') deps.realtimeAdapter.mqtt.unsubscribeChannel(deps.storage.getAppId(), room.uniqueId)
        else deps.realtimeAdapter.mqtt.unsubscribeRoom(room.id)
      })
    )
}

export function subscribeUserOnlinePresence(deps: QiscusDeps, userId: string): void {
  process(userId, isReqString({ userId }))
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map((it) => [it])
    .compose(subscribeOnNext(([userId]) => deps.realtimeAdapter.mqtt.subscribeUserPresence(userId)))
}

export function unsubscribeUserOnlinePresence(deps: QiscusDeps, userId: string): void {
  process(userId, isReqString({ userId }))
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map((it) => [it])
    .compose(subscribeOnNext(([userId]) => deps.realtimeAdapter.mqtt.unsubscribeUserPresence(userId)))
}
