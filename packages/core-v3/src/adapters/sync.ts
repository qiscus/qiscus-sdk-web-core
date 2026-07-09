import { EventEmitter } from 'pietile-eventemitter'
import * as Api from '../api'
import * as m from '../v3/model'
import { Storage } from '../storage'
import { synchronizeEventFactory } from './sync-event-factory'
import { synchronizeFactory } from './sync-factory'

const noop = () => {}

export interface IQSyncEvent {
  'room.cleared': (room: m.IQChatRoom) => void
  'message.new': (message: m.IQMessage) => void
  'message.delivered': (data: m.IQMessage) => void
  'message.deleted': (message: m.IQMessage) => void
  'message.read': (message: m.IQMessage) => void
  'message.updated': (message: m.IQMessage) => void
  'last-message-id': (id: m.IQAccount['lastMessageId']) => void
  'last-event-id': (id: m.IQAccount['lastSyncEventId']) => void
}

export type SyncAdapter = ReturnType<typeof getSyncAdapter>
export default function getSyncAdapter(o: {
  s: Storage
  api: Api.ApiRequester
  isMqttConnected: () => boolean
  logger: (...args: string[]) => void
  // Optional gating flag (default off = v3 behavior unchanged, same shape as
  // `mqtt.ts`'s `enableHeartbeat`): when true, sync is skipped entirely while
  // MQTT is connected (v2's "sync only when MQTT disconnected" rule), instead
  // of only slowing the poll interval.
  syncOnlyWhenDisconnected?: boolean
}) {
  const emitter = new EventEmitter<IQSyncEvent>()
  function shouldSync(): boolean {
    let isAuthenticated = o.s.getCurrentUser() != null
    let isNotForceDisabled = o.s.getForceDisableSync() !== true

    o.logger(`enableSync --> isNotForceDisabled(${isNotForceDisabled})`)
    o.logger(`enableSync --> isAuthenticated(${isAuthenticated})`)

    return (
      isAuthenticated &&
      isNotForceDisabled &&
      (o.syncOnlyWhenDisconnected !== true || o.isMqttConnected() !== true)
    )
  }
  function isSyncEnabled(): boolean {
    let isAbleToSync = shouldSync()
    let isEnabled = o.s.getIsSyncEnabled()
    return isAbleToSync && isEnabled
  }
  function isSyncEventEnabled(): boolean {
    let isAbleToSync = shouldSync()
    let isEnabled = o.s.getIsSyncEventEnabled()
    return isAbleToSync && isEnabled
  }

  const getInterval = (): number => {
    if (o.isMqttConnected()) return o.s.getSyncIntervalWhenConnected()
    return o.s.getSyncInterval()
  }

  const sync = synchronizeFactory(getInterval, isSyncEnabled, () => o.s.getLastMessageId(), o.logger, o.s, o.api)
  sync.on('last-message-id.new', (id) => o.s.setLastMessageId(id))
  sync.on('message.new', (m) => {
    emitter.emit('message.new', m)
  })
  sync.stream().subscribe({
    error: (err) => o.logger('got error when sync', err),
  })

  const syncEvent = synchronizeEventFactory(
    getInterval,
    isSyncEventEnabled,
    () => o.s.getLastEventId(),
    o.logger,
    o.s,
    o.api
  )
  syncEvent.on('last-event-id.new', (id) => o.s.setLastEventId(id))
  syncEvent.on('message.read', (it) => emitter.emit('message.read', it))
  syncEvent.on('message.delivered', (it) => emitter.emit('message.delivered', it))
  syncEvent.on('message.deleted', (it) => emitter.emit('message.deleted', it))
  syncEvent.on('room.cleared', (it) => emitter.emit('room.cleared', it))
  syncEvent.stream().subscribe({
    error: (err) => o.logger('got error when sync event', err),
  })

  return {
    synchronize(messageId: m.IQAccount['lastMessageId']): void {
      sync.synchronize(messageId).catch(noop)
    },
    synchronizeEvent(eventId: m.IQAccount['lastSyncEventId']): void {
      syncEvent.synchronize(eventId).catch(noop)
    },
    onNewMessage(callback: (message: m.IQMessage) => void): () => void {
      emitter.on('message.new', callback)
      return () => emitter.off('message.new', callback)
    },
    onMessageUpdated(callback: (message: m.IQMessage) => void): () => void {
      emitter.on('message.updated', callback)
      return () => emitter.off('message.updated', callback)
    },
    onMessageDelivered(callback: (m: m.IQMessage) => void): () => void {
      emitter.on('message.delivered', callback)
      return () => emitter.off('message.delivered', callback)
    },
    onMessageRead(callback: (m: m.IQMessage) => void): () => void {
      emitter.on('message.read', callback)
      return () => emitter.off('message.read', callback)
    },
    onMessageDeleted(callback: (message: m.IQMessage) => void): () => void {
      emitter.on('message.deleted', callback)
      return () => emitter.off('message.deleted', callback)
    },
    onRoomCleared(callback: (room: m.IQChatRoom) => void): () => void {
      emitter.on('room.cleared', callback)
      return () => emitter.off('room.cleared', callback)
    },
    onSynchronized(callback: () => void): () => void {
      sync.on('synchronized', callback)
      return () => sync.off('synchronized', callback)
    },
    // Raw firehose subscriptions (see `mqtt.ts`'s `onMessage`): fire with the
    // RAW (un-decoded) API shapes for every synchronize/synchronizeEvent
    // response, alongside (not instead of) the decoded events above. This is
    // the seam v2 uses to build its own `Comment` without re-decoding.
    onRawMessages(callback: (data: { lastMessageId: m.IQAccount['lastMessageId']; comments: any[] }) => void): () => void {
      sync.on('raw-sync', callback)
      return () => sync.off('raw-sync', callback)
    },
    onRawEvents(
      callback: (data: { lastId: any; delivered: any[]; read: any[]; deleted: any[]; cleared: any[] }) => void
    ): () => void {
      syncEvent.on('raw-sync-event', callback)
      return () => syncEvent.off('raw-sync-event', callback)
    },
  }
}
