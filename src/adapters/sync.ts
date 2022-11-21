import flatten from 'lodash.flatten'
import { EventEmitter } from 'pietile-eventemitter'
import * as Api from '../api'
import * as m from '../model'
import * as Decoder from '../decoder'
import * as Provider from '../provider'
import { Storage } from '../storage'

const noop = () => {}
const sleep = (period: number) => new Promise((res) => setTimeout(res, period))

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
  shouldSync: () => boolean
  logger: (...args: string[]) => void
}) {
  const emitter = new EventEmitter<IQSyncEvent>()
  const enableSync = (): boolean => {
    let isAuthenticated = o.s.getCurrentUser() != null
    let isNotForceDisabled = o.s.getForceDisableSync() !== true

    o.logger(`enableSync --> isNotForceDisabled(${isNotForceDisabled})`)
    o.logger(`enableSync --> isAuthenticated(${isAuthenticated})`)

    return isAuthenticated && isNotForceDisabled
  }

  const getInterval = (): number => {
    if (o.shouldSync()) return o.s.getSyncInterval()
    return o.s.getSyncIntervalWhenConnected()
  }

  const sync = synchronizeFactory(getInterval, enableSync, () => o.s.getLastMessageId(), o.logger, o.s, o.api)
  sync.on('last-message-id.new', (id) => o.s.setLastMessageId(id))
  sync.on('message.new', (m) => {
    emitter.emit('message.new', m)
  })
  sync.run().catch((err) => o.logger('got error when sync', err))

  const syncEvent = synchronizeEventFactory(getInterval, enableSync, () => o.s.getLastEventId(), o.logger, o.s, o.api)
  syncEvent.on('last-event-id.new', (id) => o.s.setLastEventId(id))
  syncEvent.on('message.read', (it) => emitter.emit('message.read', it))
  syncEvent.on('message.delivered', (it) => emitter.emit('message.delivered', it))
  syncEvent.on('message.deleted', (it) => emitter.emit('message.deleted', it))
  syncEvent.on('room.cleared', (it) => emitter.emit('room.cleared', it))
  syncEvent.run().catch((err) => o.logger('got error when sync event', err))

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
  }
}

const synchronizeFactory = (
  getInterval: () => number,
  getEnableSync: () => boolean,
  getId: () => m.IQAccount['lastMessageId'],
  // @ts-ignore
  logger: (...arg: string[]) => void,
  s: Storage,
  api: Api.ApiRequester
) => {
  interface Event {
    'last-message-id.new': (messageId: m.IQAccount['lastMessageId']) => void
    'message.new': (message: m.IQMessage) => void
    synchronized: () => void
  }

  const emitter = new EventEmitter<Event>()
  const synchronize = (
    messageId: m.IQAccount['lastMessageId']
  ): Promise<{
    lastMessageId: m.IQAccount['lastMessageId']
    messages: m.IQMessage[]
    interval: number
  }> => {
    return api
      .request<SyncResponse.RootObject>(
        Api.synchronize({
          ...Provider.withBaseUrl(s),
          ...Provider.withCredentials(s),
          lastMessageId: messageId,
          limit: 20,
        })
      )
      .then((resp) => {
        const messages = resp.results.comments.map((it) =>
          Decoder.message({
            ...it,
            room_type: it.chat_type,
          })
        )
        const lastMessageId = resp.results.meta.last_received_comment_id ?? 0
        return { lastMessageId, messages, interval: getInterval() }
      })
  }

  // @ts-ignore
  async function* generator() {
    const interval = s.getAccSyncInterval()
    let accumulator = 0

    while (true) {
      accumulator += interval

      if (accumulator >= getInterval() && getEnableSync()) {
        let lastId = getId()
        yield synchronize(lastId)
        logger(`syncrhonize(lastId: ${lastId})`)

        accumulator = 0
      }
      await sleep(interval)
    }
  }

  async function processResult(result: ReturnType<typeof synchronize>) {
    let res = await result
    const messageId = res.lastMessageId
    const messages = res.messages
    // if (messageId > getId()) {
    emitter.emit('last-message-id.new', messageId)
    messages
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      .forEach((m) => {
        emitter.emit('message.new', m)
      })
    // }

    return result
  }

  return {
    get synchronize(): typeof synchronize {
      return (eventId) => processResult(synchronize(eventId))
    },
    get on() {
      return emitter.on.bind(emitter)
    },
    get off() {
      return emitter.off.bind(emitter)
    },
    async run() {
      let gen = generator()

      // noinspection InfiniteLoopJS
      while (true) {
        let val = await gen.next()
        emitter.emit('synchronized')

        if (val.done == null || val.done === false) {
          try {
            logger('synchronize id:', String(val.value.lastMessageId))
            await processResult(Promise.resolve(val.value))
          } catch (e) {
            logger('error when sync', (e as Error).message)
          }
        }
      }
    },
  }
}

const synchronizeEventFactory = (
  getInterval: () => number,
  getEnableSync: () => boolean,
  getId: () => m.IQAccount['lastSyncEventId'],
  logger: (...args: string[]) => void,
  s: Storage,
  api: Api.ApiRequester
) => {
  interface Event {
    'last-event-id.new': (lastId: m.IQAccount['lastSyncEventId']) => void
    'message.delivered': (message: m.IQMessage) => void
    'message.deleted': (message: m.IQMessage) => void
    'message.read': (message: m.IQMessage) => void
    'message.received': (message: m.IQMessage) => void
    'room.cleared': (room: m.IQChatRoom) => void
  }

  const emitter = new EventEmitter<Event>()
  // const emitter = new EventEmitter()
  const synchronize = (eventId: m.IQAccount['lastSyncEventId']) => {
    return api
      .request<SyncEventResponse.RootObject>(
        Api.synchronizeEvent({
          ...Provider.withBaseUrl(s),
          ...Provider.withCredentials(s),
          lastEventId: eventId,
        })
      )
      .then((resp) => {
        const events = resp.events
        const lastId: string =
          events
            .map((it) => it.id)
            .sort((a, b) => a - b)
            .pop() ?? '0'

        //region Delivered
        const messageDelivered = events
          .filter((it) => it.action_topic === 'delivered')
          .map((it) => it.payload.data as SyncEventResponse.DataMessageDelivered)
          .map((it) =>
            Decoder.message({
              id: it.comment_id,
              unique_temp_id: it.comment_unique_id,
              email: it.email,
              room_id: it.room_id,
            } as any)
          )
        //endregion
        //region Read
        const messageRead = events
          .filter((it) => it.action_topic === 'read')
          .map((it) => it.payload.data as SyncEventResponse.DataMessageDelivered)
          .map((it) =>
            Decoder.message({
              id: it.comment_id,
              unique_temp_id: it.comment_unique_id,
              email: it.email,
              room_id: it.room_id,
            } as any)
          )
        //endregion
        //region Deleted
        // const messageDeleted = events
        //   .filter(it => it.action_topic === 'deleted_message')
        //   .map(it => it.payload.data as SyncEventResponse.DataMessageDeleted)
        //   .map(p1 => p1.deleted_messages.map(
        //     p2 => p2.message_unique_ids.map(uniqueId => Decoder.message({
        //       unique_temp_id: uniqueId,
        //       room_id: parseInt(p2.room_id),
        //     } as any))))
        //   .map(it => flatten(it))
        const messageDeleted = events
          .filter((it) => it.action_topic === 'deleted_message')
          .map((it) => it.payload.data as SyncEventResponse.DataMessageDeleted)
          .map((p1) => {
            const msgs = p1.deleted_messages.map((it) =>
              it.message_unique_ids.map((id) =>
                Decoder.message({
                  unique_temp_id: id,
                  room_id: parseInt(it.room_id),
                } as any)
              )
            )
            return flatten(msgs)
          })
        //endregion
        //region Room Cleared
        const roomCleared = events
          .filter((it) => it.action_topic === 'clear_room')
          .map((it) => it.payload.data as SyncEventResponse.DataRoomCleared)
          .map((p1) => p1.deleted_rooms.map((r: any) => Decoder.room(r)))
        //endregion

        return {
          lastId,
          messageDelivered,
          messageRead,
          messageDeleted,
          roomCleared,
          interval: getInterval(),
        }
      })
  }

  async function* generator() {
    const interval = s.getAccSyncInterval()
    let accumulator = 0

    while (true) {
      accumulator += interval
      logger(`interval(${getInterval()}) getEnableSync(${getEnableSync()})`)
      if (accumulator >= getInterval() && getEnableSync()) {
        let lastId = getId()
        yield synchronize(lastId)
        logger(`synchronizeEvent(lastId: ${lastId})`)
        accumulator = 0
      }
      await sleep(interval)
    }
  }

  async function processResult(result: ReturnType<typeof synchronize>) {
    let res = await result
    const lastId = res.lastId

    emitter.emit('last-event-id.new', lastId)
    res.messageDelivered.forEach((it) => emitter.emit('message.delivered', it))
    res.messageDeleted.forEach((it) => it.forEach((m) => emitter.emit('message.deleted', m)))
    res.messageRead.forEach((it) => emitter.emit('message.read', it))
    res.roomCleared.forEach((it) => it.forEach((room) => emitter.emit('room.cleared', room)))

    return result
  }

  return {
    get synchronize(): typeof synchronize {
      return (eventId) => processResult(synchronize(eventId))
    },
    get on() {
      return emitter.on.bind(emitter)
    },
    get off() {
      return emitter.off.bind(emitter)
    },
    async run() {
      let gen = generator()

      // noinspection InfiniteLoopJS
      while (true) {
        let val = await gen.next()

        if (val.done == null || val.done === false) {
          try {
            logger('synchronize event id:', String(val.value.lastId))
            await processResult(Promise.resolve(val.value))
          } catch (e) {
            logger('error when sync', (e as Error).message)
          }
        }
      }
    },
  }
}

// region Response type
export declare module SyncResponse {
  export interface Extras {}

  export interface Payload {}

  export interface Avatar {
    url: string
  }

  export interface UserAvatar {
    avatar: Avatar
  }

  export interface Comment {
    chat_type: string
    comment_before_id: number
    comment_before_id_str: string
    disable_link_preview: boolean
    email: string
    extras: Extras
    id: number
    id_str: string
    is_deleted: boolean
    is_public_channel: boolean
    message: string
    payload: Payload
    room_avatar: string
    room_id: number
    room_id_str: string
    room_name: string
    status: string
    timestamp: string
    topic_id: number
    topic_id_str: string
    type: string
    unique_temp_id: string
    unix_nano_timestamp: number
    unix_timestamp: number
    user_avatar: UserAvatar
    user_avatar_url: string
    user_id: number
    user_id_str: string
    username: string
  }

  export interface Meta {
    last_received_comment_id: number
    need_clear: boolean
  }

  export interface Results {
    comments: Comment[]
    meta: Meta
  }

  export interface RootObject {
    results: Results
    status: number
  }
}

export declare module _SyncResponse {
  export interface Meta {
    last_received_comment_id: number
    need_clear: boolean
  }

  export interface Payload {}

  export interface Avatar {
    url: string
  }

  export interface UserAvatar {
    avatar: Avatar
  }

  export interface Comment {
    id: number
    topic_id: number
    room_id: number
    room_name: string
    comment_before_id: number
    message: string
    type: string
    payload: Payload
    extras?: any
    disable_link_preview: boolean
    email: string
    username: string
    user_avatar: UserAvatar
    user_avatar_url: string
    timestamp: Date
    unix_timestamp: number
    unique_temp_id: string
  }

  export interface Results {
    meta: Meta
    comments: Comment[]
  }

  export interface RootObject {
    status: number
    results: Results
  }
}
export declare module SyncEventResponse {
  export interface Actor {
    id: string
    email: string
    name: string
  }

  export interface DeletedMessage {
    message_unique_ids: string[]
    room_id: string
  }

  export interface DeletedRoom {
    avatar_url: string
    chat_type: string
    id: number
    id_str: string
    last_comment: any
    options: object
    raw_room_name: string
    room_name: string
    unique_id: string
    unread_count: number
  }

  export interface DataMessageDeleted {
    deleted_messages: DeletedMessage[]
    is_hard_delete: boolean
  }

  export interface DataRoomCleared {
    deleted_rooms: DeletedRoom[]
  }

  export interface DataMessageDelivered {
    comment_id: number
    comment_unique_id: string
    email: string
    room_id: number
  }

  export interface Payload {
    actor: Actor
    data: DataMessageDeleted | DataMessageDelivered | DataRoomCleared
  }

  export interface Event {
    id: any
    timestamp: any
    action_topic: 'read' | 'delivered' | 'clear_room' | 'deleted_message'
    payload: Payload
  }

  export interface RootObject {
    events: Event[]
    is_start_event_id_found: boolean
  }
}
// endregion
