import flatten from 'lodash.flatten'
import { EventEmitter } from 'pietile-eventemitter'
// import { EventEmitter } from 'events'
import * as Api from '../api'
import * as m from '../model'
import * as Decoder from '../decoder'
import * as Provider from '../provider'
import { Storage } from '../storage'

const noop = () => {}
const sleep = (period: number) => new Promise(res => setTimeout(res, period))

export interface IQSyncEvent {
  'room.cleared': (room: m.IQChatRoom) => void
  'message.new': (message: m.IQMessage) => void
  'message.delivered': (data: m.IQMessage) => void
  'message.deleted': (message: m.IQMessage) => void
  'message.read': (message: m.IQMessage) => void
  'last-message-id': (id: m.IQAccount['lastMessageId']) => void
  'last-event-id': (id: m.IQAccount['lastSyncEventId']) => void
}

export type SyncAdapter = ReturnType<typeof getSyncAdapter>
export default function getSyncAdapter (
  o: {
    s: Storage,
    shouldSync: () => boolean,
    logger: (...args: string[]) => void
  },
) {
  const emitter = new EventEmitter<IQSyncEvent>()
  // const emitter = new EventEmitter()
  const shouldSync = (): boolean =>
    o.shouldSync() && o.s.getCurrentUser() != null

  const getInterval = () => {
    if (o.shouldSync()) return o.s.getSyncInterval()
    // return 30000
    return 1000
  }

  const sync = synchronizeFactory(
    getInterval,
    shouldSync,
    () => o.s.getLastMessageId(),
    o.logger,
    o.s,
  )
  sync.on('last-message-id.new', id => o.s.setLastMessageId(id))
  sync.on('message.new', m => emitter.emit('message.new', m))
  sync.run().catch(err => o.logger('got error when sync', err))

  const syncEvent = synchronizeEventFactory(
    getInterval,
    shouldSync,
    () => o.s.getLastEventId(),
    o.logger,
    o.s,
  )
  syncEvent.on('last-event-id.new', id => o.s.setLastEventId(id))
  syncEvent.on('message.read', it => emitter.emit('message.read', it))
  syncEvent.on('message.delivered', it => emitter.emit('message.delivered', it))
  syncEvent.on('message.deleted', it => emitter.emit('message.deleted', it))
  syncEvent.on('room.cleared', it => emitter.emit('room.cleared', it))
  syncEvent.run().catch(err => o.logger('got error when sync event', err))

  return {
    synchronize (messageId: m.IQAccount['lastMessageId']): void {
      sync.synchronize(messageId).catch(noop)
    },
    synchronizeEvent (eventId: m.IQAccount['lastSyncEventId']): void {
      syncEvent.synchronize(eventId).catch(noop)
    },
    onNewMessage (callback: (message: m.IQMessage) => void): () => void {
      emitter.on('message.new', callback)
      return () => emitter.off('message.new', callback)
    },
    onMessageDelivered (callback: (m: m.IQMessage) => void): () => void {
      emitter.on('message.delivered', callback)
      return () => emitter.off('message.delivered', callback)
    },
    onMessageRead (callback: (m: m.IQMessage) => void): () => void {
      emitter.on('message.read', callback)
      return () => emitter.off('message.read', callback)
    },
    onMessageDeleted (callback: (message: m.IQMessage) => void): () => void {
      emitter.on('message.deleted', callback)
      return () => emitter.off('message.deleted', callback)
    },
    onRoomCleared (callback: (room: m.IQChatRoom) => void): () => void {
      emitter.on('room.cleared', callback)
      return () => emitter.off('room.cleared', callback)
    },
  }
}

const synchronizeFactory = (
  getInterval: () => number,
  getEnableSync: () => boolean,
  getId: () => m.IQAccount['lastMessageId'],
  logger: (...arg: string[]) => void,
  s: Storage,
) => {
  interface Event {
    'last-message-id.new': (messageId: m.IQAccount['lastMessageId']) => void
    'message.new': (message: m.IQMessage) => void
  }

  const emitter = new EventEmitter<Event>()
  // const emitter = new EventEmitter()
  const synchronize = (messageId: m.IQAccount['lastMessageId']): Promise<{
    lastMessageId: m.IQAccount['lastMessageId'],
    messages: m.IQMessage[],
    interval: number,
  }> => {
    return Api.request<SyncResponse.RootObject>(Api.synchronize({
      ...Provider.withBaseUrl(s),
      ...Provider.withCredentials(s),
      lastMessageId: messageId,
      limit: 20,
    })).then(resp => {
      const messages = resp.results.comments.map(Decoder.synchronize)
      const lastMessageId = resp.results.meta.last_received_comment_id
      return { lastMessageId, messages, interval: getInterval() }
    })
  }

  async function * generator () {
    const interval = 100
    let accumulator = 0

    while (true) {
      accumulator += interval
      if (accumulator >= getInterval() && getEnableSync()) {
        yield synchronize(getId())
        accumulator = 0
      }
      await sleep(interval)
    }
  }

  return {
    get synchronize () { return synchronize },
    get on () { return emitter.on.bind(emitter) },
    get off () { return emitter.off.bind(emitter) },
    async run () {
      for await (let result of generator()) {
        try {
          const messageId = result.lastMessageId
          const messages = result.messages
          if (messageId > getId()) {
            emitter.emit('last-message-id.new', messageId)
            messages.forEach(m => emitter.emit('message.new', m))
          }
        } catch (e) {
          logger('error when sync', e.message)
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
) => {
  interface Event {
    'last-event-id.new': (lastId: m.IQAccount['lastSyncEventId']) => void,
    'message.delivered': (message: m.IQMessage) => void
    'message.deleted': (message: m.IQMessage) => void
    'message.read': (message: m.IQMessage) => void
    'message.received': (message: m.IQMessage) => void
    'room.cleared': (room: m.IQChatRoom) => void
  }

  const emitter = new EventEmitter<Event>()
  // const emitter = new EventEmitter()
  const synchronize = (eventId: m.IQAccount['lastSyncEventId']) => {
    return Api.request<SyncEventResponse.RootObject>(Api.synchronizeEvent({
      ...Provider.withBaseUrl(s),
      ...Provider.withCredentials(s),
      lastEventId: eventId,
    })).then(resp => {
      const events = resp.events
      const lastId = events
        .map(it => it.id)
        .sort((a, b) => a - b)
        .pop()

      //region Delivered
      const messageDelivered = events.filter(
        it => it.action_topic === 'delivered')
        .map(it => it.payload.data as SyncEventResponse.DataMessageDelivered)
        .map(it => Decoder.message({
          id: it.comment_id,
          unique_temp_id: it.comment_unique_id,
          email: it.email,
          room_id: it.room_id,
        } as any))
      //endregion
      //region Read
      const messageRead = events.filter(it => it.action_topic === 'read')
        .map(it => it.payload.data as SyncEventResponse.DataMessageDelivered)
        .map(it => Decoder.message({
          id: it.comment_id,
          unique_temp_id: it.comment_unique_id,
          email: it.email,
          room_id: it.room_id,
        } as any))
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
        .filter(it => it.action_topic === 'deleted_message')
        .map(it => it.payload.data as SyncEventResponse.DataMessageDeleted)
        .map(p1 => {
          const msgs = p1.deleted_messages.map(it =>
            it.message_unique_ids.map(id => Decoder.message({
              unique_temp_id: id,
              room_id: parseInt(it.room_id),
            } as any)),
          )
          return flatten(msgs)
        })
      //endregion
      //region Room Cleared
      const roomCleared = events.filter(it => it.action_topic === 'clear_room')
        .map(it => it.payload.data as SyncEventResponse.DataRoomCleared)
        .map(p1 => p1.deleted_rooms.map((r: any) => Decoder.room(r)))
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

  async function * generator () {
    const interval = 100
    let accumulator = 0
    while (true) {
      accumulator += interval
      if (accumulator >= getInterval() && getEnableSync()) {
        yield synchronize(getId())
        accumulator = 0
      }
      await sleep(interval)
    }
  }

  return {
    get synchronize () { return synchronize },
    get on () { return emitter.on.bind(emitter) },
    get off () { return emitter.off.bind(emitter) },
    async run () {
      for await (let result of generator()) {
        try {
          const eventId = result.lastId
          if (eventId > getId()) {
            emitter.emit('last-event-id.new', eventId)
            result.messageDelivered.forEach(
              it => emitter.emit('message.delivered', it))
            result.messageDeleted
              .forEach(
                it => it.forEach(m => emitter.emit('message.deleted', m)))
            result.messageRead.forEach(
              it => emitter.emit('message.read', it))
            result.roomCleared.forEach(
              it => it.forEach(room => emitter.emit('room.cleared', room)))
          }
        } catch (e) {
          logger('error when sync event', e.message)
        }
      }
    },
  }
}

// region Response type
export declare module SyncResponse {
  export interface Meta {
    last_received_comment_id: number;
    need_clear: boolean;
  }

  export interface Payload {}

  export interface Avatar {
    url: string;
  }

  export interface UserAvatar {
    avatar: Avatar;
  }

  export interface Comment {
    id: number;
    topic_id: number;
    room_id: number;
    room_name: string;
    comment_before_id: number;
    message: string;
    type: string;
    payload: Payload;
    extras?: any;
    disable_link_preview: boolean;
    email: string;
    username: string;
    user_avatar: UserAvatar;
    user_avatar_url: string;
    timestamp: Date;
    unix_timestamp: number;
    unique_temp_id: string;
  }

  export interface Results {
    meta: Meta;
    comments: Comment[];
  }

  export interface RootObject {
    status: number;
    results: Results;
  }
}
export declare module SyncEventResponse {
  export interface Actor {
    id: string;
    email: string;
    name: string;
  }

  export interface DeletedMessage {
    message_unique_ids: string[];
    room_id: string;
  }

  export interface DeletedRoom {
    avatar_url: string;
    chat_type: string;
    id: number;
    id_str: string;
    last_comment: any;
    options: object;
    raw_room_name: string;
    room_name: string;
    unique_id: string;
    unread_count: number;
  }

  export interface DataMessageDeleted {
    deleted_messages: DeletedMessage[];
    is_hard_delete: boolean;
  }

  export interface DataRoomCleared {
    deleted_rooms: DeletedRoom[];
  }

  export interface DataMessageDelivered {
    comment_id: number;
    comment_unique_id: string;
    email: string;
    room_id: number;
  }

  export interface Payload {
    actor: Actor;
    data: DataMessageDeleted | DataMessageDelivered | DataRoomCleared;
  }

  export interface Event {
    id: any;
    timestamp: any;
    action_topic: 'read' | 'delivered' | 'clear_room' | 'deleted_message';
    payload: Payload;
  }

  export interface RootObject {
    events: Event[];
    is_start_event_id_found: boolean;
  }
}
// endregion
