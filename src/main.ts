import pipe from 'callbag-pipe'
import fromPromise from 'callbag-from-promise'
import flatten from 'callbag-flatten'
import getUserAdapter, { IQUser, IQUserAdapter, IQUserExtraProps, QNonce } from './adapters/user'
import getMessageAdapter, { IQMessage, IQMessageAdapter, IQMessageT } from './adapters/message'
import getRoomAdapter, { IQParticipant, IQRoom, IQRoomAdapter } from './adapters/room'
import getRealtimeAdapter, { IQRealtimeAdapter } from './adapters/realtime'
import getHttpAdapter, { IQHttpAdapter } from './adapters/http'
import combine from './utils/callbag-combine'
import {
  process,
  isReqString,
  isOptString,
  isOptJson,
  toCallbackOrPromise,
  isOptCallback,
  safeMap, isOptNumber, isReqNumber, isReqArrayNumber, isReqArrayString, isOptBoolean, isReqJson
} from './utils/callbag'

export type IQCallback<T> = (response: T, error?: Error) => void

export type IQInitOptions = {
  appId: string
  baseUrl: string
  brokerUrl: string
  syncMode: 'socket' | 'http' | 'both'
  syncInterval: number
}

export type IQProgressListener = (error: Error, progress: ProgressEvent, url: string) => void

export interface IQiscus {
  init(appId: string, syncInterval: number): void
  initWithCustomServer(appId: string, baseUrl: string, brokerUrl: string, brokerLbUrl: string, syncInterval: number): void

  // from UserAdapter -------------------------------
  setUser(userId: string, userKey: string, username: string, avatarUrl: string, extras: object, callback: IQCallback<IQUser>): void | Promise<IQUser>
  setUserWithIdentityToken(token: string, callback?: IQCallback<IQUser>): void | Promise<IQUser>
  blockUser(userId: string, callback?: IQCallback<IQUser>): void | Promise<IQUser>
  unblockUser(userId: string, callback?: IQCallback<IQUser>): void | Promise<IQUser>
  getBlockedUserList(page?: number, limit?: number, callback?: IQCallback<IQUser[]>): void | Promise<IQUser[]>
  getUserData(callback?: IQCallback<IQUser>): void | Promise<IQUser>
  updateUser(username?: string, avatarUrl?: string, extras?: object, callback?: IQCallback<IQUser>): void | Promise<IQUser>
  getUserList(searchUsername?: string, page?: number, limit?: number, callback?: IQCallback<IQUser[]>): void | Promise<IQUser[]>

  // ------------------------------------------------

  // TODO: I'm not discussed yet
  clearUser(callback?: IQCallback<void>): void

  // from RoomAdapter ----------
  chatUser(userId: string, avatarUrl: string, extras: object, callback?: IQCallback<IQRoom>): void | Promise<IQRoom>
  createGroupChat(name: string, userIds: string[], avatarUrl: string, extras: object, callback?: IQCallback<IQRoom>): void | Promise<IQRoom>
  createChannel(uniqueId: string, name: string, avatarUrl: string, extras: object, callback?: IQCallback<IQRoom>): void | Promise<IQRoom>
  updateChatRoom(roomId: number, name: string, avatarUrl: string, extras: object, callback?: IQCallback<IQRoom>): void | Promise<IQRoom>
  addParticipants(roomId: number, userIds: string[], callback?: IQCallback<IQParticipant[]>): void | Promise<IQParticipant[]>
  removeParticipants(roomId: number, userIds: string[], callback?: IQCallback<IQParticipant[]>): void | Promise<IQParticipant[]>
  getChatRoomWithMessages(roomId: number, callback?: IQCallback<IQRoom>): void | Promise<IQRoom>
  getChatRoom(roomId: number, uniqueId: number, page?: number, showRemoved?: boolean, showParticipant?: boolean, callback?: IQCallback<IQRoom>): void | Promise<IQRoom>
  getChatRooms(showParticipant?: boolean, showRemoved?: boolean, showEmpty?: boolean, page?: number, limit?: number, callback?: IQCallback<IQRoom[]>): void | Promise<IQRoom[]>
  getParticipantList(roomId: number, offset?: number, sorting?: 'asc' | 'desc' | null, callback?: IQCallback<IQParticipant[]>): void
  // ---------------------------

  // from MessageAdapter -----------------------------------
  sendMessage(roomId: number, message: IQMessageT, callback?: IQCallback<IQMessage>): void | Promise<IQMessage>
  markAsRead(roomId: number, messageId: number, callback?: IQCallback<IQMessage>): void | Promise<IQMessage>
  markAsDelivered(roomId: number, messageId: number, callback?: IQCallback<IQMessage>): void | Promise<IQMessage>
  getPreviouseMessagesById(roomId: number, limit?: number, messageId?: number, callback?: IQCallback<IQMessage[]>): void | Promise<IQMessage[]>
  getNextMessagesById(roomId: number, limit?: number, messageId?: number, callback?: IQCallback<IQMessage[]>): void | Promise<IQMessage[]>
  deleteMessages(messageUniqueIds: string[], callback?: IQCallback<IQMessage[]>): void | Promise<IQMessage[]>
  clearMessagesByChatRoomId(roomIds: number[], callback?: IQCallback<IQRoom[]>): void | Promise<IQRoom[]>
  // -------------------------------------------------------

  // Misc -------------------------------------
  upload(file: File, callback?: IQProgressListener): void
  registerDeviceToken(token: string, callback?: IQCallback<boolean>): void | Promise<boolean>
  removeDeviceToken(token: string, callback?: IQCallback<boolean>): void | Promise<boolean>
  getJWTNonce(callback?: IQCallback<string>): void | Promise<string>
  synchronize(lastMessageId: number): void
  syncrhronizeEvent(lastEventId: number): void
  getTotalUnreadCount(callback?: IQCallback<number>): void | Promise<number>

  // ------------------------------------------
  setTyping(isTyping?: boolean): void

  // from CustomEventAdapter
  publishEvent(eventId: string, data: any): void
  subscribeEvent(eventId: string, callback: IQCallback<any>): void
  unsubscribeEvent(eventId): void
}

export default class Qiscus implements IQiscus {
  private realtimeAdapter: IQRealtimeAdapter
  private httpAdapter: IQHttpAdapter
  private userAdapter: IQUserAdapter
  private roomAdapter: IQRoomAdapter
  private messageAdapter: IQMessageAdapter

  public appId: string = null
  private syncMode: string = 'socket'
  private baseUrl: string = null
  private brokerUrl: string = null
  private syncInterval: number = null
  private static _instance: Qiscus = null

  public static get instance(): Qiscus {
    if (this._instance == null) this._instance = new this();
    return this._instance;
  }

  init(appId: string, syncInterval: number = 5000): void {
    this.initWithCustomServer(
      appId,
      'https://api.qiscus.com/api/v2/sdk/',
      'wss://mqtt.qiscus.com:1886/mqtt',
      null,
      syncInterval
    )
  }
  initWithCustomServer(appId: string, baseUrl: string, brokerUrl: string, brokerLBUrl: string, syncInterval: number = 5000): void {
    this.appId = appId
    this.baseUrl = baseUrl
    this.brokerUrl = brokerUrl
    this.syncMode = 'socket'
    this.syncInterval = syncInterval || 5000
    this.syncMode = 'socket'
    this.httpAdapter = getHttpAdapter({
      baseUrl: this.baseUrl,
      getAppId: () => this.appId,
      getToken: () => this.token,
      getUserId: () => this.userAdapter.currentUserId,
      getSdkVersion: () => '3-beta'
    })
    this.userAdapter = getUserAdapter(() => this.httpAdapter)
    this.roomAdapter = getRoomAdapter(() => this.httpAdapter, () => this.userAdapter)
    this.messageAdapter = getMessageAdapter(() => this.httpAdapter, () => this.userAdapter, () => this.roomAdapter)
    this.realtimeAdapter = getRealtimeAdapter(this.syncInterval, {
      brokerUrl: () => this.brokerUrl,
      http: () => this.httpAdapter,
      user: () => this.userAdapter,
      // TODO: Only sync when user are logged in
      shouldSync: () => true
    })
  }

  // User Adapter ------------------------------------------
  setUser(userId: string, userKey: string, username: string, avatarUrl: string, extras: object | null, callback: null | IQCallback<IQUser>): void | Promise<IQUser> {
    return pipe(
      combine(
        process(userId, isReqString('`userId` are required and need to be string')),
        process(userKey, isReqString('`userKey` are required and need to be string')),
        process(username, isOptString('`username` need to be string or null')),
        process(avatarUrl, isOptString('`avatarUrl` need to be string or null')),
        process(extras, isOptJson('`extras` need to be object or null'))
      ),
      safeMap(([ userId, userKey, username, avatarUrl, extras ]) => [userId, userKey, username, avatarUrl, JSON.stringify(extras)]),
      map(([userId, userKey, username, avatarUrl, extras]) =>
        fromPromise(this.userAdapter.login(userId, userKey, { name: username, avatarUrl, extras }))
      ),
      flatten,
      toCallbackOrPromise(callback)
    )
  }
  blockUser(userId: string, callback: IQCallback<IQUser>): void | Promise<IQUser> {
    return pipe(
      combine(
        process(userId, isReqString('`userId` required and need to be string')),
        process(callback, isOptCallback('`callback` need to be a function or null'))
      ),
      map(([userId]) =>
        fromPromise(this.userAdapter.blockUser(userId))
      ),
      flatten,
      toCallbackOrPromise(callback)
    )
  }
  clearUser(callback: IQCallback<void>): void | Promise<void> {
    return pipe(
      combine(process(callback, isOptCallback('`callback` need to be function or null'))),
      map(() => fromPromise(Promise.resolve(this.userAdapter.clear()))),
      flatten,
      toCallbackOrPromise(callback)
    )
  }
  unblockUser(userId: string, callback?: IQCallback<IQUser>): void | Promise<IQUser> {
    return pipe(
      combine(
        process(userId, isReqString('`userId` required and need to be string')),
        process(callback, isOptCallback('`callback` need to be function or null'))
      ),
      map(([userId]) => fromPromise(this.userAdapter.unblockUser(userId))),
      flatten,
      toCallbackOrPromise(callback)
    )
  }
  updateUser(username: string, avatarUrl: string,  extras?: object, callback?: IQCallback<IQUser>): void | Promise<IQUser> {
    return pipe(
      combine(
        process(username, isOptString('`username` need to be string or null')),
        process(avatarUrl, isOptString('`avatarUrl` need to be string or null')),
        process(extras, isOptJson('`extras` need to be object or null')),
        process(callback, isOptCallback('`callback` need to be function or null'))
      ),
      safeMap(([username, avatarUrl, extras]) => [username, avatarUrl, JSON.stringify(extras)]),
      map(([username, avatarUrl, extras]) =>
        fromPromise(this.userAdapter.updateUser(username, avatarUrl, extras ))
      ),
      flatten,
      toCallbackOrPromise(callback)
    )
  }
  getBlockedUserList(page?: number, limit?: number, callback?: IQCallback<IQUser[]>): void | Promise<IQUser[]> {
    return pipe(
      combine(
        process(page, isOptNumber('`page` need to be number or null')),
        process(limit, isOptNumber('`limit` need to be number or null')),
        process(callback, isOptCallback('`callback` need to be function or null'))
      ),
      map(([page, limit]) => fromPromise(this.userAdapter.getBlockedUser(page, limit))),
      flatten,
      toCallbackOrPromise(callback)
    )
  }
  getUserList(searchUsername?: string, page?: number, limit?: number, callback?: IQCallback<IQUser[]>): void | Promise<IQUser[]> {
    return pipe(
      combine(
        process(searchUsername, isOptString('`searchUsername` need to be string or null')),
        process(page, isOptString('`page` need to be number or null')),
        process(limit, isOptString('`limit` need to be number or null')),
        process(callback, isOptString('`callback` need to be function or null')),
      ),
      map(([search, page, limit]) =>
        fromPromise(this.userAdapter.getUserList(search, page, limit))
      ),
      flatten,
      toCallbackOrPromise(callback)
    )
  }
  getJWTNonce (callback?: IQCallback<string>): void | Promise<string> {
    return pipe(
      process(callback, isOptCallback('`callback` need to be function or null')),
      map(() => fromPromise(this.userAdapter.getNonce())),
      flatten,
      toCallbackOrPromise(callback)
    )
  }
  getUserData (callback?: (response: IQUser, error?: Error) => void): void | Promise<IQUser> {
    return pipe(
      process(callback, isOptCallback('`callback` need to be function or null')),
      map(() => fromPromise(this.userAdapter.getUserData())),
      flatten,
      toCallbackOrPromise(callback)
    )
  }
  registerDeviceToken (token: string, callback?: IQCallback<boolean>): void | Promise<boolean> {
    return pipe(
      combine(
        process(token, isReqString('`token` need to be string')),
        process(callback, isOptCallback('`callback` need to be function or null'))
      ),
      map(([token]) =>
        fromPromise(this.userAdapter.registerDeviceToken(token))
      ),
      flatten,
      toCallbackOrPromise(callback)
    )
  }
  removeDeviceToken (token: string, callback?: IQCallback<boolean>): void | Promise<boolean> {
    return pipe(
      combine(
        process(token, isReqString('`token` need to be string')),
        process(callback, isOptCallback('`callback` need to be function or null'))
      ),
      map(([token]) =>
        fromPromise(this.userAdapter.unregisterDeviceToken(token))
      ),
      flatten,
      toCallbackOrPromise(callback)
    )
  }
  updateChatRoom (roomId: number, name?: string | null, avatarUrl?: string | null, extras?: object | null, callback?: (response: IQRoom, error?: Error) => void): void | Promise<IQRoom> {
    return pipe(
      combine(
        process(roomId, isReqNumber('`roomId` need to be number')),
        process(name, isOptString('`name` need to be string or null')),
        process(avatarUrl, isOptString('`avatarUrl` need to be string or null')),
        process(extras, isOptJson('`extras` need to be object or null')),
        process(callback, isOptCallback('`callback` need to be function or null'))
      ),
      safeMap(([roomId, name, avatarUrl, extras]) => [roomId, name, avatarUrl, JSON.stringify(extras)]),
      map(([roomId, name, avatarUrl, extras]) =>
        fromPromise(this.roomAdapter.updateRoom(roomId, name, avatarUrl, extras))
      ),
      flatten,
      toCallbackOrPromise(callback)
    )
  }
  setUserWithIdentityToken (token: string, callback?: (response: IQUser, error?: Error) => void): void | Promise<IQUser> {
    return pipe(
      combine(
        process(token, isReqString('`token` need to be string')),
        process(callback, isOptCallback('`callback` need to be function or null'))
      ),
      map(([token]) =>
        fromPromise(this.userAdapter.setUserFromIdentityToken(token))
      ),
      flatten,
      toCallbackOrPromise(callback)
    )
  }
  // -------------------------------------------------------

  // Room Adapter ------------------------------------------
  chatUser(userId: string, avatarUrl: string, extras: object, callback?: IQCallback<IQRoom>): void | Promise<IQRoom> {
    return pipe(
      combine(
        process(userId, isReqString('`userId` need to be string')),
        process(avatarUrl, isOptString('`avatarUrl` need to be string or null')),
        process(extras, isOptJson('`extras` need to be object or null')),
        process(callback, isOptCallback('`callback` need to be function or null'))
      ),
      map(([userId, avatarUrl, extras]) => ([ userId, avatarUrl, JSON.stringify(extras) ])),
      map(([userId, avatarUrl, extras]) => fromPromise(this.roomAdapter.chatUser(userId, avatarUrl, extras))),
      flatten,
      toCallbackOrPromise(callback)
    )
  }
  addParticipants(roomId: number, userIds: string[], callback?: IQCallback<any>): void | Promise<IQParticipant[]> {
    return pipe(
      combine(
        process(roomId, isReqNumber('`roomId` need to be number')),
        process(userIds, isReqArrayString('`userIds` need to be array of string')),
        process(callback, isOptCallback('`callback` need to be function or null'))
      ),
      map(([roomId, userIds]) => fromPromise(this.roomAdapter.addParticipants(roomId, userIds))),
      flatten,
      toCallbackOrPromise(callback)
    )
  }
  clearMessagesByChatRoomId (roomIds: number[], callback?: IQCallback<IQRoom[]>): void | Promise<IQRoom[]> {
    return pipe(
      combine(process(roomIds, isReqArrayNumber('`roomIds` need to be array of number'))),
      map(([roomIds]) => fromPromise(this.roomAdapter.clearRoom(roomIds))),
      flatten,
      toCallbackOrPromise(callback)
    )
  }
  createGroupChat (name: string, userIds: string[], avatarUrl: string, extras: object, callback?: IQCallback<IQRoom>): void | Promise<IQRoom> {
    return pipe(
      combine(
        process(name, isReqString('`name` need to be string')),
        process(userIds, isReqArrayString('`userIds` need to be array of string')),
        process(avatarUrl, isReqString('`avatarUrl` need to be string')),
        process(extras, isReqString('`extras` need to be object')),
        process(callback, isOptCallback('`callback` need to be function or null'))
      ),
      safeMap(([name, userIds, avatarUrl, extras]) => [name, userIds, avatarUrl, JSON.stringify(extras)]),
      map(([name, userIds, avatarUrl, extras]) =>
        fromPromise(this.roomAdapter.createGroup(name, userIds, avatarUrl, extras))
      ),
      flatten,
      toCallbackOrPromise(callback)
    )
  }
  createChannel (uniqueId: string, name: string, avatarUrl: string, extras: object, callback?: IQCallback<IQRoom>): void | Promise<IQRoom> {
    return pipe(
      combine(
        process(uniqueId, isReqString('`uniqueId` need to be string')),
        process(name, isReqString('`name` need to be string')),
        process(avatarUrl, isOptString('`avatarUrl` need to be string or null')),
        process(extras, isOptJson('`extras` need to be object or null')),
        process(callback, isOptCallback('`callback` need to be function or null'))
      ),
      map(([uniqueId, name, avatarUrl, extras]) =>
        fromPromise(this.roomAdapter.getChannel(uniqueId, name, avatarUrl, extras))
      ),
      flatten,
      toCallbackOrPromise(callback)
    )
  }
  getParticipantList (roomId: number, offset?: number, sorting?: 'asc' | 'desc' | null, callback?: IQCallback<IQParticipant[]>): void | Promise<IQParticipant[]> {
    return pipe(
      combine(
        process(roomId, isReqNumber('`roomId` need to be number')),
        process(offset, isOptNumber('`offset` need to be number or null')),
        process(sorting, isOptString('`sorting` need to be `asc`, `desc`, or null')),
        process(callback, isOptCallback('`callback` need to be function or null'))
      ),
      map(([roomId, offset, sorting]) =>
        fromPromise(this.roomAdapter.getParticipantList(roomId, offset, sorting))
      ),
      flatten,
      toCallbackOrPromise(callback)
    )
  }
  getChatRoom (roomId: number, uniqueId: number, page?: number, showRemoved?: boolean, showParticipant?: boolean, callback?: IQCallback<IQRoom>): void | Promise<IQRoom> {
    return pipe(
      combine(
        process(roomId, isReqNumber('`roomId` need to be number')),
        process(uniqueId, isReqString('`uniqueId` need to be string')),
        process(page, isOptNumber('`page` need to be number or null')),
        process(showRemoved, isOptBoolean('`showRemoved` need to be boolean or null')),
        process(showParticipant, isOptBoolean('`showParticipant` need to be boolean or null')),
        process(callback, isOptCallback('`callback` need to be function or null'))
      ),
      map(([roomId, uniqueId, page, showRemoved, showParticipant]) =>
        fromPromise(this.roomAdapter.getRoomInfo(roomId, uniqueId, page, showRemoved, showParticipant))
      ),
      flatten,
      toCallbackOrPromise(callback)
    )
  }
  getChatRooms (showParticipant?: boolean, showRemoved?: boolean, showEmpty?: boolean, page?: number, limit?: number, callback?: IQCallback<IQRoom[]>): void | Promise<IQRoom[]> {
    return pipe(
      combine(
        process(showParticipant, isOptBoolean('`showParticipant` need to be boolean or null')),
        process(showRemoved, isOptBoolean('`showRemoved` need to be boolean or null')),
        process(showEmpty, isOptBoolean('`showEmpty` need to be boolean or null')),
        process(page, isOptNumber('`page` need to be number or null')),
        process(limit, isOptNumber('`limit` need to be number or null')),
        process(callback, isOptCallback('`callback` need to be function or  null'))
      ),
      map(([showParticipant, showRemoved, showEmpty, page, limit]) =>
        fromPromise(this.roomAdapter.getRoomList(showParticipant, showRemoved, showEmpty, page, limit))
      ),
      flatten,
      toCallbackOrPromise(callback)
    )
  }
  getChatRoomWithMessages (roomId: number, callback?: IQCallback<IQRoom>): void | Promise<IQRoom> {
    return pipe(
      combine(
        process(roomId, isReqNumber('`roomId` need to be number')),
        process(callback, isOptCallback('`callback` need to be function or null'))
      ),
      map(([roomId]) => fromPromise(this.roomAdapter.getRoom(roomId))),
      flatten,
      toCallbackOrPromise(callback)
    )
  }
  getTotalUnreadCount (callback?: IQCallback<number>): void | Promise<number> {
    return pipe(
      process(callback, isOptCallback('`callback` need to be function or null')),
      map(() => fromPromise(this.roomAdapter.getUnreadCount())),
      flatten,
      toCallbackOrPromise(callback)
    )
  }
  // ------------------------------------------------------

  // Message Adapter --------------------------------------
  sendMessage (roomId: number, message: IQMessageT, callback?: IQCallback<IQMessage>): void | Promise<IQMessage> {
    return pipe(
      combine(
        process(roomId, isReqNumber('`roomId` need to be number')),
        process(message, isReqJson('`message` need to be object')),
        process(callback, isOptCallback('`callback` need to be function or null'))
      ),
      map(([roomId, message]) =>
        fromPromise(this.messageAdapter.sendMessage(roomId, message))
      ),
      flatten,
      toCallbackOrPromise(callback)
    )
  }
  markAsDelivered (roomId: number, messageId: number, callback?: IQCallback<IQMessage>): void | Promise<IQMessage> {
    return pipe(
      combine(
        process(roomId, isReqNumber('`roomId` need to be number')),
        process(messageId, isReqNumber('`messageId` need to be number')),
        process(callback, isOptCallback('`callback` need to be function or null'))
      ),
      map(([roomId, messageId]) =>
        fromPromise(this.messageAdapter.markAsRead(roomId, messageId))
      ),
      flatten,
      toCallbackOrPromise(callback)
    )
  }
  markAsRead (roomId: number, messageId: number, callback?: IQCallback<IQMessage>): void | Promise<IQMessage> {
    return pipe(
      combine(
        process(roomId, isReqNumber('`roomId` need to be number')),
        process(messageId, isReqNumber('`messageId` need to be number'))
      ),
      map(([roomId, messageId]) =>
        fromPromise(this.messageAdapter.markAsRead(roomId, messageId))
      ),
      flatten,
      toCallbackOrPromise(callback)
    )
  }
  deleteMessages(messageUniqueIds: string[], callback?: IQCallback<IQMessage[]>): void | Promise<IQMessage[]> {
    return pipe(
      combine(
        process(messageUniqueIds, isReqArrayString('`messageUniqueIds` need to be array of string')),
        process(callback, isOptCallback('`callback` need to be function or null'))
      ),
      map(([messageUniqueIds]) => fromPromise(this.messageAdapter.deleteMessage(messageUniqueIds))),
      flatten,
      toCallbackOrPromise(callback)
    )
  }
  getPreviouseMessagesById (roomId: number, limit?: number, messageId?: number, callback?: IQCallback<IQMessage[]>): void | Promise<IQMessage[]> {
    return pipe(
      combine(
        process(roomId, isReqNumber('`roomId` need to be number')),
        process(limit, isOptNumber('`limit` need to be number or null')),
        process(messageId, isOptNumber('`messageId` need to be number or null')),
        process(callback, isOptCallback('`callback` need to be function or null')),
      ),
      map(([roomId, limit, messageId]) =>
        fromPromise(this.messageAdapter.getMessages(roomId, messageId, limit, false))
      ),
      flatten,
      toCallbackOrPromise(callback)
    )
  }
  getNextMessagesById (roomId: number, limit?: number, messageId?: number, callback?: IQCallback<IQMessage[]>): void | Promise<IQMessage[]> {
    return pipe(
      combine(
        process(roomId, isReqNumber('`roomId` need to be number')),
        process(limit, isOptNumber('`limit` need to be number or null')),
        process(messageId, isOptNumber('`limit` need to be number or null')),
        process(callback, isOptCallback('`callback` need to be function or null'))
      ),
      map(([roomId, limit, messageId]) =>
        fromPromise(this.messageAdapter.getMessages(roomId, messageId, limit, true))
      ),
      flatten,
      toCallbackOrPromise(callback)
    )
  }
  // -------------------------------------------------------

  // Misc --------------------------------------------------
  publishEvent(eventId: string, data: any): void {}
  removeParticipants(roomId: number, participantIds: string[], callback?: IQCallback<any>): void {}
  setTyping(isTyping?: boolean): void {}
  subscribeEvent(eventId: string, callback: IQCallback<any>): void {}
  unsubscribeEvent(eventId): void {}
  upload(file: File, callback?: IQProgressListener): void {}
  synchronize (lastMessageId: number): void {
    this.realtimeAdapter.synchronize(lastMessageId)
  }
  syncrhronizeEvent (lastEventId: number): void {
    this.realtimeAdapter.synchronizeEvent(lastEventId)
  }
  // ------------------------------------------------------

  private get token() {
    if (this.userAdapter == null) return null
    return this.userAdapter.token
  }
  private get currentUser() {
    if (this.userAdapter == null) return null
    return this.userAdapter.currentUser
  }
}
