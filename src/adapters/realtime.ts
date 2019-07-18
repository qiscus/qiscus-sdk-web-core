import * as mitt from 'mitt'
import { interval, observe, pipe } from 'callbag-basics'
import takeWhile from 'callbag-take-while'
import { IQHttpAdapter } from './http'
import { IQUserAdapter } from './user'
import { IQMessage } from './message'
import QUrlBuilder from '../utils/url-builder'
import { IQRoom } from './room'

interface IQSyncAdapter {
  synchronize (lastMessageId?: number): void
  synchronizeEvent (lastEventId?: number): void
  onNewMessage (callback: (message: IQMessage) => void): () => void
  onMessageRead (callback: (message: IQMessage) => void): () => void
  onMessageDelivered (callback: (message: IQMessage) => void): () => void
  onMessageDeleted (callback: (message: IQMessage) => void): () => void
  onRoomCleared (callback: (message: IQRoom) => void): () => void
}

function getSyncAdapter ({ http, user }: {
  http: () => IQHttpAdapter,
  user: () => IQUserAdapter
}): IQSyncAdapter {
  const emitter = new mitt()
  let lastMessageId = 0
  let lastEventId = 0

  return {
    synchronize (messageId: number): void {
      messageId = messageId || lastMessageId
      const url = QUrlBuilder('/sync')
        .param('token', user().token)
        .param('last_received_comment_id', messageId)
        .build()
      http()
        .get<SyncResponse.RootObject>(url)
        .then((resp) => {
          const results = resp.results
          const messages = results.comments
          lastMessageId = results.meta.last_received_comment_id
          emitter.emit('last-message-id', lastMessageId)
          messages.forEach((message) => {
            emitter.emit('message.new', message)
          })
        }, (error) => {
          console.log('SyncAdapter:', 'error when synchronize', error)
        })
    },
    synchronizeEvent (eventId: number): void {
      eventId = eventId || lastEventId
      const url = QUrlBuilder('/sync_event')
        .param('token', user().token)
        .param('start_event_id', eventId)
        .build()

      http()
        .get<SyncEventResponse.RootObject>(url)
        .then((resp) => {
          const events = resp.events
          const lastId = events.map(it => it.id)
            .slice()
            .sort((a, b) => a - b)
            .pop()
          if (lastId != null) {
            lastEventId = lastId
            emitter.emit('last-event-id', lastEventId)
          }
          for (let event of events) {
            if (event.action_topic === 'delivered') {
              emitter.emit('message.delivered', event.payload.data)
            }
            if (event.action_topic === 'read') {
              emitter.emit('message.read', event.payload.data)
            }
            if (event.action_topic === 'delete_message') {
              emitter.emit('message.deleted', event.payload.data)
            }
            if (event.action_topic === 'clear_room') {
              emitter.emit('room.cleared', event.payload.data)
            }
          }
        })
    },
    onNewMessage (callback: (message: IQMessage) => void): () => void {
      emitter.on('message.new', callback)
      return () => emitter.off('message.new', callback)
    },
    onMessageDelivered (callback: (message: IQMessage) => void): () => void {
      emitter.on('message.delivered', callback)
      return () => emitter.off('message.delivered', callback)
    },
    onMessageRead (callback: (message: IQMessage) => void): () => void {
      emitter.on('message.read', callback)
      return () => emitter.off('message.read', callback)
    },
    onMessageDeleted (callback: (message: IQMessage) => void): () => void {
      emitter.on('message.deleted', callback)
      return () => emitter.off('message.deleted', callback)
    },
    onRoomCleared (callback: (message: IQRoom) => void): () => void {
      emitter.on('room.cleared', callback)
      return () => emitter.off('room.cleared', callback)
    }
  }
}

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

// Response type
declare module SyncResponse {

  export interface Meta {
    last_received_comment_id: number;
    need_clear: boolean;
  }

  export interface Payload {
  }

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
declare module SyncEventResponse {

  export interface Actor {
    id: string;
    email: string;
    name: string;
  }

  export interface DeletedMessage {
    message_unique_ids: string[];
    room_id: string;
  }

  export interface Data {
    deleted_messages: DeletedMessage[];
    is_hard_delete: boolean;
  }

  export interface Payload {
    actor: Actor;
    data: Data;
  }

  export interface Event {
    id: any;
    timestamp: any;
    action_topic: string;
    payload: Payload;
  }

  export interface RootObject {
    events: Event[];
    is_start_event_id_found: boolean;
  }

}
