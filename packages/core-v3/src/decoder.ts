import { IAppConfig } from './defs'
import { IQAccount, IQChatRoom, IQMessage, IQParticipant, IQUser } from './model'
import { tryCatch } from './utils/try-catch'

export const loginOrRegister = <T extends Record<string, any>>(json: T): IQAccount => ({
  id: json.email,
  avatarUrl: json.avatar_url,
  extras: json.extras as Record<string, any>,
  name: json.username,
  lastMessageId: json.last_comment_id,
  lastSyncEventId: String(json.last_sync_event_id),
})

interface AccountJson {
  avatar_url: string
  email: string
  extras: object
  id: number
  id_str: string
  last_comment_id: number
  last_comment_id_str: string
  last_sync_event_id: number
  pn_android_configured: boolean
  pn_ios_configured: boolean
  rtKey: string
  token: string
  username: string
}

export const account = <T extends AccountJson>(json: T): [IQAccount, AccountJson['token']] => [
  {
    name: json.username,
    avatarUrl: json.avatar_url,
    extras: json.extras as IQAccount['extras'],
    id: json.email,
    lastMessageId: json.last_comment_id,
    lastSyncEventId: String(json.last_sync_event_id),
  },
  json.token,
]

interface UserJson1 {
  email: string
  extras: object | null
  user_avatar_url: string
  user_id: number
  user_id_str: string
  username: string
}

export interface UserJson2 {
  avatar_url: string
  email: string
  extras: object | null
  id: number
  id_str: string
  username: string
}

function isJson1(json: UserJson1 | UserJson2): json is UserJson1 {
  return (json as UserJson1).user_id != null
}

function isJson2(json: UserJson1 | UserJson2): json is UserJson2 {
  return (json as UserJson2).email != null
}

export function user(json: UserJson1): IQUser
export function user(json: UserJson2): IQUser
export function user(json: UserJson1 | UserJson2): IQUser {
  let avatarUrl: string | undefined = undefined
  if (isJson1(json)) avatarUrl = json.user_avatar_url
  if (isJson2(json)) avatarUrl = json.avatar_url
  return {
    id: json.email,
    extras: json.extras as IQUser['extras'],
    name: json.username,
    avatarUrl,
  }
}

interface ParticipantJson {
  avatar_url: string
  email: string
  extras: object
  id: number
  id_str: string
  last_comment_read_id: number
  last_comment_read_id_str: string
  last_comment_received_id: number
  last_comment_received_id_str: string
  username: string
}

export const participant = <T extends ParticipantJson>(json: T): IQParticipant => ({
  lastMessageReceivedId: json.last_comment_received_id,
  lastMessageReadId: json.last_comment_read_id,
  id: json.email,
  extras: json.extras as IQParticipant['extras'],
  avatarUrl: json.avatar_url,
  name: json.username,
})

interface RoomJson {
  avatar_url: string
  chat_type: string
  id: number
  id_str: string
  is_public_channel: boolean
  is_removed: boolean
  last_comment?: MessageJson
  options: string
  raw_room_name: string
  room_name: string
  unique_id: string
  unread_count: number
  participants: ParticipantJson[]
}

const getRoomType = (type: string, isChannel: boolean): IQChatRoom['type'] => {
  if (isChannel && type === 'group') return 'channel'
  return type as IQChatRoom['type']
}
export const room = <T extends RoomJson>(json: T): IQChatRoom => ({
  unreadCount: json.unread_count,
  type: getRoomType(json.chat_type, json.is_public_channel),
  totalParticipants: json.participants?.length ?? 0,
  participants: json.participants?.map(participant) ?? [],
  name: json.room_name,
  extras: tryCatch(() => JSON.parse(json.options), json.options),
  avatarUrl: json.avatar_url,
  uniqueId: json.unique_id,
  lastMessage: json.last_comment ? message(json.last_comment) : undefined,
  id: json.id,
})

export interface MessageJson {
  comment_before_id: number
  comment_before_id_str: string
  disable_link_preview: boolean
  email: string
  extras: object | null
  id: number
  is_deleted?: boolean
  is_public_channel: boolean
  message: string
  payload: object | null
  room_avatar: string
  room_id: number
  room_id_str: string
  room_name: string
  room_type: string
  status: string
  timestamp: string
  topic_id: number
  topic_id_str: string
  type: string
  unique_temp_id: string
  unix_nano_timestamp: number
  unix_timestamp: number
  user_avatar_url: string
  user_id: number
  user_id_str: string
  username: string
}

export const message = <T extends MessageJson>(json: T): IQMessage => ({
  extras: json.extras as IQMessage['extras'],
  payload: json.payload as IQMessage['payload'],
  type: json.type as IQMessage['type'],
  uniqueId: json.unique_temp_id,
  text: json.message,
  chatRoomId: json.room_id,
  id: json.id,
  previousMessageId: json.comment_before_id,
  sender: user(json),
  status: json.status as IQMessage['status'],
  timestamp: new Date(json.unix_nano_timestamp / 1e6),
  // @ts-ignore
  __roomType: json.room_type,
})

interface IAppConfigJson {
  base_url: string
  broker_lb_url: string
  broker_url: string
  enable_event_report: boolean
  enable_realtime: boolean
  enable_realtime_check: boolean
  sync_interval: number
  sync_on_connect: number
  extras: string | Record<string, any>
  enable_sync: boolean | undefined
  enable_sync_event: boolean | undefined
}
export const appConfig = <T extends IAppConfigJson>(json: T): IAppConfig => ({
  baseUrl: json.base_url,
  brokerLbUrl: json.broker_lb_url,
  brokerUrl: json.broker_url,
  enableEventReport: json.enable_event_report,
  enableRealtime: json.enable_realtime,
  enableRealtimeCheck: json.enable_realtime_check,
  extras: tryCatch(() => JSON.parse(json.extras as string), json.extras),
  syncInterval: json.sync_interval,
  syncOnConnect: json.sync_on_connect,
  isSyncEnabled: json.enable_sync,
  isSyncEventEnabled: json.enable_sync_event,
})
