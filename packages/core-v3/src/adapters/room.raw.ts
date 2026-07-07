import * as model from '../v3/model'
import * as Api from '../api'
import * as Provider from '../provider'
import { Storage } from '../storage'

export const getRoomAdapterRaw = (s: Storage, api: Api.ApiRequester) => ({
  async addParticipants(roomId: number, participantIds: string[]): Promise<AddParticipantsResponse.RootObject> {
    const apiConfig = Api.addRoomParticipants({
      ...Provider.withBaseUrl(s),
      ...Provider.withCredentials(s),
      id: roomId,
      userIds: participantIds,
    })
    return api.request<AddParticipantsResponse.RootObject>(apiConfig)
  },
  async removeParticipants(
    id: model.IQChatRoom['id'],
    participantIds: model.IQParticipant['id'][]
  ): Promise<RemoveParticipantResponse.RootObject> {
    return api.request<RemoveParticipantResponse.RootObject>(
      Api.removeRoomParticipants({
        ...Provider.withBaseUrl(s),
        ...Provider.withCredentials(s),
        id,
        userIds: participantIds,
      })
    )
  },
  async chatUser(userId: model.IQUser['id'], extras?: model.IQChatRoom['extras']): Promise<ChatUserResponse.RootObject> {
    return api.request<ChatUserResponse.RootObject>(
      Api.getOrCreateRoomWithTarget({
        ...Provider.withBaseUrl(s),
        ...Provider.withCredentials(s),
        userIds: [userId],
        extras,
      })
    )
  },
  async clearRoom(uniqueIds: string[]): Promise<ClearRoomResponse.RootObject> {
    return api.request<ClearRoomResponse.RootObject>(
      Api.clearRooms({
        ...Provider.withBaseUrl(s),
        ...Provider.withCredentials(s),
        uniqueIds,
      })
    )
  },
  async createGroup(
    name: model.IQChatRoom['name'],
    userIds: model.IQUser['id'][],
    avatarUrl?: model.IQChatRoom['avatarUrl'],
    extras?: model.IQChatRoom['extras']
  ): Promise<CreateRoomResponse.RootObject> {
    return api.request<CreateRoomResponse.RootObject>(
      Api.createRoom({
        ...Provider.withBaseUrl(s),
        ...Provider.withCredentials(s),
        name,
        userIds,
        avatarUrl,
        extras,
      })
    )
  },
  async getChannel(
    uniqueId: model.IQChatRoom['uniqueId'],
    name?: model.IQChatRoom['name'],
    avatarUrl?: model.IQChatRoom['avatarUrl'],
    extras?: model.IQChatRoom['extras']
  ): Promise<GetChannelResponse.RootObject> {
    return api.request<GetChannelResponse.RootObject>(
      Api.getOrCreateRoomWithUniqueId({
        ...Provider.withBaseUrl(s),
        ...Provider.withCredentials(s),
        uniqueId,
        name,
        avatarUrl,
        options: extras,
      })
    )
  },
  async getParticipantList(
    uniqueId: string,
    page?: number,
    limit?: number,
    sorting?: 'asc' | 'desc'
  ): Promise<GetParticipantResponse.RootObject> {
    return api.request<GetParticipantResponse.RootObject>(
      Api.getRoomParticipants({
        ...Provider.withBaseUrl(s),
        ...Provider.withCredentials(s),
        uniqueId,
        page,
        limit,
        sorting,
      })
    )
  },
  async getRoom(roomId: number): Promise<GetRoomResponse.RootObject> {
    return api.request<GetRoomResponse.RootObject>(
      Api.getRoomById({
        ...Provider.withBaseUrl(s),
        ...Provider.withCredentials(s),
        id: roomId,
      })
    )
  },
  async getRoomInfo(
    roomIds?: number[],
    roomUniqueIds?: string[],
    page?: number,
    showRemoved: boolean = false,
    showParticipants: boolean = false
  ): Promise<GetRoomInfoResponse.RootObject> {
    return api.request<GetRoomInfoResponse.RootObject>(
      Api.getRoomInfo({
        ...Provider.withBaseUrl(s),
        ...Provider.withCredentials(s),
        showParticipants,
        showRemoved,
        roomIds,
        roomUniqueIds,
        page,
      })
    )
  },
  async getRoomList(
    showParticipants?: boolean,
    showRemoved?: boolean,
    showEmpty?: boolean,
    page?: number,
    limit?: number,
    // Optional (guarded): v3 callers pass none, so `Api.getUserRooms` keeps its
    // `room_type: 'all'` default (v3 wire unchanged); v2's loadRoomList passes
    // 'default' to match old v2 (which sent `room_type: 'default'`).
    roomType?: model.IQChatRoom['type']
  ): Promise<GetRoomListResponse.RootObject> {
    const apiConfig = Api.getUserRooms({
      ...Provider.withBaseUrl(s),
      ...Provider.withCredentials(s),
      showEmpty,
      showRemoved,
      showParticipants,
      page,
      limit,
      type: roomType,
    })
    return api.request<GetRoomListResponse.RootObject>(apiConfig)
  },
  async getUnreadCount(): Promise<GetUnreadResponse.RootObject> {
    return api.request<GetUnreadResponse.RootObject>(
      Api.getTotalUnreadCount({
        ...Provider.withBaseUrl(s),
        ...Provider.withCredentials(s),
      })
    )
  },
  async getRoomUnreadCount(): Promise<GetUnreadResponse.RootObject> {
    return api.request<GetUnreadResponse.RootObject>(
      Api.getRoomUnreadCount({
        ...Provider.withBaseUrl(s),
        ...Provider.withCredentials(s),
      })
    )
  },
  async updateRoom(
    roomId: model.IQChatRoom['id'],
    name?: model.IQChatRoom['name'],
    avatarUrl?: model.IQChatRoom['avatarUrl'],
    extras?: model.IQChatRoom['extras']
  ): Promise<UpdateRoomResponse.RootObject> {
    return api.request<UpdateRoomResponse.RootObject>(
      Api.updateRoom({
        ...Provider.withBaseUrl(s),
        ...Provider.withCredentials(s),
        avatarUrl,
        extras,
        name,
        id: roomId,
      })
    )
  },
})

export default getRoomAdapterRaw

export type RoomAdapterRaw = ReturnType<typeof getRoomAdapterRaw>

//region Response Type
export declare module AddParticipantsResponse {
  export interface Extras {}

  export interface ParticipantsAdded {
    avatar_url: string
    email: string
    extras: Extras
    id: number
    id_str: string
    last_comment_read_id: number
    last_comment_read_id_str: string
    last_comment_received_id: number
    last_comment_received_id_str: string
    username: string
  }

  export interface Results {
    participants_added: ParticipantsAdded[]
  }

  export interface RootObject {
    results: Results
    status: number
  }
}
export declare module ChatUserResponse {
  export interface Participant {
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

  export interface Room {
    avatar_url: string
    chat_type: string
    id: number
    id_str: string
    is_public_channel: boolean
    last_comment_id: number
    last_comment_id_str: string
    last_comment_message: string
    last_topic_id: number
    last_topic_id_str: string
    options: string
    participants: Participant[]
    raw_room_name: string
    room_name: string
    room_total_participants: number
    unique_id: string
    unread_count: number
  }

  export interface Results {
    comments: any[]
    room: Room
  }

  export interface RootObject {
    results: Results
    status: number
  }
}
export declare module ClearRoomResponse {
  export interface Room {
    avatar_url: string
    chat_type: string
    id: number
    id_str: string
    options: string
    raw_room_name: string
    room_name: string
    unique_id: string
    last_comment?: any
  }

  export interface Results {
    rooms: Room[]
  }

  export interface RootObject {
    results: Results
    status: number
  }
}
export declare module CreateRoomResponse {
  export interface Extras {
    role: string
  }

  export interface Participant {
    avatar_url: string
    email: string
    extras: Extras
    id: number
    id_str: string
    last_comment_read_id: number
    last_comment_read_id_str: string
    last_comment_received_id: number
    last_comment_received_id_str: string
    username: string
  }

  export interface Room {
    avatar_url: string
    chat_type: string
    id: number
    id_str: string
    is_public_channel: boolean
    last_comment_id: number
    last_comment_id_str: string
    last_comment_message: string
    last_topic_id: number
    last_topic_id_str: string
    options: string
    participants: Participant[]
    raw_room_name: string
    room_name: string
    room_total_participants: number
    unique_id: string
    unread_count: number
  }

  export interface Results {
    comments: any[]
    room: Room
  }

  export interface RootObject {
    results: Results
    status: number
  }
}
export declare module GetChannelResponse {
  export interface Room {
    avatar_url: string
    chat_type: string
    id: number
    id_str: string
    is_public_channel: boolean
    last_comment_id: number
    last_comment_id_str: string
    last_comment_message: string
    last_topic_id: number
    last_topic_id_str: string
    options: string
    participants: any[]
    raw_room_name: string
    room_name: string
    room_total_participants: number
    unique_id: string
    unread_count: number
  }

  export interface Results {
    changed: boolean
    comments: any[]
    room: Room
  }

  export interface RootObject {
    results: Results
    status: number
  }
}
export declare module GetParticipantResponse {
  export interface Meta {
    current_offset: number
    per_page: number
    total: number
  }

  export interface Extras {}

  export interface Participant {
    avatar_url: string
    email: string
    extras: Extras
    id: number
    id_str: string
    last_comment_read_id: number
    last_comment_read_id_str: string
    last_comment_received_id: number
    last_comment_received_id_str: string
    username: string
  }

  export interface Results {
    meta: Meta
    participants: Participant[]
  }

  export interface RootObject {
    results: Results
    status: number
  }
}
export declare module GetRoomResponse {
  export interface Payload {}

  export interface Avatar {
    url: string
  }

  export interface UserAvatar {
    avatar: Avatar
  }

  export interface Comment {
    comment_before_id: number
    comment_before_id_str: string
    disable_link_preview: boolean
    email: string
    extras: object
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
    room_type: string
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

  export interface Extras2 {
    role: string
  }

  export interface Participant {
    avatar_url: string
    email: string
    extras: Extras2
    id: number
    id_str: string
    last_comment_read_id: number
    last_comment_read_id_str: string
    last_comment_received_id: number
    last_comment_received_id_str: string
    username: string
  }

  export interface Room {
    avatar_url: string
    chat_type: string
    id: number
    id_str: string
    is_public_channel: boolean
    last_comment_id: number
    last_comment_id_str: string
    last_comment_message: string
    last_topic_id: number
    last_topic_id_str: string
    options: string
    participants: Participant[]
    raw_room_name: string
    room_name: string
    room_total_participants: number
    unique_id: string
    unread_count: number
  }

  export interface Results {
    comments: Comment[]
    room: Room
  }

  export interface RootObject {
    results: Results
    status: number
  }
}
export declare module GetRoomInfoResponse {
  export interface Meta {
    request_rooms_total: number
    response_rooms_total: number
  }

  export interface Extras {}

  export interface Payload {}

  export interface Avatar {
    url: string
  }

  export interface UserAvatar {
    avatar: Avatar
  }

  export interface LastComment {
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
    room_type: string
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

  export interface Participant {
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

  export interface RoomsInfo {
    avatar_url: string
    chat_type: string
    id: number
    id_str: string
    is_public_channel: boolean
    is_removed: boolean
    last_comment: LastComment
    options: string
    participants: Participant[]
    raw_room_name: string
    room_name: string
    room_total_participants: number
    unique_id: string
    unread_count: number
  }

  export interface Results {
    meta: Meta
    rooms_info: RoomsInfo[]
  }

  export interface RootObject {
    results: Results
    status: number
  }
}
export declare module GetRoomListResponse {
  export interface Meta {
    current_page: number
    total_room: number
  }

  export interface Extras {}

  export interface Payload {}

  export interface Avatar {
    url: string
  }

  export interface UserAvatar {
    avatar: Avatar
  }

  export interface LastComment {
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
    room_type: string
    status: string
    timestamp: string
    topic_id: number
    topic_id_str: string
    type: string
    unique_temp_id: string
    unix_nano_timestamp: any
    unix_timestamp: number
    user_avatar: UserAvatar
    user_avatar_url: string
    user_id: number
    user_id_str: string
    username: string
  }

  export interface RoomsInfo {
    avatar_url: string
    chat_type: string
    id: number
    id_str: string
    is_public_channel: boolean
    is_removed: boolean
    last_comment: LastComment
    options: string
    raw_room_name: string
    room_name: string
    unique_id: string
    unread_count: number
    participants?: GetRoomInfoResponse.Participant[]
    room_total_participants?: number
  }

  export interface Results {
    meta: Meta
    rooms_info: RoomsInfo[]
  }

  export interface RootObject {
    results: Results
    status: number
  }
}
export declare module GetUnreadResponse {
  export interface Results {
    total_unread_count: number
  }

  export interface RootObject {
    results: Results
    status: number
  }
}
export declare module RemoveParticipantResponse {
  export interface Results {
    participants_removed: string[]
  }

  export interface RootObject {
    results: Results
    status: number
  }
}
export declare module UpdateRoomResponse {
  export interface Extras {
    role: string
  }

  export interface Participant {
    avatar_url: string
    email: string
    extras: Extras
    id: number
    id_str: string
    last_comment_read_id: number
    last_comment_read_id_str: string
    last_comment_received_id: number
    last_comment_received_id_str: string
    username: string
  }

  export interface Room {
    avatar_url: string
    chat_type: string
    id: number
    id_str: string
    is_public_channel: boolean
    last_comment_id: number
    last_comment_id_str: string
    last_comment_message: string
    last_topic_id: number
    last_topic_id_str: string
    options: string
    participants: Participant[]
    raw_room_name: string
    room_name: string
    room_total_participants: number
    unique_id: string
    unread_count: number
  }

  export interface Results {
    changed: boolean
    comments: any[]
    room: Room
  }

  export interface RootObject {
    results: Results
    status: number
  }
}
//endregion
