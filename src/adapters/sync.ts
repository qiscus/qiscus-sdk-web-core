import { Derivable } from 'derivable'
import flatten from 'lodash.flatten'
import QUrlBuilder from '../utils/url-builder'
import { EventEmitter } from 'pietile-eventemitter'
import { IQMessage, IQMessageAdapter, IQRoom, IQRoomAdapter } from '../defs'
import { IQHttpAdapter } from './http'
import { JsonMessage, QMessage } from './message'

type CallbackMessageDelivery = (
  roomId: number,
  userId: string,
  messageId: number,
  messageUniqueId: string
) => void;
export interface IQSyncAdapter {
  synchronize(lastMessageId?: number): void;
  synchronizeEvent(lastEventId?: number): void;
  onNewMessage(callback: (message: IQMessage) => void): () => void;
  onMessageRead(callback: CallbackMessageDelivery): () => void;
  onMessageDelivered(callback: CallbackMessageDelivery): () => void;
  onMessageDeleted(callback: (message: IQMessage) => void): () => void;
  onRoomCleared(callback: (message: IQRoom) => void): () => void;
}

export interface IQSyncEvent {
  'room.cleared': (room: SyncEventResponse.DataRoomCleared) => void
  'message.new': (message: IQMessage) => void
  'message.delivered': (data: SyncEventResponse.DataMessageDelivered) => void
  'message.deleted': (message: SyncEventResponse.DataMessageDeleted) => void
  'message.read': (message: SyncEventResponse.DataMessageDelivered) => void
  'last-message-id': (id: number) => void
  'last-event-id': (id: number) => void
}

export default function getSyncAdapter(
  http: Derivable<IQHttpAdapter>,
  messageAdapter: Derivable<IQMessageAdapter>,
  roomAdapter: Derivable<IQRoomAdapter>,
  token: Derivable<string>
): IQSyncAdapter {
  const emitter = new EventEmitter<IQSyncEvent>();
  let lastMessageId = 0;
  let lastEventId = 0;

  return {
    synchronize(messageId: number): void {
      messageId = messageId || lastMessageId;
      const url = QUrlBuilder('sync')
        .param('token', token.get())
        .param('last_received_comment_id', messageId)
        .build();
      http
        .get()
        .get<SyncResponse.RootObject>(url)
        .then(
          resp => {
            const results = resp.results;
            const messages = results.comments;
            lastMessageId = results.meta.last_received_comment_id;
            emitter.emit('last-message-id', lastMessageId);
            messages
              .map(
                it =>
                  ({ ...it, status: 'read', user_id: it.email } as JsonMessage)
              )
              .map(it => QMessage.fromJson(it))
              .forEach(it => emitter.emit('message.new', it));
          },
          error => {
            console.log('SyncAdapter:', 'error when synchronize', error);
          }
        );
    },
    synchronizeEvent(eventId: number): void {
      eventId = eventId || lastEventId;
      const url = QUrlBuilder('sync_event')
        .param('token', token.get())
        .param('start_event_id', eventId)
        .build();

      http
        .get()
        .get<SyncEventResponse.RootObject>(url)
        .then(resp => {
          const events = resp.events;
          const lastId = events
            .map(it => it.id)
            .slice()
            .sort((a, b) => a - b)
            .pop();
          if (lastId != null) {
            lastEventId = lastId;
            emitter.emit('last-event-id', lastEventId);
          }
          for (let event of events) {
            if (event.action_topic === 'delivered') {
              emitter.emit('message.delivered', event.payload
                .data as SyncEventResponse.DataMessageDelivered);
            }
            if (event.action_topic === 'read') {
              emitter.emit('message.read', event.payload
                .data as SyncEventResponse.DataMessageDelivered);
            }
            if (event.action_topic === 'deleted_message') {
              emitter.emit('message.deleted', event.payload
                .data as SyncEventResponse.DataMessageDeleted);
            }
            if (event.action_topic === 'clear_room') {
              emitter.emit('room.cleared', event.payload
                .data as SyncEventResponse.DataRoomCleared);
            }
          }
        });
    },
    onNewMessage(callback: (message: IQMessage) => void): () => void {
      emitter.on('message.new', callback);
      return () => emitter.off('message.new', callback);
    },
    onMessageDelivered(
      callback: (
        roomId: number,
        userId: string,
        messageId: number,
        messageUniqueId: string
      ) => void
    ): () => void {
      const handler = (data: SyncEventResponse.DataMessageDelivered) => {
        callback(
          data.room_id,
          data.email,
          data.comment_id,
          data.comment_unique_id
        );
      };
      emitter.on('message.delivered', handler);
      return () => emitter.off('message.delivered', handler);
    },
    onMessageRead(
      callback: (
        roomId: number,
        userId: string,
        messageId: number,
        messageUniqueId: string
      ) => void
    ): () => void {
      const handler = (data: SyncEventResponse.DataMessageDelivered) => {
        callback(
          data.room_id,
          data.email,
          data.comment_id,
          data.comment_unique_id
        );
      };
      emitter.on('message.read', handler);
      return () => emitter.off('message.read', handler);
    },
    onMessageDeleted(callback: (message: IQMessage) => void): () => void {
      const adapter = messageAdapter.get();
      const messages = adapter.messages.get();
      const handler = (data: SyncEventResponse.DataMessageDeleted) => {
        let msgs = data.deleted_messages.map(it =>
          it.message_unique_ids.map(id => messages[id])
        );
        (flatten(msgs) as IQMessage[]).forEach(message => callback(message));
      };
      emitter.on('message.deleted', handler);
      return () => emitter.off('message.deleted', handler);
    },
    onRoomCleared(callback: (message: IQRoom) => void): () => void {
      const adapter = roomAdapter.get();
      const rooms = adapter.rooms.get();
      const handler = (data: SyncEventResponse.DataRoomCleared) => {
        data.deleted_rooms
          .map(room => rooms[room.id])
          .forEach(room => callback(room));
      };
      emitter.on('room.cleared', handler);
      return () => emitter.off('room.cleared', handler);
    }
  };
}

// Response type
declare module SyncResponse {
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
