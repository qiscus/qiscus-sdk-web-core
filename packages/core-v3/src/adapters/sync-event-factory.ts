import flatten from 'lodash.flatten'
import { classifySyncEvents } from './sync-parser'
import { EventEmitter } from 'pietile-eventemitter'
import xs from 'xstream'
import * as Api from '../api'
import * as Decoder from '../v3/decoder'
import * as m from '../v3/model'
import * as Provider from '../provider'
import type { Storage } from '../storage'
import { IntervalProducer, tap } from '../utils/stream'

interface SynchronizeEventData {
  'last-event-id.new': (lastId: m.IQAccount['lastSyncEventId']) => void
  'message.delivered': (message: m.IQMessage) => void
  'message.deleted': (message: m.IQMessage) => void
  'message.read': (message: m.IQMessage) => void
  'message.received': (message: m.IQMessage) => void
  'room.cleared': (room: m.IQChatRoom) => void
  // Raw firehose (see `mqtt.ts`'s `onMessage` / `sync-factory.ts`'s `raw-sync`):
  // the RAW (un-decoded) event buckets from `classifySyncEvents`, emitted
  // alongside the decoded events above.
  'raw-sync-event': (data: { lastId: any; delivered: any[]; read: any[]; deleted: any[]; cleared: any[] }) => void
}

export function synchronizeEventFactory(
  getInterval: () => number,
  getEnableSync: () => boolean,
  getId: () => m.IQAccount['lastSyncEventId'],
  logger: (...args: string[]) => void,
  s: Storage,
  api: Api.ApiRequester
) {
  const emitter = new EventEmitter<SynchronizeEventData>()
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
        // Single source (Phase 4 step 5): classify the sync_event batch via the
        // shared classifySyncEvents (which accepts both 'delete_message' and
        // 'deleted_message' — this factory previously matched only the latter,
        // so it missed deletes when the backend sent the former). This factory
        // then applies v3's own Decoder + fan-out to the raw payload.data
        // buckets.
        const c = classifySyncEvents<string>(resp.events as any)
        const lastId: string = c.lastId ?? '0'

        //region Delivered
        const messageDelivered = (c.messageDelivered as SyncEventResponse.DataMessageDelivered[]).map((it) =>
          Decoder.message({
            id: it.comment_id,
            unique_temp_id: it.comment_unique_id,
            email: it.email,
            room_id: it.room_id,
          } as any)
        )
        //endregion
        //region Read
        const messageRead = (c.messageRead as SyncEventResponse.DataMessageDelivered[]).map((it) =>
          Decoder.message({
            id: it.comment_id,
            unique_temp_id: it.comment_unique_id,
            email: it.email,
            room_id: it.room_id,
          } as any)
        )
        //endregion
        //region Deleted
        const messageDeleted = (c.messageDeleted as SyncEventResponse.DataMessageDeleted[]).map((p1) => {
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
        const roomCleared = (c.roomCleared as SyncEventResponse.DataRoomCleared[]).map((p1) =>
          p1.deleted_rooms.map((r: any) => Decoder.room(r))
        )
        //endregion
        return {
          lastId,
          messageDelivered,
          messageRead,
          messageDeleted,
          roomCleared,
          interval: getInterval(),
          rawBuckets: {
            messageDelivered: c.messageDelivered,
            messageRead: c.messageRead,
            messageDeleted: c.messageDeleted,
            roomCleared: c.roomCleared,
          },
        }
      })
  }

  async function processResult(result: ReturnType<typeof synchronize>) {
    let res = await result
    const lastId = res.lastId

    emitter.emit('last-event-id.new', lastId)
    res.messageDelivered.forEach((it) => emitter.emit('message.delivered', it))
    res.messageDeleted.forEach((it) => it.forEach((m) => emitter.emit('message.deleted', m)))
    res.messageRead.forEach((it) => emitter.emit('message.read', it))
    res.roomCleared.forEach((it) => it.forEach((room) => emitter.emit('room.cleared', room)))
    // Raw firehose, emitted after the decoded emits above.
    emitter.emit('raw-sync-event', {
      lastId: res.lastId,
      delivered: res.rawBuckets.messageDelivered,
      read: res.rawBuckets.messageRead,
      deleted: res.rawBuckets.messageDeleted,
      cleared: res.rawBuckets.roomCleared,
    })

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
    stream() {
      return xs
        .create(new IntervalProducer(s.getAccSyncInterval, getInterval))
        .map((_) => getId())
        .filter((_) => getEnableSync())
        .map((id) => xs.from(synchronize(id)))
        .flatten()
        .compose(tap((v) => logger(`synchronize event returned id: ${v.lastId}`)))
        .map((v) => xs.from(processResult(Promise.resolve(v))))
        .flatten()
    },
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
