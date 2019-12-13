import { atom, lens } from 'derivable'
import * as model from '../model'
import * as Api from '../api'
import * as Provider from '../provider'
import * as Decoder from '../decoder'
import { Storage } from '../storage'

const getRoomAdapter = (s: Storage) => ({
  addParticipants (
    roomId: number,
    participantIds: string[],
  ): Promise<model.IQParticipant[]> {
    const apiConfig = Api.addRoomParticipants({
      ...Provider.withBaseUrl(s),
      ...Provider.withCredentials(s),
      id: roomId,
      userIds: participantIds,
    })
    return Api.request<AddParticipantsResponse.RootObject>(apiConfig)
      .then(resp => resp.results.participants_added.map(Decoder.participant))
  },
  removeParticipants (
    id: model.IQChatRoom['id'],
    participantIds: model.IQParticipant['id'][],
  ): Promise<model.IQParticipant[]> {
    return Api.request<RemoveParticipantResponse.RootObject>(
      Api.removeRoomParticipants({
        ...Provider.withBaseUrl(s),
        ...Provider.withCredentials(s),
        id,
        userIds: participantIds,
      })).then(resp => resp.results.participants_removed
      .map(email => Decoder.participant({
        email,
      } as any)))
  },
  chatUser (
    userId: model.IQUser['id'],
    extras?: model.IQChatRoom['extras'],
  ): Promise<model.IQChatRoom> {
    return Api.request<ChatUserResponse.RootObject>(
      Api.getOrCreateRoomWithTarget({
        ...Provider.withBaseUrl(s),
        ...Provider.withCredentials(s),
        userIds: [userId],
        extras,
      })).then(resp => Decoder.room({
      ...resp.results.room,
      is_removed: false,
      last_comment: resp.results.comments.find(
        it => it.id === resp.results.room.last_comment_id),
    }))
  },
  clearRoom (uniqueIds: string[]): Promise<model.IQChatRoom[]> {
    return Api.request<ClearRoomResponse.RootObject>(Api.clearRooms({
      ...Provider.withBaseUrl(s),
      ...Provider.withCredentials(s),
      uniqueIds,
    })).then(resp => resp.results.rooms.map(Decoder.room))
  },
  createGroup (
    name: model.IQChatRoom['name'],
    userIds: model.IQUser['id'][],
    avatarUrl?: model.IQChatRoom['avatarUrl'],
    extras?: model.IQChatRoom['extras'],
  ): Promise<model.IQChatRoom> {
    return Api.request<CreateRoomResponse.RootObject>(Api.createRoom({
      ...Provider.withBaseUrl(s),
      ...Provider.withCredentials(s),
      name,
      userIds,
      avatarUrl,
      extras,
    })).then(resp => Decoder.room({
      ...resp.results.room,
      is_removed: false,
      last_comment: resp.results.comments.pop(),
    }))
  },
  getChannel (
    uniqueId: model.IQChatRoom['uniqueId'],
    name?: model.IQChatRoom['name'],
    avatarUrl?: model.IQChatRoom['avatarUrl'],
    extras?: model.IQChatRoom['extras'],
  ): Promise<model.IQChatRoom> {
    return Api.request<GetChannelResponse.RootObject>(
      Api.getOrCreateRoomWithUniqueId({
        ...Provider.withBaseUrl(s),
        ...Provider.withCredentials(s),
        uniqueId,
        name,
        avatarUrl,
        options: extras,
      })).then(resp => Decoder.room({
      ...resp.results.room,
      is_removed: false,
      last_comment: resp.results.comments.find(
        it => it.id === resp.results.room.last_comment_id),
    }))
  },
  getParticipantList (
    uniqueId: string,
    offset?: number | null,
    sorting?: 'asc' | 'desc' | null,
  ): Promise<model.IQParticipant[]> {
    return Api.request<GetParticipantResponse.RootObject>(
      Api.getRoomParticipants({
        ...Provider.withBaseUrl(s),
        ...Provider.withCredentials(s),
        uniqueId,
        offset,
        sorting,
      })).then(resp => resp.results.participants.map((Decoder.participant)))
  },
  getRoom (roomId: number): Promise<model.IQChatRoom> {
    return Api.request<GetRoomResponse.RootObject>(Api.getRoomById({
      ...Provider.withBaseUrl(s),
      ...Provider.withCredentials(s),
      id: roomId,
    })).then(resp => Decoder.room({
      ...resp.results.room,
      is_removed: false,
      last_comment: resp.results.comments.pop(),
    }))
  },
  getRoomInfo (
    roomIds?: string[],
    roomUniqueIds?: string[],
    page?: number,
    showRemoved: boolean = false,
    showParticipants: boolean = false,
  ): Promise<model.IQChatRoom[]> {
    return Api.request<GetRoomInfoResponse.RootObject>(Api.getRoomInfo({
      ...Provider.withBaseUrl(s),
      ...Provider.withCredentials(s),
      showParticipants,
      showRemoved,
      roomIds,
      roomUniqueIds,
    } as any)).then(resp => resp.results.rooms_info
      .map(Decoder.room),
    )
  },
  getRoomList (
    showParticipants?: boolean,
    showRemoved?: boolean,
    showEmpty?: boolean,
    page?: number,
    limit?: number,
  ): Promise<model.IQChatRoom[]> {
    const apiConfig = Api.getUserRooms({
      ...Provider.withBaseUrl(s),
      ...Provider.withCredentials(s),
      showEmpty,
      showRemoved,
      showParticipants,
      page,
      limit,
    })
    return Api.request<GetRoomListResponse.RootObject>(apiConfig)
      .then(res => {
        return res.results.rooms_info
          .map<model.IQChatRoom>((it: any) => Decoder.room(it))
      })
  },
  getUnreadCount (): Promise<number> {
    return Api.request<GetUnreadResponse.RootObject>(Api.getTotalUnreadCount({
      ...Provider.withBaseUrl(s),
      ...Provider.withCredentials(s),
    })).then(resp => resp.results.total_unread_count)
  },
  updateRoom (
    roomId: model.IQChatRoom['id'],
    name?: model.IQChatRoom['name'],
    avatarUrl?: model.IQChatRoom['avatarUrl'],
    extras?: model.IQChatRoom['extras'],
  ): Promise<model.IQChatRoom> {
    return Api.request<UpdateRoomResponse.RootObject>(Api.updateRoom({
      ...Provider.withBaseUrl(s),
      ...Provider.withCredentials(s),
      avatarUrl,
      extras,
      name,
      id: roomId,
    })).then(resp => Decoder.room(resp.results.room as any))
  },
})

export default getRoomAdapter

export type RoomAdapter = ReturnType<typeof getRoomAdapter>

//region Response Type
declare module AddParticipantsResponse {
  export interface Extras {}

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
  export interface Participant {
    avatar_url: string;
    email: string;
    extras: object;
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

  export interface Extras {}

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
  export interface Payload {}

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
    extras: object;
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
    timestamp: string;
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

  export interface Extras {}

  export interface Payload {}

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
    timestamp: string;
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

  export interface Participant {
    avatar_url: string;
    email: string;
    extras: object;
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

  export interface Extras {}

  export interface Payload {}

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
    timestamp: string;
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
    participants?: GetRoomInfoResponse.Participant[];
    room_total_participants?: number;
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
