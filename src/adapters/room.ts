import { IQUser, IQUserAdapter } from './user'
import { IQHttpAdapter } from './http'
import QUrlBuilder from '../utils/url-builder'

export enum IQRoomType {
  Group = 'group',
  Single = 'single'
}

export interface IQRoom {
  id: number
  name: string
  avatarUrl: string;
  isChannel: boolean;
  lastMessageId?: number;
  lastMessageContent?: string;
  uniqueId: string;
  unreadCount: number;
  type: IQRoomType;
  totalParticipants?: number;
  participants?: IQParticipant[]
  options?: string
}

export interface IQParticipant extends IQUser {
  lastReadMessageId: number
  lastReceivedMessageId: number
}

type GetChannelExtraProps = {
  name: string,
  avatarUrl: string,
  options: object
}
export interface IQRoomAdapter {
  chatUser (userId: string): Promise<IQRoom>
  getRoomList (withParticipant?: boolean, page?: number, limit?: number): Promise<IQRoom[]>
  getRoom (roomId: number): Promise<IQRoom>
  getChannel (uniqueId: string, extra: GetChannelExtraProps): Promise<IQRoom>
  updateRoom (roomId: number, room: IQRoom): Promise<IQRoom>
  getParticipantList (roomId: number, page?: number, limit?: number): Promise<IQParticipant[]>
  createGroup (name: string, initialParticipantIds: string[]): Promise<IQRoom>
  removeParticipants (roomId: string, participantIds: string[]): Promise<string[]>
  addParticipants (roomId: number, participantIds: string[]): Promise<IQUser[]>
  getRoomInfo (roomIds: number[]): Promise<IQRoom[]>
  clearRoom (roomUniqueIds: number[]): Promise<IQRoom[]>
  getUnreadCount (): Promise<number>
  readonly rooms: Map<number, IQRoom>
}

export class QParticipant implements IQParticipant {
  id: number
  avatarUrl: string
  displayName: string
  lastReadMessageId: number
  lastReceivedMessageId: number
  userId: string

  updateFromJson(json: GetParticipantResponse.Participant): IQParticipant {
    this.id = json.id
    this.avatarUrl = json.avatar_url
    this.displayName = json.username
    this.lastReadMessageId = json.last_comment_read_id
    this.lastReceivedMessageId = json.last_comment_received_id
    this.userId = json.email
    return this
  }

  static fromJson (json: GetParticipantResponse.Participant): IQParticipant {
    return new QParticipant().updateFromJson(json)
  }
}

export class QRoom implements IQRoom {
  avatarUrl: string
  isChannel: boolean
  lastMessageContent?: string
  lastMessageId?: number
  type: IQRoomType
  uniqueId: string
  unreadCount: number
  id: number
  name: string
  totalParticipants?: number
  participants?: IQParticipant[]
  options?: string

  updateFromJson(json: ChatUserResponse.Room): IQRoom {
    this.avatarUrl = json.avatar_url
    this.isChannel = json.is_public_channel
    this.id = json.id
    this.lastMessageContent = json.last_comment_message
    this.lastMessageId = json.last_comment_id
    this.name = json.room_name
    this.uniqueId = json.unique_id
    this.unreadCount = json.unread_count
    if (json.participants != null) {
      this.participants = json.participants.map((it: any) => QParticipant.fromJson(it))
    }
    if (json.room_total_participants != null) {
      this.totalParticipants = json.room_total_participants
    }
    if (json.options != null) this.options = json.options
    if (json.chat_type === 'single') this.type = IQRoomType.Single
    if (json.chat_type === 'group') this.type = IQRoomType.Group

    return this
  }
  static fromJson (json: ChatUserResponse.Room): IQRoom {
    return new QRoom().updateFromJson(json)
  }
}

export default function getRoomAdapter (
  http: () => IQHttpAdapter,
  user: () => IQUserAdapter
): IQRoomAdapter {
  const roomStorage = new Map<number, IQRoom>()
  return {
    get rooms() { return roomStorage },
    addParticipants (roomId: number, participantIds: string[]): Promise<IQUser[]> {
      return http().post<AddParticipantsResponse.RootObject>('add_room_participants', {
        token: user().token,
        room_id: roomId,
        emails: participantIds
      }).then<IQParticipant[]>((resp) => {
        return resp.results.participants_added.map((it) => QParticipant.fromJson(it))
      })
    },
    chatUser (userId: string): Promise<IQRoom> {
      return http().post<ChatUserResponse.RootObject>('get_or_create_room_with_target', {
        token: user().token,
        emails: [userId]
      }).then<IQRoom>((resp) => {
        return QRoom.fromJson(resp.results.room)
      })
    },
    clearRoom (roomUniqueIds: number[]): Promise<IQRoom[]> {
      const url = QUrlBuilder('clear_room_messages')
        .param('token', user().token)
        .param('room_channel_ids', roomUniqueIds)
        .build()
      return http().delete<ClearRoomResponse.RootObject>(url)
        .then<IQRoom[]>((resp) => {
          return resp.results.rooms.map((room: any) => QRoom.fromJson(room))
        })
    },
    createGroup (name: string, initialParticipantIds: string[]): Promise<IQRoom> {
      return http().post<CreateRoomResponse.RootObject>('create_room', {
        token: user().token,
        participants: initialParticipantIds
      }).then<IQRoom>((resp) => {
        return QRoom.fromJson(resp.results.room)
      })
    },
    getChannel (uniqueId: string, extra: GetChannelExtraProps): Promise<IQRoom> {
      return http().post<GetChannelResponse.RootObject>('get_or_create_room_with_unique_id', {
        token: user().token,
        unique_id: uniqueId,
        name: extra.name,
        avatar_url: extra.avatarUrl,
        options: extra.options
      }).then<IQRoom>((resp) => {
        return QRoom.fromJson(resp.results.room)
      })
    },
    getParticipantList (roomId: number, page?: number, limit?: number): Promise<IQParticipant[]> {
      const url = QUrlBuilder('room_participants')
        .param('token', user().token)
        .param('room_unique_id', roomId)
        .build()
      return http().get<GetParticipantResponse.RootObject>(url)
        .then<IQParticipant[]>((resp) => {
          return resp.results.participants.map((participant) => QParticipant.fromJson(participant))
        })
    },
    getRoom (roomId: number): Promise<IQRoom> {
      const url = QUrlBuilder('get_room_by_id')
        .param('token', user().token)
        .param('id', roomId)
        .build()
      return http().get<GetRoomResponse.RootObject>(url)
        .then<IQRoom>((resp) => {
          return QRoom.fromJson(resp.results.room)
        })
    },
    getRoomInfo (roomIds: number[], withParticipant: boolean = false): Promise<IQRoom[]> {
      return http().post<GetRoomInfoResponse.RootObject>('rooms_info', {
        token: user().token,
        room_id: roomIds,
        show_participants: withParticipant
      }).then<IQRoom[]>((resp) => {
        return resp.results.rooms_info.map((it: any) => {
          return QRoom.fromJson(it)
        })
      })
    },
    getRoomList (withParticipant: boolean = false, page: number = 1, limit: number = 20): Promise<IQRoom[]> {
      const url = QUrlBuilder('user_rooms')
        .param('token', user().token)
        .param('page', page)
        .param('limit', limit)
        .build()
      return http().get<GetRoomListResponse.RootObject>(url)
        .then<IQRoom[]>((resp) => {
          return resp.results.rooms_info.map((it: any) => {
            return QRoom.fromJson(it)
          })
        })
    },
    getUnreadCount (): Promise<number> {
      const url = QUrlBuilder('total_unread_count')
        .param('token', user().token)
        .build()
      return http().get<GetUnreadResponse.RootObject>(url)
        .then<number>((resp) => {
          return resp.results.total_unread_count
        })
    },
    removeParticipants (roomId: string, participantIds: string[]): Promise<string[]> {
      return http().post<RemoveParticipantResponse.RootObject>('remove_room_participants', {
        token: user().token,
        room_id: roomId,
        emails: participantIds
      }).then<string[]>((resp) => {
        return resp.results.participants_removed
      })
    },
    updateRoom (roomId: number, room: IQRoom): Promise<IQRoom> {
      return http().post<UpdateRoomResponse.RootObject>('update_room', {
        token: user().token,
        id: roomId,
        room_name: room.name,
        avatar_url: room.avatarUrl,
        options: room.options
      }).then<IQRoom>((resp) => {
        return QRoom.fromJson(resp.results.room)
      })
    }
  } as IQRoomAdapter
}

//region Response Type
declare module AddParticipantsResponse {

  export interface Extras {
  }

  export interface ParticipantsAdded {
    avatar_url: string;
    email: string;
    extras: Extras;
    id: number;
    id_str: string;
    last_comment_read_id: number;
    last_comment_read_id_str: string;
    last_comment_received_id: number;
    last_comment_received_id_str: string;
    username: string;
  }

  export interface Results {
    participants_added: ParticipantsAdded[];
  }

  export interface RootObject {
    results: Results;
    status: number;
  }

}
declare module ChatUserResponse {

  export interface Extras {
    role: string;
  }

  export interface Participant {
    avatar_url: string;
    email: string;
    extras: Extras;
    id: number;
    id_str: string;
    last_comment_read_id: number;
    last_comment_read_id_str: string;
    last_comment_received_id: number;
    last_comment_received_id_str: string;
    username: string;
  }

  export interface Room {
    avatar_url: string;
    chat_type: string;
    id: number;
    id_str: string;
    is_public_channel: boolean;
    last_comment_id: number;
    last_comment_id_str: string;
    last_comment_message: string;
    last_topic_id: number;
    last_topic_id_str: string;
    options: string;
    participants: Participant[];
    raw_room_name: string;
    room_name: string;
    room_total_participants: number;
    unique_id: string;
    unread_count: number;
  }

  export interface Results {
    comments: any[];
    room: Room;
  }

  export interface RootObject {
    results: Results;
    status: number;
  }

}
declare module ClearRoomResponse {

  export interface Room {
    avatar_url: string;
    chat_type: string;
    id: number;
    id_str: string;
    options: string;
    raw_room_name: string;
    room_name: string;
    unique_id: string;
    last_comment?: any;
  }

  export interface Results {
    rooms: Room[];
  }

  export interface RootObject {
    results: Results;
    status: number;
  }

}
declare module CreateRoomResponse {

  export interface Extras {
    role: string;
  }

  export interface Participant {
    avatar_url: string;
    email: string;
    extras: Extras;
    id: number;
    id_str: string;
    last_comment_read_id: number;
    last_comment_read_id_str: string;
    last_comment_received_id: number;
    last_comment_received_id_str: string;
    username: string;
  }

  export interface Room {
    avatar_url: string;
    chat_type: string;
    id: number;
    id_str: string;
    is_public_channel: boolean;
    last_comment_id: number;
    last_comment_id_str: string;
    last_comment_message: string;
    last_topic_id: number;
    last_topic_id_str: string;
    options: string;
    participants: Participant[];
    raw_room_name: string;
    room_name: string;
    room_total_participants: number;
    unique_id: string;
    unread_count: number;
  }

  export interface Results {
    comments: any[];
    room: Room;
  }

  export interface RootObject {
    results: Results;
    status: number;
  }

}
declare module GetChannelResponse {

  export interface Room {
    avatar_url: string;
    chat_type: string;
    id: number;
    id_str: string;
    is_public_channel: boolean;
    last_comment_id: number;
    last_comment_id_str: string;
    last_comment_message: string;
    last_topic_id: number;
    last_topic_id_str: string;
    options: string;
    participants: any[];
    raw_room_name: string;
    room_name: string;
    room_total_participants: number;
    unique_id: string;
    unread_count: number;
  }

  export interface Results {
    changed: boolean;
    comments: any[];
    room: Room;
  }

  export interface RootObject {
    results: Results;
    status: number;
  }

}
declare module GetParticipantResponse {

  export interface Meta {
    current_offset: number;
    per_page: number;
    total: number;
  }

  export interface Extras {
  }

  export interface Participant {
    avatar_url: string;
    email: string;
    extras: Extras;
    id: number;
    id_str: string;
    last_comment_read_id: number;
    last_comment_read_id_str: string;
    last_comment_received_id: number;
    last_comment_received_id_str: string;
    username: string;
  }

  export interface Results {
    meta: Meta;
    participants: Participant[];
  }

  export interface RootObject {
    results: Results;
    status: number;
  }

}
declare module GetRoomResponse {

  export interface Extras {
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
    comment_before_id: number;
    comment_before_id_str: string;
    disable_link_preview: boolean;
    email: string;
    extras: Extras;
    id: number;
    id_str: string;
    is_deleted: boolean;
    is_public_channel: boolean;
    message: string;
    payload: Payload;
    room_avatar: string;
    room_id: number;
    room_id_str: string;
    room_name: string;
    room_type: string;
    status: string;
    timestamp: Date;
    topic_id: number;
    topic_id_str: string;
    type: string;
    unique_temp_id: string;
    unix_nano_timestamp: number;
    unix_timestamp: number;
    user_avatar: UserAvatar;
    user_avatar_url: string;
    user_id: number;
    user_id_str: string;
    username: string;
  }

  export interface Extras2 {
    role: string;
  }

  export interface Participant {
    avatar_url: string;
    email: string;
    extras: Extras2;
    id: number;
    id_str: string;
    last_comment_read_id: number;
    last_comment_read_id_str: string;
    last_comment_received_id: number;
    last_comment_received_id_str: string;
    username: string;
  }

  export interface Room {
    avatar_url: string;
    chat_type: string;
    id: number;
    id_str: string;
    is_public_channel: boolean;
    last_comment_id: number;
    last_comment_id_str: string;
    last_comment_message: string;
    last_topic_id: number;
    last_topic_id_str: string;
    options: string;
    participants: Participant[];
    raw_room_name: string;
    room_name: string;
    room_total_participants: number;
    unique_id: string;
    unread_count: number;
  }

  export interface Results {
    comments: Comment[];
    room: Room;
  }

  export interface RootObject {
    results: Results;
    status: number;
  }

}
declare module GetRoomInfoResponse {

  export interface Meta {
    request_rooms_total: number;
    response_rooms_total: number;
  }

  export interface Extras {
  }

  export interface Payload {
  }

  export interface Avatar {
    url: string;
  }

  export interface UserAvatar {
    avatar: Avatar;
  }

  export interface LastComment {
    comment_before_id: number;
    comment_before_id_str: string;
    disable_link_preview: boolean;
    email: string;
    extras: Extras;
    id: number;
    id_str: string;
    is_deleted: boolean;
    is_public_channel: boolean;
    message: string;
    payload: Payload;
    room_avatar: string;
    room_id: number;
    room_id_str: string;
    room_name: string;
    room_type: string;
    status: string;
    timestamp: Date;
    topic_id: number;
    topic_id_str: string;
    type: string;
    unique_temp_id: string;
    unix_nano_timestamp: number;
    unix_timestamp: number;
    user_avatar: UserAvatar;
    user_avatar_url: string;
    user_id: number;
    user_id_str: string;
    username: string;
  }

  export interface Extras2 {
  }

  export interface Participant {
    avatar_url: string;
    email: string;
    extras: Extras2;
    id: number;
    id_str: string;
    last_comment_read_id: number;
    last_comment_read_id_str: string;
    last_comment_received_id: number;
    last_comment_received_id_str: string;
    username: string;
  }

  export interface RoomsInfo {
    avatar_url: string;
    chat_type: string;
    id: number;
    id_str: string;
    is_public_channel: boolean;
    is_removed: boolean;
    last_comment: LastComment;
    options: string;
    participants: Participant[];
    raw_room_name: string;
    room_name: string;
    room_total_participants: number;
    unique_id: string;
    unread_count: number;
  }

  export interface Results {
    meta: Meta;
    rooms_info: RoomsInfo[];
  }

  export interface RootObject {
    results: Results;
    status: number;
  }

}
declare module GetRoomListResponse {

  export interface Meta {
    current_page: number;
    total_room: number;
  }

  export interface Extras {
  }

  export interface Payload {
  }

  export interface Avatar {
    url: string;
  }

  export interface UserAvatar {
    avatar: Avatar;
  }

  export interface LastComment {
    comment_before_id: number;
    comment_before_id_str: string;
    disable_link_preview: boolean;
    email: string;
    extras: Extras;
    id: number;
    id_str: string;
    is_deleted: boolean;
    is_public_channel: boolean;
    message: string;
    payload: Payload;
    room_avatar: string;
    room_id: number;
    room_id_str: string;
    room_name: string;
    room_type: string;
    status: string;
    timestamp: Date;
    topic_id: number;
    topic_id_str: string;
    type: string;
    unique_temp_id: string;
    unix_nano_timestamp: any;
    unix_timestamp: number;
    user_avatar: UserAvatar;
    user_avatar_url: string;
    user_id: number;
    user_id_str: string;
    username: string;
  }

  export interface RoomsInfo {
    avatar_url: string;
    chat_type: string;
    id: number;
    id_str: string;
    is_public_channel: boolean;
    is_removed: boolean;
    last_comment: LastComment;
    options: string;
    raw_room_name: string;
    room_name: string;
    unique_id: string;
    unread_count: number;
    participants?: GetRoomInfoResponse.Participant[]
    room_total_participants?: number
  }

  export interface Results {
    meta: Meta;
    rooms_info: RoomsInfo[];
  }

  export interface RootObject {
    results: Results;
    status: number;
  }

}
declare module GetUnreadResponse {

  export interface Results {
    total_unread_count: number;
  }

  export interface RootObject {
    results: Results;
    status: number;
  }

}
declare module RemoveParticipantResponse {

  export interface Results {
    participants_removed: string[];
  }

  export interface RootObject {
    results: Results;
    status: number;
  }

}
declare module UpdateRoomResponse {

  export interface Extras {
    role: string;
  }

  export interface Participant {
    avatar_url: string;
    email: string;
    extras: Extras;
    id: number;
    id_str: string;
    last_comment_read_id: number;
    last_comment_read_id_str: string;
    last_comment_received_id: number;
    last_comment_received_id_str: string;
    username: string;
  }

  export interface Room {
    avatar_url: string;
    chat_type: string;
    id: number;
    id_str: string;
    is_public_channel: boolean;
    last_comment_id: number;
    last_comment_id_str: string;
    last_comment_message: string;
    last_topic_id: number;
    last_topic_id_str: string;
    options: string;
    participants: Participant[];
    raw_room_name: string;
    room_name: string;
    room_total_participants: number;
    unique_id: string;
    unread_count: number;
  }

  export interface Results {
    changed: boolean;
    comments: any[];
    room: Room;
  }

  export interface RootObject {
    results: Results;
    status: number;
  }

}
//endregion
