import cuid from "cuid";
import { atom, Atom, lens } from "derivable";
import { mod, findBy, matching } from "shades";
import {
  IQMessage,
  IQMessageAdapter,
  IQMessageStatus,
  IQMessageT,
  IQMessageType,
  IQRoomAdapter,
  IQUserAdapter,
  IQParticipant
} from "../defs";
import QUrlBuilder from "../utils/url-builder";
import { IQHttpAdapter } from "./http";

const lessThanEq = (a: number) => (b: number) => a <= b;

export const getMessageType = (type: string) => {
  switch (type) {
    case "custom":
      return IQMessageType.Custom;
    case "text":
    default:
      return IQMessageType.Text;
  }
};

export type JsonMessage = {
  id: number;
  message: string;
  comment_before_id: number;
  room_id: number;
  status: string;
  timestamp: Date;
  unix_timestamp: number;
  type: string;
  unique_temp_id: string;
  extras: object;
  payload: object;
  username: string;
  email: string;
};

export class QMessage implements IQMessage {
  id: number;
  content: string;
  previousMessageId: number;
  roomId: number;
  status: IQMessageStatus;
  timestamp: Date;
  type: IQMessageType;
  userId: string;
  uniqueId: string;
  extras: object;
  payload: object;

  updateFromJson(json: JsonMessage): IQMessage {
    this.id = json.id;
    this.content = json.message;
    this.previousMessageId = json.comment_before_id;
    this.roomId = json.room_id;
    this.timestamp = new Date(json.timestamp);
    this.userId = json.email;
    this.uniqueId = json.unique_temp_id;
    this.extras = json.extras;
    this.payload = json.payload;
    if (json.type === "text") this.type = IQMessageType.Text;
    if (json.type === "custom") this.type = IQMessageType.Custom;
    if (json.status === "delivered") this.status = IQMessageStatus.Delivered;
    if (json.status === "read") this.status = IQMessageStatus.Read;
    return this;
  }

  static fromJson(json: JsonMessage): IQMessage {
    return new QMessage().updateFromJson(json);
  }

  static prepareNew(
    userId: string,
    roomId: number,
    content: string,
    type = IQMessageType.Text,
    extras: object = {},
    payload: object = {}
  ): IQMessage {
    const timestamp = new Date();
    const message = new QMessage();
    message.content = content;
    message.type = type;
    message.status = IQMessageStatus.Sending;
    message.roomId = roomId;
    message.timestamp = timestamp;
    message.userId = userId;
    message.uniqueId = `js-${cuid()}`;
    message.extras = extras;
    message.payload = payload;
    return message;
  }
}

export default function getMessageAdapter(
  http: Atom<IQHttpAdapter>,
  user: Atom<IQUserAdapter>,
  roomAdapter: Atom<IQRoomAdapter>
): IQMessageAdapter {
  const messages = atom<{ [key: string]: IQMessage }>({});
  const getMessageDataWithId = (messageId: number) =>
    lens<IQMessage>({
      get() {
        return Object.values(messages.get()).find(it => it.id === messageId);
      },
      set(message) {
        messages.update(msgs => {
          if (message != null) msgs[message.uniqueId] = message;
          return msgs;
        });
      }
    });
  return {
    get messages() {
      return messages;
    },
    get getMessageDataWithId() {
      return getMessageDataWithId;
    },
    sendMessage(roomId: number, messageT: IQMessageT): Promise<IQMessage> {
      const userId = user.get().currentUser.get().userId;
      const message = QMessage.prepareNew(userId, roomId, messageT.message);
      messages.update(messages => ({
        ...messages,
        [message.uniqueId]: message
      }));
      const url = "post_comment";

      const data = new FormData();
      data.append("token", user.get().token.get());
      data.append("topic_id", String(message.roomId));
      data.append("comment", message.content);
      data.append("payload", JSON.stringify(message.payload));
      data.append("extras", JSON.stringify(message.extras));

      return http
        .get()
        .postFormData<PostCommentResponse.RootObject>(url, data)
        .then(resp => resp.results.comment)
        .then<IQMessage>(comment => {
          message.updateFromJson(comment);
          messages.update(messages => ({
            ...messages,
            [message.uniqueId]: message
          }));
          return message;
        });
    },
    getMessages(
      roomId: number,
      lastMessageId: number = 0,
      limit: number = 20,
      after: boolean = false
    ): Promise<IQMessage[]> {
      const url = QUrlBuilder("load_comments")
        .param("token", user.get().token.get())
        .param("topic_id", roomId)
        .param("last_comment_id", lastMessageId)
        .param("limit", limit)
        .param("after", after)
        .build();
      return http
        .get()
        .get<GetCommentsResponse.RootObject>(url)
        .then(res => res.results.comments)
        .then(comments => {
          const _messages = comments.map(it => QMessage.fromJson(it));
          // _messages.forEach(it => messages.update(msgs => ({ ...msgs, [it.uniqueId]: it })));
          messages.update(msgs => {
            _messages.forEach(msg => (msgs[msg.uniqueId] = msg));
            return msgs;
          });
          return _messages;
        });
    },
    deleteMessage(messageIds: string[]): Promise<IQMessage[]> {
      const url = QUrlBuilder("delete_messages")
        .param("token", user.get().token.get())
        .param("unique_ids", messageIds)
        .build();
      return http
        .get()
        .delete<DeleteCommentsResponse.RootObject>(url)
        .then<IQMessage[]>(resp => {
          return resp.results.comments.map<IQMessage>(comment => {
            const message = messages.get()[comment.unique_temp_id];
            if (message == null) return QMessage.fromJson(comment);
            messages.update(messages => {
              messages[comment.unique_temp_id] = undefined;
              return messages;
            });
            return message;
          });
        });
    },
    markAsRead(roomId: number, messageId: number): Promise<IQMessage> {
      const adapter = roomAdapter.get();
      const url = QUrlBuilder("update_comment_status")
        .param("token", user.get().token.get())
        .param("last_comment_read_id", messageId)
        .param("room_id", roomId)
        .build();
      return http
        .get()
        .post<UpdateCommentStatusResponse.RootObject>(url)
        .then(resp => resp.results)
        .then(result => {
          // Update participant last read comment id
          const selector = mod(
            "participants",
            findBy.of<IQParticipant>({ id: result.user_id })
          );
          const transformer = selector(it => ({
            ...it,
            lastReadMessageId: result.last_comment_read_id
          }));
          adapter.getRoomDataWithId(roomId).update(transformer);
          const room = adapter.getRoomDataWithId(roomId).get();

          // update comment status as read
          // only if all participants has read it
          // Find the lowest read id or the ID which all participants has read
          const lowestMessageId = room.participants
            .map(it => it.lastReadMessageId)
            .sort()
            .reduce((res, it) => (res > it ? it : res));
          const _selector = mod(matching({ id: lessThanEq(lowestMessageId) }));
          const _transformer = _selector<IQMessage>(message => {
            message.status = IQMessageStatus.Read;
            return message;
          });
          messages.update(_transformer);
          return getMessageDataWithId(messageId).get();
        });
    },
    markAsDelivered(roomId: number, messageId: number): Promise<IQMessage> {
      const adapter = roomAdapter.get();
      const url = QUrlBuilder("update_comment_status")
        .param("token", user.get().token.get())
        .param("last_comment_received_id", messageId)
        .param("room_id", roomId)
        .build();
      return http
        .get()
        .post<UpdateCommentStatusResponse.RootObject>(url)
        .then(resp => resp.results)
        .then(result => {
          adapter.getRoomDataWithId(roomId).update(room => {
            if (room == null) return room;
            const selector = mod(
              "participants",
              findBy.of<IQParticipant>({ id: result.user_id })
            );
            const transformer = selector(it => ({
              ...it,
              lastReceivedMessageId: result.last_comment_received_id
            }));
            return transformer(room);
          });

          const room = adapter.getRoomDataWithId(roomId).get();

          if (room == null) return null;

          const lowestMessageId = room.participants
            .map(it => it.lastReceivedMessageId)
            .sort()
            .reduce((res, it) => (res > it ? it : res));
          messages.update(msgs => {
            const selector = mod(matching({ id: lessThanEq(lowestMessageId) }));
            const changer = (it: IQMessage) => ({
              ...it,
              status: IQMessageStatus.Delivered
            });
            const transformer = selector(changer);
            const result = transformer(msgs);
            return result;
          });
          return getMessageDataWithId(messageId).get();
        });
    }
  };
}

// Response type
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
