import { Atom, Derivable, Lens } from 'derivable'
import { PostCommentResponse } from './adapters/message'
import * as model from './model'

export type IQCallback2<T> = (response?: T, error?: Error) => void
export type IQCallback1 = (error?: Error) => void

export type IQProgressListener<O = string> = (error?: Error, progress?: number, url?: O) => void

export interface Callback<T1> {
  (data1: T1): void
}
export interface Subscription {
  (): void
}

export interface IQiscus {
  setup(appId: string, syncInterval: number): void
  setupWithCustomServer(
    appId: string,
    baseUrl: string,
    brokerUrl: string,
    brokerLbUrl: string,
    syncInterval: number
  ): void

  // for event handler ------------------------------
  onMessageReceived(handler: (message: IQMessage) => void): Subscription
  onMessageDeleted(handler: (message: IQMessage) => void): Subscription
  onMessageDelivered(handler: (message: IQMessage) => void): Subscription
  onMessageRead(handler: (message: IQMessage) => void): Subscription
  onUserTyping(handler: (userId: string, roomId: number, isTyping: boolean) => void): Subscription
  onUserOnlinePresence(handler: (userId: string, isOnline: boolean, lastSeen: Date) => void): Subscription
  onChatRoomCleared(handler: (roomId: number) => void): Subscription
  onConnected(handler: () => void): Subscription
  onReconnecting(handler: () => void): Subscription
  onDisconnected(handler: () => void): Subscription
  subscribeChatRoom(room: IQRoom): void
  unsubscribeChatRoom(room: IQRoom): void
  subscribeUserOnlinePresence(userId: string): void
  unsubscribeUserOnlinePresence(userId: string): void
  // ------------------------------------------------

  // from UserAdapter -------------------------------
  setUser(
    userId: string,
    userKey: string,
    username: string,
    avatarUrl: string,
    extras: object,
    callback: IQCallback2<IQUser>
  ): void | Promise<IQUser>
  setUserWithIdentityToken(token: string, callback?: IQCallback2<IQUser>): void | Promise<IQUser>
  blockUser(userId: string, callback?: IQCallback2<IQUser>): void | Promise<IQUser>
  unblockUser(userId: string, callback?: IQCallback2<IQUser>): void | Promise<IQUser>
  getBlockedUsers(page?: number, limit?: number, callback?: IQCallback2<IQUser[]>): void | Promise<IQUser[]>
  getUserData(callback?: IQCallback2<IQUser>): void | Promise<IQUser>
  updateUser(
    username?: string,
    avatarUrl?: string,
    extras?: object,
    callback?: IQCallback2<IQUser>
  ): void | Promise<IQUser>
  getUsers(
    searchUsername?: string,
    page?: number,
    limit?: number,
    callback?: IQCallback2<IQUser[]>
  ): void | Promise<IQUser[]>
  // ------------------------------------------------

  // TODO: I'm not discussed yet
  clearUser(callback?: IQCallback2<void>): void

  // from RoomAdapter ----------
  chatUser(userId: string, extras: object, callback?: IQCallback2<IQRoom>): void | Promise<IQRoom>
  createGroupChat(
    name: string,
    userIds: string[],
    avatarUrl: string,
    extras: object,
    callback?: IQCallback2<IQRoom>
  ): void | Promise<IQRoom>
  createChannel(
    uniqueId: string,
    name: string,
    avatarUrl: string,
    extras: object,
    callback?: IQCallback2<IQRoom>
  ): void | Promise<IQRoom>
  getChannel(uniqueId: string, callback?: IQCallback2<IQRoom>): void | Promise<IQRoom>
  updateChatRoom(
    roomId: number,
    name: string,
    avatarUrl: string,
    extras: object,
    callback?: IQCallback2<IQRoom>
  ): void | Promise<IQRoom>
  addParticipants(
    roomId: number,
    userIds: string[],
    callback?: IQCallback2<IQParticipant[]>
  ): void | Promise<IQParticipant[]>
  removeParticipants(
    roomId: number,
    userIds: string[],
    callback?: IQCallback2<IQParticipant[]>
  ): void | Promise<IQParticipant[] | string[]>
  getChatRoomWithMessages(roomId: number, callback?: IQCallback2<IQRoom>): void | Promise<IQRoom>
  getChatRooms(
    roomIds: number[],
    page?: number,
    showRemoved?: boolean,
    showParticipant?: boolean,
    callback?: IQCallback2<IQRoom[]>
  ): void | Promise<IQRoom[]>
  getChatRooms(
    uniqueIds: string[],
    page?: number,
    showRemoved?: boolean,
    showParticipant?: boolean,
    callback?: IQCallback2<IQRoom[]>
  ): void | Promise<IQRoom[]>
  getAllChatRooms(
    showParticipant?: boolean,
    showRemoved?: boolean,
    showEmpty?: boolean,
    page?: number,
    limit?: number,
    callback?: IQCallback2<IQRoom[]>
  ): void | Promise<IQRoom[]>
  getParticipants(
    roomUniqueId: string,
    offset?: number,
    sorting?: 'asc' | 'desc' | null,
    callback?: IQCallback2<IQParticipant[]>
  ): void
  // ---------------------------

  // from MessageAdapter -----------------------------------
  sendMessage(roomId: number, message: IQMessageT, callback?: IQCallback2<IQMessage>): void | Promise<IQMessage>
  markAsRead(roomId: number, messageId: number, callback?: IQCallback2<IQMessage>): void | Promise<IQMessage>
  markAsDelivered(roomId: number, messageId: number, callback?: IQCallback2<IQMessage>): void | Promise<IQMessage>
  getPreviouseMessagesById(
    roomId: number,
    limit?: number,
    messageId?: number,
    callback?: IQCallback2<IQMessage[]>
  ): void | Promise<IQMessage[]>
  getNextMessagesById(
    roomId: number,
    limit?: number,
    messageId?: number,
    callback?: IQCallback2<IQMessage[]>
  ): void | Promise<IQMessage[]>
  deleteMessages(messageUniqueIds: string[], callback?: IQCallback2<IQMessage[]>): void | Promise<IQMessage[]>
  clearMessagesByChatRoomId(roomUniqueIds: string[], callback?: IQCallback2<IQRoom[]>): void | Promise<IQRoom[]>
  // -------------------------------------------------------

  // Misc -------------------------------------
  upload(file: File, callback?: IQProgressListener): void
  registerDeviceToken(token: string, isDevelopment: boolean, callback?: IQCallback2<boolean>): void | Promise<boolean>
  removeDeviceToken(token: string, isDevelopment: boolean, callback?: IQCallback2<boolean>): void | Promise<boolean>
  getJWTNonce(callback?: IQCallback2<string>): void | Promise<string>
  synchronize(lastMessageId: number): void
  synchronizeEvent(lastEventId: number): void
  getTotalUnreadCount(callback?: IQCallback2<number>): void | Promise<number>
  setSyncInterval(interval: number): void
  hasSetupUser(callback?: (isSetup: boolean) => void): void | Promise<boolean>
  getThumbnailURL(url: string): string
  sendFileMessage(
    roomId: number,
    message: string,
    file: File,
    callback: (error: Error, progress: number, message: IQMessage) => void
  ): void

  // ------------------------------------------
  publishTyping(roomId: number, isTyping?: boolean): void

  // from CustomEventAdapter
  publishCustomEvent(roomId: number, data: any): void
  subscribeCustomEvent(roomId: number, callback: IQCallback2<any>): void
  unsubscribeCustomEvent(roomId: number): void
}

export interface IQUserExtraProps {
  avatarUrl?: model.IQAccount['avatarUrl']
  name?: model.IQAccount['name']
  extras?: model.IQAccount['extras']
}

export interface IQUserAdapter {
  login(userId: string, userKey: string, extra: IQUserExtraProps): Promise<IQUser>
  clear(): void
  updateUser(name: string, avatarUrl: string, extras: string): Promise<IQUser>
  getNonce(): Promise<QNonce>
  setUserFromIdentityToken(token: string): Promise<IQUser>
  getUserList(query: string, page?: number, limit?: number): Promise<IQUser[]>
  getBlockedUser(page?: number, limit?: number): Promise<IQUser[]>
  blockUser(userId: string): Promise<IQUser>
  unblockUser(userId: string): Promise<IQUser>
  getUserData(): Promise<IQUser>
  registerDeviceToken(token: string, isDevelopment: boolean): Promise<boolean>
  unregisterDeviceToken(token: string, isDevelopment: boolean): Promise<boolean>

  readonly token: Derivable<string>
  readonly currentUser: Derivable<IQUser>
}

export interface IQUser {
  id: number
  userId: string
  displayName: string
  avatarUrl?: string | null
}

export type QNonce = { expired: number; nonce: string }

export enum IQRoomType {
  Group = 'group',
  Single = 'single',
}

export interface IQRoom {
  id: number
  name: string
  avatarUrl: string
  isChannel: boolean
  lastMessageId?: number
  lastMessageContent?: string
  uniqueId: string
  unreadCount: number
  type: IQRoomType
  totalParticipants?: number
  participants?: IQParticipant[]
  options?: string
  messages?: IQMessage[]
}

export interface IQParticipant extends IQUser {
  lastReadMessageId: number
  lastReceivedMessageId: number
}

export interface IQRoomAdapter {
  chatUser(userId: string, extras: any): Promise<IQRoom>
  getRoomList(
    showParticipant?: boolean,
    showRemoved?: boolean,
    showEmpty?: boolean,
    page?: number,
    limit?: number
  ): Promise<IQRoom[]>
  getRoom(roomId: number): Promise<IQRoom>
  getChannel(uniqueId: string, name?: string, avatarUrl?: string, extras?: string): Promise<IQRoom>
  updateRoom(roomId: number, name?: string | null, avatarUrl?: string | null, extras?: string | null): Promise<IQRoom>
  getParticipantList(roomId: string, offset?: number | null, sorting?: 'asc' | 'desc' | null): Promise<IQParticipant[]>
  createGroup(name: string, userIds: string[], avatarUrl?: string, extras?: string): Promise<IQRoom>
  removeParticipants(roomId: number, participantIds: string[]): Promise<IQParticipant[]>

  addParticipants(roomId: number, participantIds: string[]): Promise<IQParticipant[]>

  getRoomInfo(
    roomId?: number[],
    uniqueId?: string[],
    page?: number,
    showRemoved?: boolean,
    showParticipant?: boolean
  ): Promise<IQRoom[]>
  clearRoom(roomUniqueIds: string[]): Promise<IQRoom[]>
  getUnreadCount(): Promise<number>
  readonly rooms: Derivable<{ [key: string]: IQRoom }>
  readonly getRoomDataWithId: (roomId: number) => Lens<IQRoom>
  readonly getRoomDataWithUniqueId: (roomUniqueId: string) => Lens<IQRoom>
}

export type IQMessageT = {
  payload: object
  extras: object
  type: string
  message: string
}
export enum IQMessageStatus {
  Sending = 'sending',
  Sent = 'sent',
  Delivered = 'delivered',
  Read = 'read',
  Failed = 'failed',
}

export enum IQMessageType {
  Text = 'text',
  Custom = 'custom',
  Attachment = 'file_attachment',
  Reply = 'reply',
}

export interface IQMessage {
  id: number
  uniqueId: string
  roomId: number
  userId: string
  content: string
  previousMessageId: number
  extras: object
  payload: object
  timestamp: Date
  type: IQMessageType
  status: IQMessageStatus

  updateFromJson(json: PostCommentResponse.Comment): IQMessage
}

export interface IQMessageAdapter {
  readonly messages: Atom<{ [key: string]: IQMessage }>
  readonly getMessageDataWithId: (messageId: number) => Lens<IQMessage>
  sendMessage(roomId: number, message: IQMessageT): Promise<IQMessage>
  getMessages(roomId: number, lastMessageId?: number, limit?: number, after?: boolean): Promise<IQMessage[]>
  deleteMessage(messageUniqueIds: string[]): Promise<IQMessage[]>
  markAsRead(roomId: number, messageId: number): Promise<IQMessage>
  markAsDelivered(roomId: number, messageId: number): Promise<IQMessage>
}

export type UploadResult = {
  results: {
    file: {
      name: string
      pages: number
      size: number
      url: string
    }
  }
  status: number
}

export interface IAppConfig {
  baseUrl: string
  brokerLbUrl: string
  brokerUrl: string
  enableEventReport: boolean
  enableRealtime: boolean
  enableRealtimeCheck: boolean
  extras: Record<string, any>
  syncInterval: number
  syncOnConnect: number
}
