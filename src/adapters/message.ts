import { IQHttpAdapter } from 'adapters/http'
import { IQUserAdapter } from 'adapters/user'
import QUrlBuilder from 'utils/url-builder'

export enum IQMessageStatus {
  Sending,
  Sent,
  Delivered,
  Read,
  Failed
}

export enum IQMessageType {
  Text = 'text',
  Custom = 'custom'
}

export interface IQMessage {
  id: number
  roomId: number
  userId: string
  content: string
  previousMessageId: number
  timestamp: Date
  type: IQMessageType
  status: IQMessageStatus
}

export class QMessage implements IQMessage {
  id: number
  content: string
  previousMessageId: number
  roomId: number
  status: IQMessageStatus
  timestamp: Date
  type: IQMessageType
  userId: string

  static fromJson(json: PostCommentResponse.Comment): IQMessage {
    const message = new QMessage()
    message.id = json.id
    message.content = json.message
    message.previousMessageId = json.comment_before_id
    message.roomId = json.room_id
    message.timestamp = new Date(json.timestamp)
    message.userId = json.username
    if (json.type === 'text') message.type = IQMessageType.Text
    if (json.type === 'custom') message.type = IQMessageType.Custom
    if (json.status === 'delivered') message.status = IQMessageStatus.Delivered
    if (json.status === 'read') message.status = IQMessageStatus.Read
    return message
  }
}

export interface IQMessageAdapter {
  sendMessage (roomId: number, content: string): Promise<IQMessage>
  getMessages (page: number, limit: number): Promise<IQMessage[]>
  resendMessage (message: IQMessage): Promise<IQMessage>
  deleteMessage (messageIds: number[]): Promise<IQMessage[]>
}

export default function getMessageAdapter (
  http: () => IQHttpAdapter,
  user: () => IQUserAdapter
): IQMessageAdapter {
  return {
    sendMessage (roomId: number, content: string): Promise<IQMessage> {
      const url = QUrlBuilder('/post_comment')
        .param('token', user().token)
        .param('topic_id', roomId)
        .param('message', content)
        .build()
      return http().get<PostCommentResponse.RootObject>(url)
        .then<IQMessage>((resp) => {
          const comment = resp.results.comment
          const message: IQMessage = new QMessage()
          message.id = comment.id
          message.content = comment.message
          message.previousMessageId = comment.comment_before_id
          message.roomId = comment.room_id
          message.timestamp = new Date(comment.timestamp)
          message.userId = comment.username

          if (comment.status === 'delivered') message.status = IQMessageStatus.Delivered
          if (comment.status === 'read') message.status = IQMessageStatus.Read

          return message
        })
    },
    getMessages (roomId: number, lastMessageId: number = 0, limit: number = 20): Promise<IQMessage[]> {
      const url = QUrlBuilder('/load_comments')
        .param('token', user().token)
        .param('topic_id', roomId)
        .param('last_comment_id', lastMessageId)
        .param('limit', limit)
        .build()
      return http().get<GetCommentsResponse.RootObject>(url)
        .then((resp) => {
          return resp.results.comments
            .map<IQMessage>((comment) => {
              const message = new QMessage()
              message.id = comment.id
              message.content = comment.message
              message.id = comment.id
              message.content = comment.message
              message.previousMessageId = comment.comment_before_id
              message.roomId = comment.room_id
              message.timestamp = new Date(comment.timestamp)
              message.userId = comment.username

              if (comment.type === 'text') message.type = IQMessageType.Text
              if (comment.type === 'custom') message.type = IQMessageType.Custom
              if (comment.status === 'delivered') message.status = IQMessageStatus.Delivered
              if (comment.status === 'read') message.status = IQMessageStatus.Read

              return message
            })
        })
    },
    resendMessage (message: IQMessage): Promise<IQMessage> {
      return this.sendMessage(message.roomId, message.content)
    },
    deleteMessage (messageIds: number[]): Promise<IQMessage[]> {
      const url = QUrlBuilder('/delete_messages')
        .param('token', user().token)
        .param('unique_ids[]', messageIds)
        .build()
      return http().delete<DeleteCommentsResponse.RootObject>(url)
        .then<IQMessage[]>((resp) => {
          return resp.results.comments
            .map<IQMessage>((comment) => {
              const message = new QMessage()
              message.id = comment.id
              message.content = comment.message
              message.userId = comment.username
              message.timestamp = new Date(comment.timestamp)
              message.previousMessageId = comment.comment_before_id
              message.roomId = comment.room_id

              if (comment.status === 'read') message.status = IQMessageStatus.Read
              if (comment.status === 'delivered') message.status = IQMessageStatus.Delivered
              if (comment.type === 'text') message.type = IQMessageType.Text
              if (comment.type === 'custom') message.type = IQMessageType.Custom

              return message
            })
        })
    }
  }
}

// Response type
declare module PostCommentResponse {
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

  export interface Results {
    comment: Comment;
  }

  export interface RootObject {
    results: Results;
    status: number;
  }
}
declare module GetCommentsResponse {

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

  export interface Results {
    comments: Comment[];
  }

  export interface RootObject {
    results: Results;
    status: number;
  }

}
declare module DeleteCommentsResponse {

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

