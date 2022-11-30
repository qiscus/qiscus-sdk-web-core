// @ts-ignore
import { Storage } from '../storage'
import * as Api from '../api'
import * as Provider from '../provider'
import * as Decoder from '../decoder'
import * as model from '../model'
import { nanoid } from 'nanoid'

const getMessageAdapter = (s: Storage, api: Api.ApiRequester) => ({
  sendMessage(roomId: number, message: model.IQMessage): Promise<model.IQMessage> {
    const apiConfig = Api.postComment({
      ...Provider.withBaseUrl(s),
      ...Provider.withCredentials(s),
      roomId,
      type: message.type as model.IQMessage['type'],
      text: message.text,
      payload: message.payload as model.IQMessage['payload'],
      uniqueId: message.uniqueId ?? `javascript-${nanoid()}`,
      extras: message.extras as model.IQMessage['extras'],
    })
    return api.request<PostCommentResponse.RootObject>(apiConfig).then((resp) => Decoder.message(resp.results.comment))
  },
  getMessages(
    roomId: number,
    lastMessageId: number = 0,
    limit: number = 20,
    after: boolean = false
  ): Promise<model.IQMessage[]> {
    return api
      .request<GetCommentsResponse.RootObject>(
        Api.getComment({
          ...Provider.withBaseUrl(s),
          ...Provider.withCredentials(s),
          lastMessageId,
          roomId,
          after,
          limit,
        })
      )
      .then((resp) =>
        resp.results.comments.map(Decoder.message).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      )
  },
  deleteMessage(uniqueIds: string[]): Promise<model.IQMessage[]> {
    return api
      .request<DeleteCommentsResponse.RootObject>(
        Api.deleteMessages({
          ...Provider.withBaseUrl(s),
          ...Provider.withCredentials(s),
          uniqueIds,
        })
      )
      .then((resp) => resp.results.comments.map(Decoder.message))
  },
  markAsRead(roomId: number, messageId: number): Promise<void> {
    return api
      .request<UpdateCommentStatusResponse.RootObject>(
        Api.updateCommentStatus({
          ...Provider.withBaseUrl(s),
          ...Provider.withCredentials(s),
          lastReadId: messageId,
          lastReceivedId: undefined,
          roomId,
        })
      )
      .then(() => undefined)
  },
  markAsDelivered(roomId: number, messageId: number): Promise<void> {
    return api
      .request<UpdateCommentStatusResponse.RootObject>(
        Api.updateCommentStatus({
          ...Provider.withBaseUrl(s),
          ...Provider.withCredentials(s),
          roomId,
          lastReceivedId: messageId,
          lastReadId: undefined,
        })
      )
      .then(() => undefined)
  },
  async searchMessages({
    query,
    roomIds = [],
    userId,
    type,
    roomType,
    page,
    limit,
  }: {
    query: string
    roomIds: number[]
    userId?: string
    type?: string
    roomType?: string
    page?: number
    limit?: number
  }): Promise<model.IQMessage[]> {
    const messages = await api
      .request<SearchMessagesV2Response.RootObject>(
        Api.searchMessagesV2({
          ...Provider.withBaseUrl(s),
          ...Provider.withCredentials(s),
          query: query,
          roomIds: roomIds,
          userId: userId,
          type: type,
          roomType: roomType,
          page: page,
          limit: limit,
        })
      )
      .then((r) => r.results.comments)
      .then((comments) => comments.map((it) => Decoder.message(it as any)))

    return messages
  },
  async getFileList({
    roomIds = [],
    fileType,
    page,
    limit,
    userId,
    includeExtensions,
    excludeExtensions,
  }: {
    roomIds?: number[]
    fileType?: string
    page?: number
    limit?: number
    userId?: string
    includeExtensions?: string[]
    excludeExtensions?: string[]
  }): Promise<model.IQMessage[]> {
    if (userId === undefined) {
      userId = s.getCurrentUser().id
    }

    const messages = api
      .request<SearchMessagesV2Response.RootObject>(
        Api.getFileList({
          ...Provider.withBaseUrl(s),
          ...Provider.withCredentials(s),
          roomIds,
          fileType,
          page,
          limit,
          sender: userId,
          includeExtensions,
          excludeExtensions,
        })
      )
      .then((r) => r.results.comments)
      .then((r) => r.map((it) => Decoder.message(it as any)))

    return messages
  },
  async updateMessage(message: model.IQMessage): Promise<model.IQMessage> {
    return api
      .request<PostCommentResponse.RootObject>(
        Api.updateMessage({
          ...Provider.withBaseUrl(s),
          ...Provider.withCredentials(s),
          token: s.getToken(),
          uniqueId: message.uniqueId,
          comment: message.text,
          extras: message.extras,
          payload: message.payload,
        })
      )
      .then((r) => r.results.comment)
      .then((r) => Decoder.message(r))
  },
})
export default getMessageAdapter
export type MessageAdapter = ReturnType<typeof getMessageAdapter>

// region Response type
export declare module PostCommentResponse {
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
    payload: object
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

  export interface Results {
    comment: Comment
  }

  export interface RootObject {
    results: Results
    status: number
  }
}
export declare module GetCommentsResponse {
  export interface Extras {}

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

  export interface Results {
    comments: Comment[]
  }

  export interface RootObject {
    results: Results
    status: number
  }
}
export declare module DeleteCommentsResponse {
  export interface Extras {}

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

  export interface Results {
    comments: Comment[]
  }

  export interface RootObject {
    results: Results
    status: number
  }
}
export declare module UpdateCommentStatusResponse {
  export interface Results {
    changed: boolean
    last_comment_read_id: number
    last_comment_read_id_str: string
    last_comment_received_id: number
    last_comment_received_id_str: string
    user_id: number
    user_id_str: string
  }

  export interface RootObject {
    results: Results
    status: number
  }
}
declare module SearchMessagesV2Response {
  export interface Extras {}

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
    timestamp: Date
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

  export interface Results {
    comments: Comment[]
    limit: number
    page: number
    total: string
  }

  export interface RootObject {
    results: Results
    status: number
  }
}

// endregion
