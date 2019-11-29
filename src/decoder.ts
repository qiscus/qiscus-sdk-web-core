import { IQAccount, IQMessage } from "./model";
import {SyncResponse} from './adapters/sync'

export const loginOrRegister = <T extends Record<string, any>>(
  json: T
): IQAccount => ({
  id: json.email,
  avatarUrl: json.avatar_url,
  extras: json.extras as Record<string, any>,
  name: json.username,
  lastMessageId: json.last_comment_id,
  lastSyncEventId: String(json.last_sync_event_id)
});

export const synchronize = <T extends SyncResponse.Comment>(json: T): IQMessage => ({
  chatRoomId: json.room_id,
  id: json.id,
  previousMessageId: json.comment_before_id,
  // FIXME: make it IQUser object instead of null
  sender: null,
  status: 'read',
  text: json.message,
  timestamp: json.timestamp,
  type: json.type as IQMessage['type'],
  uniqueId: json.unique_temp_id,
  extras: json.extras as IQMessage['extras'],
  payload: json.payload as IQMessage['payload'],
})
