import cuid from 'cuid'
import {
  IQMessageT,
} from '../defs'
import { Storage } from '../storage'
import * as Api from '../api'
import * as Provider from '../provider'
import * as Decoder from '../decoder'
import * as model from '../model'

const getMessageAdapter = (s: Storage) => ({
  sendMessage (roomId: number, messageT: IQMessageT): Promise<model.IQMessage> {
    const apiConfig = Api.postComment({
      ...Provider.withBaseUrl(s),
      ...Provider.withCredentials(s),
      roomId,
      type: messageT.type as model.IQMessage['type'],
      text: messageT.message,
      payload: messageT.payload as model.IQMessage['payload'],
      uniqueId: cuid(),
      extras: messageT.extras as model.IQMessage['extras'],
    })
    return Api.request<PostCommentResponse.RootObject>(apiConfig)
      .then(resp => Decoder.message(resp.results.comment))
  },
  getMessages (
    roomId: number,
    lastMessageId: number = 0,
    limit: number = 20,
    after: boolean = false,
  ): Promise<model.IQMessage[]> {
    return Api.request<GetCommentsResponse.RootObject>(Api.getComment({
      ...Provider.withBaseUrl(s),
      ...Provider.withCredentials(s),
      lastMessageId,
      roomId,
      after,
      limit,
    })).then(resp => resp.results.comments.map(Decoder.message))
  },
  deleteMessage (uniqueIds: string[]): Promise<model.IQMessage[]> {
    return Api.request<DeleteCommentsResponse.RootObject>(Api.deleteMessages({
      ...Provider.withBaseUrl(s),
      ...Provider.withCredentials(s),
      uniqueIds,
    })).then(resp => resp.results.comments.map(Decoder.message))
  },
  markAsRead (roomId: number, messageId: number): Promise<void> {
    return Api.request<UpdateCommentStatusResponse.RootObject>(
      Api.updateCommentStatus({
        ...Provider.withBaseUrl(s),
        ...Provider.withCredentials(s),
        lastReadId: messageId,
        lastReceivedId: undefined,
        roomId,
      })).then(() => undefined)
  },
  markAsDelivered (roomId: number, messageId: number): Promise<void> {
    return Api.request<UpdateCommentStatusResponse.RootObject>(
      Api.updateCommentStatus({
        ...Provider.withBaseUrl(s),
        ...Provider.withCredentials(s),
        roomId,
        lastReceivedId: messageId,
        lastReadId: undefined,
      })).then(() => undefined)
  },
})
export default getMessageAdapter
export type MessageAdapter = ReturnType<typeof getMessageAdapter>

// region Response type
export declare module PostCommentResponse {
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
    payload: object;
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

  export interface Results {
    comment: Comment;
  }

  export interface RootObject {
    results: Results;
    status: number;
  }
}
export declare module GetCommentsResponse {
  export interface Extras {}

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

  export interface Results {
    comments: Comment[];
  }

  export interface RootObject {
    results: Results;
    status: number;
  }
}
export declare module DeleteCommentsResponse {
  export interface Extras {}

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

  export interface Results {
    comments: Comment[];
  }

  export interface RootObject {
    results: Results;
    status: number;
  }
}
export declare module UpdateCommentStatusResponse {
  export interface Results {
    changed: boolean;
    last_comment_read_id: number;
    last_comment_read_id_str: string;
    last_comment_received_id: number;
    last_comment_received_id_str: string;
    user_id: number;
    user_id_str: string;
  }

  export interface RootObject {
    results: Results;
    status: number;
  }
}
// endregion
