import { Atom, atom } from 'derivable'
import xs from 'xstream'
import getHttpAdapter, { IQHttpAdapter } from './adapters/http'
import { getLogger, ILogger } from './adapters/logger'
import getMessageAdapter, { MessageAdapter } from './adapters/message'
import getRealtimeAdapter, { RealtimeAdapter } from './adapters/realtime'
import getRoomAdapter, { RoomAdapter } from './adapters/room'
import getUserAdapter from './adapters/user'
import {
  Callback,
  IQCallback,
  IQMessage,
  IQMessageStatus,
  IQMessageT,
  IQMessageType,
  IQParticipant,
  IQProgressListener,
  IQUser,
  Subscription,
  UploadResult,
} from './defs'
import {
  isArrayOfNumber,
  isArrayOfString,
  isOptBoolean,
  isOptCallback,
  isOptJson,
  isOptNumber,
  isOptString,
  isReqArrayOfStringOrNumber,
  isReqArrayString,
  isReqJson,
  isReqNumber,
  isReqString,
} from './utils/param-utils'
import {
  bufferUntil,
  process,
  subscribeOnNext,
  tap,
  toCallbackOrPromise,
  toEventSubscription,
} from './utils/stream'
import { storageFactory } from './storage'
import * as model from './model'

export type QSyncMode = 'socket' | 'http' | 'both'

export default class Qiscus {
  private static _instance: Qiscus = null

  private storage = storageFactory()

  // region Property
  private readonly _syncMode: Atom<QSyncMode> = atom('socket')

  private readonly _realtimeAdapter: Atom<RealtimeAdapter | null> = atom(null)
  private readonly _loggerAdapter: Atom<ILogger> = atom(null)
  private readonly _httpAdapter: Atom<IQHttpAdapter | null> = atom(null)
  private readonly _userAdapter: Atom<ReturnType<typeof getUserAdapter> | null> = atom(
    null)
  private readonly _roomAdapter: Atom<RoomAdapter | null> = atom(null)
  private readonly _messageAdapter: Atom<MessageAdapter | null> = atom(null)
  private readonly _syncInterval: Atom<number> = atom(5000)
  private readonly _baseUrl: Atom<string> = atom(null)
  private readonly _brokerUrl: Atom<string | null> = atom(null)
  private readonly _appId: Atom<string> = atom(null)
  private readonly _shouldSync = atom(false)
  private readonly _customHeaders = atom<{ [key: string]: string }>(null)
  // endregion

  public static get instance (): Qiscus {
    if (this._instance == null) this._instance = new this()
    return this._instance
  }

  // region helpers
  public get httpAdapter () {
    return this._httpAdapter.get()
  }
  public get realtimeAdapter () {
    return this._realtimeAdapter.get()
  }
  public get userAdapter () {
    return this._userAdapter.get()
  }
  public get roomAdapter () {
    return this._roomAdapter.get()
  }
  public get messageAdapter () {
    return this._messageAdapter.get()
  }
  public get appId () {
    return this.storage.getAppId()
  }
  public get token () {
    return this.storage.getToken()
  }
  public get isLogin () {
    return this.currentUser != null
  }
  public get currentUser () {
    return this.storage.getCurrentUser()
  }
  // endregion

  setup (appId: string, syncInterval: number = 5000): void {
    this.setupWithCustomServer(
      appId,
      'https://api.qiscus.com/api/v2/sdk/',
      'wss://realtime-bali.qiscus.com:1886/mqtt',
      'https://realtime.qiscus.com',
      syncInterval,
    )
  }

  setupWithCustomServer (
    appId: string,
    baseUrl: string,
    brokerUrl: string,
    brokerLbUrl: string,
    syncInterval: number = 5000,
  ): void {
    this._loggerAdapter.set(getLogger())
    const defaultBaseUrl = this.storage.getBaseUrl()
    const defaultBrokerUrl = this.storage.getBrokerUrl()
    const defaultBrokerLbUrl = this.storage.getBrokerLbUrl()

    // We need to disable realtime load balancing if user are using custom server
    // and did not provide a brokerLbUrl
    const isDifferentBaseUrl = baseUrl !== defaultBaseUrl
    const isDifferentBrokerUrl = brokerUrl !== defaultBrokerUrl
    const isDifferentBrokerLbUrl = brokerLbUrl !== defaultBrokerLbUrl
    // disable realtime lb if user change baseUrl or mqttUrl but did not change
    // broker lb url
    if ((isDifferentBaseUrl || isDifferentBrokerUrl) &&
      !isDifferentBrokerLbUrl) {
      this._loggerAdapter.get().log('' +
        'force disable load balancing for realtime server, because ' +
        '`baseUrl` or `brokerUrl` get changed but ' +
        'did not provide `brokerLbURL`',
      )
      this.storage.setBrokerLbEnabled(false)
    }

    this.storage.setAppId(appId)
    this.storage.setBaseUrl(baseUrl)
    this.storage.setBrokerUrl(brokerUrl)
    this.storage.setBrokerLbUrl(brokerLbUrl)
    this.storage.setSyncInterval(syncInterval)
    this.storage.setDebugEnabled(false)
    this.storage.setVersion('3-alpha')
    this.storage.setSyncInterval(5000)

    this._httpAdapter.set(
      getHttpAdapter({
        baseUrl: this._baseUrl.get(),
        httpHeader: this._customHeaders,
        getAppId: () => this.appId,
        getToken: () => this.token,
        getUserId: () => (this.currentUser ? this.currentUser.id : null),
        getSdkVersion: () => '3-alpha',
      }),
    )
    this._userAdapter.set(getUserAdapter(this.storage))
    this._roomAdapter.set(getRoomAdapter(this.storage))
    this._messageAdapter.set(getMessageAdapter(this.storage))
    this._realtimeAdapter.set(getRealtimeAdapter(this.storage))
  }

  setCustomHeader (headers: { [key: string]: string }): void {
    this._customHeaders.set(headers)
  }

  // User Adapter ------------------------------------------
  setUser (
    userId: string,
    userKey: string,
    username?: string,
    avatarUrl?: string,
    extras?: object | null,
    callback?: null | IQCallback<model.IQAccount>,
  ): void | Promise<model.IQAccount> {
    // this method should set currentUser and token
    return xs
      .combine(
        process(userId, isReqString({ userId })),
        process(userKey, isReqString({ userKey })),
        process(username, isOptString({ username })),
        process(avatarUrl, isOptString({ avatarUrl })),
        process(extras, isOptJson({ extras })),
        process(callback, isOptCallback({ callback })),
      )
      .map(([userId, userKey, username, avatarUrl, extras]) =>
        xs.fromPromise(
          this.userAdapter.login(userId, userKey, {
            name: username,
            avatarUrl,
            extras,
          } as { name: string, avatarUrl: string, extras: any }),
        ),
      )
      .flatten()
      .compose(
        tap((it: model.IQAccount) => {
          this.realtimeAdapter.mqtt.conneck()
          this.realtimeAdapter.mqtt.subscribeUser(this.storage.getToken())
        }),
      )
      .compose(toCallbackOrPromise(callback))
  }

  blockUser (
    userId: string,
    callback: IQCallback<model.IQUser>): void | Promise<model.IQUser> {
    return xs
      .combine(
        process(userId, isReqString({ userId })),
        process(callback, isOptCallback({ callback })),
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([userId]) => xs.fromPromise(this.userAdapter.blockUser(userId)))
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }

  clearUser (callback: IQCallback<void>): void | Promise<void> {
    // this method should clear currentUser and token
    return xs
      .combine(process(callback, isOptCallback({ callback })))
      .map(() => xs.fromPromise(Promise.resolve(this.userAdapter.clear())))
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }

  unblockUser (
    userId: string, callback?: IQCallback<model.IQUser>): void | Promise<model.IQUser> {
    return xs
      .combine(
        process(userId, isReqString({ userId })),
        process(callback, isOptCallback({ callback })),
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([userId]) => xs.fromPromise(this.userAdapter.unblockUser(userId)))
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }

  updateUser (
    username: string,
    avatarUrl: string,
    extras?: object,
    callback?: IQCallback<model.IQUser>,
  ): void | Promise<model.IQUser> {
    // this method should update current user
    return xs
      .combine(
        process(username, isOptString({ username })),
        process(avatarUrl, isOptString({ avatarUrl })),
        process(extras, isOptJson({ extras })),
        process(callback, isOptCallback({ callback })),
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([username, avatarUrl, extras]) =>
        xs.fromPromise(this.userAdapter.updateUser(username, avatarUrl, extras as any))
      )
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }

  getBlockedUsers (
    page?: number,
    limit?: number,
    callback?: IQCallback<model.IQUser[]>,
  ): void | Promise<model.IQUser[]> {
    return xs
      .combine(
        process(page, isOptNumber({ page })),
        process(limit, isOptNumber({ limit })),
        process(callback, isOptCallback({ callback })),
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([page, limit]) => xs.fromPromise(
        this.userAdapter.getBlockedUser(page, limit)))
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }

  getUsers (
    searchUsername?: string,
    page?: number,
    limit?: number,
    callback?: IQCallback<model.IQUser[]>,
  ): void | Promise<model.IQUser[]> {
    return xs
      .combine(
        process(searchUsername, isOptString({ searchUsername })),
        process(page, isOptNumber({ page })),
        process(limit, isOptString({ limit })),
        process(callback, isOptCallback({ callback })),
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([search, page, limit]) =>
        xs.fromPromise(this.userAdapter.getUserList(search, page, limit)),
      )
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }

  getJWTNonce (callback?: IQCallback<string>): void | Promise<string> {
    return xs
      .combine(process(callback, isOptCallback({ callback })))
      .map(() => xs.fromPromise(this.userAdapter.getNonce()))
      .flatten()
      .map(nonce => nonce)
      .compose(toCallbackOrPromise(callback))
  }

  getUserData (callback?: IQCallback<model.IQUser>): void | Promise<model.IQUser> {
    return xs
      .combine(process(callback, isOptCallback({ callback })))
      .compose(bufferUntil(() => this.isLogin))
      .map(() => xs.fromPromise(this.userAdapter.getUserData()))
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }

  registerDeviceToken (
    token: string,
    isDevelopment: boolean,
    callback?: IQCallback<boolean>,
  ): void | Promise<boolean> {
    return xs
      .combine(
        process(token, isReqString({ token })),
        process(isDevelopment, isOptBoolean({ isDevelopment })),
        process(callback, isOptCallback({ callback })),
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([token, isDevelopment]) =>
        xs.fromPromise(
          this.userAdapter.registerDeviceToken(token, isDevelopment)),
      )
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }

  removeDeviceToken (
    token: string,
    isDevelopment: boolean,
    callback?: IQCallback<boolean>,
  ): void | Promise<boolean> {
    return xs
      .combine(
        process(token, isReqString({ token })),
        process(isDevelopment, isOptBoolean({ isDevelopment })),
        process(callback, isOptCallback({ callback })),
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([token, isDevelopment]) =>
        xs.fromPromise(
          this.userAdapter.unregisterDeviceToken(token, isDevelopment)),
      )
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }

  updateChatRoom (
    roomId: number,
    name?: string | null,
    avatarUrl?: string | null,
    extras?: object | null,
    callback?: (response: model.IQChatRoom, error?: Error) => void,
  ): void | Promise<model.IQChatRoom> {
    // this method should update room list
    return xs
      .combine(
        process(roomId, isReqNumber({ roomId })),
        process(name, isOptString({ name })),
        process(avatarUrl, isOptString({ avatarUrl })),
        process(extras, isOptJson({ extras })),
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([ roomId, name, avatarUrl, extras ]) =>
        xs.fromPromise(
          this.roomAdapter.updateRoom(roomId, name, avatarUrl, extras as any)),
      )
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }

  setUserWithIdentityToken (
    token: string,
    callback?: IQCallback<model.IQUser>
  ): void | Promise<model.IQUser> {
    return xs
      .combine(
        process(token, isReqString({ token })),
        process(callback, isOptCallback({ callback })),
      )
      .map(([token]) => xs.fromPromise(
        this.userAdapter.setUserFromIdentityToken(token)))
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }

  getChannel (
    uniqueId: string,
    callback?: IQCallback<model.IQChatRoom>): void | Promise<model.IQChatRoom> {
    // throw new Error('Method not implemented.')
    return xs
      .combine(
        process(uniqueId, isReqString({ uniqueId })),
        process(callback, isOptCallback({ callback })),
      )
      .map(
        ([uniqueId]) => xs.fromPromise(this.roomAdapter.getChannel(uniqueId)))
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }
  // -------------------------------------------------------

  // Room Adapter ------------------------------------------
  chatUser (
    userId: string, extras: object,
    callback?: IQCallback<model.IQChatRoom>): void | Promise<model.IQChatRoom> {
    return xs
      .combine(
        process(userId, isReqString({ userId })),
        process(extras, isOptJson({ extras })),
        process(callback, isOptCallback({ callback })),
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([userId, extras]) => xs.fromPromise(
        this.roomAdapter.chatUser(userId, extras as any)))
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }

  addParticipants (
    roomId: number,
    userIds: string[],
    callback?: IQCallback<model.IQParticipant[]>,
  ): void | Promise<model.IQParticipant[]> {
    return xs
      .combine(
        process(roomId, isReqNumber({ roomId })),
        process(userIds, isReqArrayString({ userIds })),
        process(callback, isOptCallback({ callback })),
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([roomId, userIds]) => xs.fromPromise(
        this.roomAdapter.addParticipants(roomId, userIds)))
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }

  removeParticipants (
    roomId: number,
    userIds: string[],
    callback?: IQCallback<model.IQParticipant[]>,
  ): void | Promise<model.IQParticipant[] | string[]> {
    return xs
      .combine(
        process(roomId, isReqNumber({ roomId })),
        process(userIds, isReqArrayString({ userIds })),
        process(callback, isOptCallback({ callback })),
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([roomId, userIds]) =>
        xs.fromPromise(this.roomAdapter.removeParticipants(roomId, userIds)),
      )
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }

  clearMessagesByChatRoomId (
    roomUniqueIds: string[],
    callback?: IQCallback<model.IQChatRoom[]>,
  ): void | Promise<model.IQChatRoom[]> {
    return xs
      .combine(
        process(roomUniqueIds, isReqArrayString({ roomIds: roomUniqueIds })),
        process(callback, isOptCallback({ callback })),
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([roomIds]) => xs.fromPromise(this.roomAdapter.clearRoom(roomIds)))
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }

  createGroupChat (
    name: string,
    userIds: string[],
    avatarUrl: string,
    extras: object,
    callback?: IQCallback<model.IQChatRoom>,
  ): void | Promise<model.IQChatRoom> {
    return xs
      .combine(
        process(name, isReqString({ name })),
        process(userIds, isReqArrayString({ userIds })),
        process(avatarUrl, isOptString({ avatarUrl })),
        process(extras, isOptJson({ extras })),
        process(callback, isOptCallback({ callback })),
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([ name, userIds, avatarUrl, extras ]) =>
        xs.fromPromise(
          this.roomAdapter.createGroup(name, userIds, avatarUrl, extras as any)),
      )
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }

  createChannel (
    uniqueId: string,
    name: string,
    avatarUrl: string,
    extras: object,
    callback?: IQCallback<model.IQChatRoom>,
  ): void | Promise<model.IQChatRoom> {
    return xs
      .combine(
        process(uniqueId, isReqString({ uniqueId })),
        process(name, isReqString({ name })),
        process(avatarUrl, isOptString({ avatarUrl })),
        process(extras, isOptJson({ extras })),
        process(callback, isOptCallback({ callback })),
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([uniqueId, name, avatarUrl, extras]) =>
        xs.fromPromise(
          this.roomAdapter.getChannel(uniqueId, name, avatarUrl, extras as any)),
      )
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }

  getParticipants (
    roomUniqueId: string,
    offset?: number,
    sorting?: 'asc' | 'desc' | null,
    callback?: IQCallback<model.IQParticipant[]>,
  ): void | Promise<model.IQParticipant[]> {
    return xs
      .combine(
        process(roomUniqueId, isReqString({ roomUniqueId })),
        process(offset, isOptNumber({ offset })),
        process(sorting, isOptString({ sorting })),
        process(callback, isOptCallback({ callback })),
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([roomId, offset, sorting]) =>
        xs.fromPromise(
          this.roomAdapter.getParticipantList(roomId, offset, sorting)),
      )
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }

  getChatRooms (
    roomIds: number[],
    page?: number,
    showRemoved?: boolean,
    showParticipant?: boolean,
    callback?: IQCallback<model.IQChatRoom[]>,
  ): void | Promise<model.IQChatRoom[]>
  getChatRooms (
    uniqueIds: string[],
    page?: number,
    showRemoved?: boolean,
    showParticipant?: boolean,
    callback?: IQCallback<model.IQChatRoom[]>,
  ): void | Promise<model.IQChatRoom[]>
  getChatRooms (
    ids: number[] | string[],
    page?: number,
    showRemoved?: boolean,
    showParticipant?: boolean,
    callback?: IQCallback<model.IQChatRoom[]>,
  ): void | Promise<model.IQChatRoom[]> {
    let uniqueIds: string[] | null = null
    let roomIds: number[] | null = null
    if (isArrayOfNumber(ids)) {
      roomIds = ids
    }
    if (isArrayOfString(ids)) {
      uniqueIds = ids
    }
    return xs
      .combine(
        // process(roomIds, isOptArrayNumber({ roomIds })),
        // process(uniqueIds, isOptArrayString({ uniqueIds })),
        process(ids, isReqArrayOfStringOrNumber({ ids })),
        process(page, isOptNumber({ page })),
        process(showRemoved, isOptBoolean({ showRemoved })),
        process(showParticipant, isOptBoolean({ showParticipant })),
        process(callback, isOptCallback({ callback })),
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([_, page, showRemoved, showParticipant]) =>
        xs.fromPromise(
          this.roomAdapter.getRoomInfo(roomIds, uniqueIds, page, showRemoved,
            showParticipant),
        ),
      )
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }

  getAllChatRooms (
    showParticipant?: boolean,
    showRemoved?: boolean,
    showEmpty?: boolean,
    page?: number,
    limit?: number,
    callback?: IQCallback<model.IQChatRoom[]>,
  ): void | Promise<model.IQChatRoom[]> {
    return xs
      .combine(
        process(showParticipant, isOptBoolean({ showParticipant })),
        process(showRemoved, isOptBoolean({ showRemoved })),
        process(showEmpty, isOptBoolean({ showEmpty })),
        process(page, isOptNumber({ page })),
        process(limit, isOptNumber({ limit })),
        process(callback, isOptCallback({ callback })),
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([showParticipant, showRemoved, showEmpty, page, limit]) =>
        xs.fromPromise(
          this.roomAdapter.getRoomList(showParticipant, showRemoved, showEmpty,
            page, limit),
        ),
      )
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }

  getChatRoomWithMessages (
    roomId: number,
    callback?: IQCallback<model.IQChatRoom>): void | Promise<model.IQChatRoom> {
    return xs
      .combine(
        process(roomId, isReqNumber({ roomId })),
        process(callback, isOptCallback({ callback })),
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([roomId]) => xs.fromPromise(this.roomAdapter.getRoom(roomId)))
      .flatten()
      .compose(toCallbackOrPromise(callback) as any)
  }

  getTotalUnreadCount (callback?: IQCallback<number>): void | Promise<number> {
    return xs
      .combine(process(callback, isOptCallback({ callback })))
      .compose(bufferUntil(() => this.isLogin))
      .map(() => xs.fromPromise(this.roomAdapter.getUnreadCount()))
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }
  // ------------------------------------------------------

  // Message Adapter --------------------------------------
  sendMessage (
    roomId: number,
    message: IQMessageT,
    callback?: IQCallback<model.IQMessage>,
  ): void | Promise<model.IQMessage> {
    return xs
      .combine(
        process(roomId, isReqNumber({ roomId })),
        process(message, isReqJson({ message })),
        process(callback, isOptCallback({ callback })),
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([roomId, message]) => xs.fromPromise(
        this.messageAdapter.sendMessage(roomId, message)))
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }

  markAsDelivered (
    roomId: number,
    messageId: number,
    callback?: IQCallback<void>,
  ): void | Promise<void> {
    return xs
      .combine(
        process(roomId, isReqNumber({ roomId })),
        process(messageId, isReqNumber({ messageId })),
        process(callback, isOptCallback({ callback })),
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([roomId, messageId]) =>
        xs.fromPromise(this.messageAdapter.markAsDelivered(roomId, messageId)),
      )
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }

  markAsRead (
    roomId: number,
    messageId: number,
    callback?: IQCallback<void>,
  ): void | Promise<void> {
    return xs
      .combine(
        process(roomId, isReqNumber({ roomId })),
        process(messageId, isReqNumber({ messageId })),
        process(callback, isOptCallback({ callback })),
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([roomId, messageId]) =>
        xs.fromPromise(this.messageAdapter.markAsRead(roomId, messageId)),
      )
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }

  deleteMessages (
    messageUniqueIds: string[],
    callback?: IQCallback<model.IQMessage[]>,
  ): void | Promise<model.IQMessage[]> {
    return xs
      .combine(
        process(messageUniqueIds, isReqArrayString({ messageUniqueIds })),
        process(callback, isOptCallback({ callback })),
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([messageUniqueIds]) =>
        xs.fromPromise(this.messageAdapter.deleteMessage(messageUniqueIds)),
      )
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }

  getPreviouseMessagesById (
    roomId: number,
    limit?: number,
    messageId?: number,
    callback?: IQCallback<model.IQMessage[]>,
  ): void | Promise<model.IQMessage[]> {
    return xs
      .combine(
        process(roomId, isReqNumber({ roomId })),
        process(limit, isOptNumber({ limit })),
        process(messageId, isOptNumber({ messageId })),
        process(callback, isOptCallback({ callback })),
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([roomId, limit, messageId]) =>
        xs.fromPromise(
          this.messageAdapter.getMessages(roomId, messageId, limit, false)),
      )
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }

  getNextMessagesById (
    roomId: number,
    limit?: number,
    messageId?: number,
    callback?: IQCallback<model.IQMessage[]>,
  ): void | Promise<model.IQMessage[]> {
    return xs
      .combine(
        process(roomId, isReqNumber({ roomId })),
        process(limit, isOptNumber({ limit })),
        process(messageId, isOptNumber({ messageId })),
        process(callback, isOptCallback({ callback })),
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([roomId, limit, messageId]) =>
        xs.fromPromise(
          this.messageAdapter.getMessages(roomId, messageId, limit, true)),
      )
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }
  // -------------------------------------------------------

  // Misc --------------------------------------------------
  publishCustomEvent (roomId: number, data: any): void {
    const userId = this.currentUser.id
    this.realtimeAdapter.mqtt.publishCustomEvent(roomId, userId, data)
  }

  publishOnlinePresence (isOnline: boolean): void {
    this.realtimeAdapter.sendPresence(this.currentUser.id, isOnline)
  }
  publishTyping (roomId: number, isTyping?: boolean): void {
    this.realtimeAdapter.sendTyping(roomId, this.currentUser.id,
      isTyping || true)
  }

  subscribeCustomEvent (roomId: number, callback: IQCallback<any>): void {
    this.realtimeAdapter.mqtt.subscribeCustomEvent(roomId, callback)
  }

  unsubscribeCustomEvent (roomId: number): void {
    this.realtimeAdapter.mqtt.unsubscribeCustomEvent(roomId)
  }

  upload (file: File, callback?: IQProgressListener): void {
    const data = new FormData()
    data.append('file', file)
    data.append('token', this.token)
    this.httpAdapter
      .upload<UploadResult>('upload', data,
        progress => callback(null, progress))
      .then(res => {
        const fileUrl = res.results.file.url
        callback(null, null, fileUrl)
      })
      .catch(error => callback(error))
  }

  hasSetupUser (callback: (isSetup: boolean) => void): void | Promise<boolean> {
    return xs
      .of(this.currentUser)
      .map(user => user != null)
      .compose(toCallbackOrPromise(callback))
  }

  sendFileMessage (
    roomId: number,
    message: string,
    file: File,
    callback?: (error: Error, progress?: number, message?: model.IQMessage) => void,
  ): void {
    this.upload(file, (error, progress, url) => {
      if (error) return callback(error)
      if (progress) callback(null, progress)
      if (url) {
        const _message = {
          payload: {
            url,
            file_name: file.name,
            size: file.size,
            caption: message,
          },
          extras: {},
          type: IQMessageType.Attachment,
          message: `[file] ${url} [/file]`,
        }
        this.sendMessage(roomId, _message, msg => {
          callback(null, null, msg)
        })
      }
    })
  }

  getThumbnailURL (url: string) {
    return url.replace('/upload/', '/upload/w_30,c_scale/')
  }

  setSyncInterval (interval: number): void {
    this._syncInterval.set(interval)
  }

  synchronize (lastMessageId: model.IQAccount['lastMessageId']): void {
    this.realtimeAdapter.synchronize(lastMessageId)
  }

  synchronizeEvent (lastEventId: model.IQAccount['lastSyncEventId']): void {
    this.realtimeAdapter.synchronizeEvent(lastEventId)
  }

  enableDebugMode (enable: boolean) {
    this._loggerAdapter.get().setEnable(enable)
  }

  onMessageReceived (handler: (message: model.IQMessage) => void): Subscription {
    return xs
      .of(handler)
      .compose(bufferUntil(() => this.isLogin))
      .compose(toEventSubscription(this.realtimeAdapter.onNewMessage))
  }
  onMessageDeleted (handler: (message: model.IQMessage) => void): Subscription {
    return xs
      .of(handler)
      .compose(bufferUntil(() => this.isLogin))
      .compose(toEventSubscription(this.realtimeAdapter.onMessageDeleted))
  }
  onMessageDelivered (handler: (message: model.IQMessage) => void): Subscription {
    return xs
      .of(handler)
      .compose(bufferUntil(() => this.isLogin))
      .compose(toEventSubscription(this.realtimeAdapter.onMessageDelivered))
  }
  onMessageRead (handler: (message: model.IQMessage) => void): Subscription {
    return xs
      .of(handler)
      .compose(bufferUntil(() => this.isLogin))
      .compose(toEventSubscription(this.realtimeAdapter.onMessageRead))
  }
  onUserTyping (handler: (
    userId: string, roomId: number, isTyping: boolean) => void): Subscription {
    return xs
      .of(handler)
      .compose(bufferUntil(() => this.isLogin))
      .compose(toEventSubscription(this.realtimeAdapter.onTyping))
  }
  onUserOnlinePresence (
    handler: (userId: string, isOnline: boolean, lastSeen: Date) => void,
  ): Subscription {
    return xs
      .of(handler)
      .compose(bufferUntil(() => this.isLogin))
      .compose(toEventSubscription(this.realtimeAdapter.onPresence))
  }
  onChatRoomCleared (handler: Callback<number>): Subscription {
    return xs
      .of(handler)
      .compose(bufferUntil(() => this.isLogin))
      .compose(toEventSubscription(this.realtimeAdapter.onRoomCleared))
  }
  onConnected (handler: () => void): Subscription {
    return xs
      .of(handler)
      .compose(bufferUntil(() => this.isLogin))
      .compose(toEventSubscription(this.realtimeAdapter.mqtt.onMqttConnected))
  }
  onReconnecting (handler: () => void): Subscription {
    return xs
      .of(handler)
      .compose(bufferUntil(() => this.isLogin))
      .compose(
        toEventSubscription(this.realtimeAdapter.mqtt.onMqttReconnecting))
  }
  onDisconnected (handler: () => void): Subscription {
    return xs
      .of(handler)
      .compose(bufferUntil(() => this.isLogin))
      .compose(
        toEventSubscription(this.realtimeAdapter.mqtt.onMqttDisconnected))
  }
  subscribeChatRoom (room: model.IQChatRoom): void {
    xs.of([room])
      .compose(bufferUntil(() => this.isLogin))
      .compose(
        subscribeOnNext(([room]) => {
          if (room.type ===
            'channel') this.realtimeAdapter.mqtt.subscribeChannel(this.appId,
            room.uniqueId)
          else this.realtimeAdapter.mqtt.subscribeRoom(room.id)
        }),
      )
  }
  unsubscribeChatRoom (room: model.IQChatRoom): void {
    xs.of([room])
      .compose(bufferUntil(() => this.isLogin))
      .compose(
        subscribeOnNext(([room]) => {
          if (room.type ===
            'channel') this.realtimeAdapter.mqtt.subscribeChannel(this.appId,
            room.uniqueId)
          else this.realtimeAdapter.mqtt.subscribeRoom(room.id)
        }),
      )
  }
  subscribeUserOnlinePresence (userId: string): void {
    xs.of([userId])
      .compose(bufferUntil(() => this.isLogin))
      .compose(
        subscribeOnNext(
          ([userId]) => this.realtimeAdapter.mqtt.subscribeUserPresence(
            userId)),
      )
  }
  unsubscribeUserOnlinePresence (userId: string): void {
    xs.of([userId])
      .compose(bufferUntil(() => this.isLogin))
      .compose(
        subscribeOnNext(
          ([userId]) => this.realtimeAdapter.mqtt.unsubscribeUserPresence(
            userId)),
      )
  }
}
