import { Atom, atom } from "derivable";
import xs from "xstream";
import getHttpAdapter, { IQHttpAdapter } from "./adapters/http";
import { getLogger, ILogger } from "./adapters/logger";
import getMessageAdapter, {
  getMessageType,
  QMessage
} from "./adapters/message";
import getRealtimeAdapter, { IQRealtimeAdapter } from "./adapters/realtime";
import getRoomAdapter from "./adapters/room";
import getUserAdapter from "./adapters/user";
import {
  Callback,
  IQCallback,
  IQiscus,
  IQMessage,
  IQMessageAdapter,
  IQMessageStatus,
  IQMessageT,
  IQMessageType,
  IQParticipant,
  IQProgressListener,
  IQRoom,
  IQRoomAdapter,
  IQUser,
  IQUserAdapter,
  Subscription,
  UploadResult
} from "./defs";
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
  isReqString
} from "./utils/param-utils";
import {
  bufferUntil,
  process,
  subscribeOnNext,
  tap,
  toCallbackOrPromise,
  toEventSubscription
} from "./utils/stream";

export type QSyncMode = "socket" | "http" | "both";

export default class Qiscus implements IQiscus {
  private static _instance: Qiscus = null;

  //<editor-fold desc="Property">
  private readonly _syncMode: Atom<QSyncMode> = atom("socket");

  private readonly _realtimeAdapter: Atom<IQRealtimeAdapter | null> = atom(
    null
  );
  private readonly _loggerAdapter: Atom<ILogger> = atom(null);
  private readonly _httpAdapter: Atom<IQHttpAdapter | null> = atom(null);
  private readonly _userAdapter: Atom<IQUserAdapter | null> = atom(null);
  private readonly _roomAdapter: Atom<IQRoomAdapter | null> = atom(null);
  private readonly _messageAdapter: Atom<IQMessageAdapter | null> = atom(null);
  private readonly _syncInterval: Atom<number> = atom(5000);
  private readonly _baseUrl: Atom<string> = atom(null);
  private readonly _brokerUrl: Atom<string | null> = atom(null);
  private readonly _appId: Atom<string> = atom(null);
  private readonly _shouldSync = atom(false);
  private readonly _customHeaders = atom<{ [key: string]: string }>(null);
  //</editor-fold>

  public static get instance(): Qiscus {
    if (this._instance == null) this._instance = new this();
    return this._instance;
  }

  public get httpAdapter() {
    return this._httpAdapter.get();
  }
  public get realtimeAdapter() {
    return this._realtimeAdapter.get();
  }
  public get userAdapter() {
    return this._userAdapter.get();
  }
  public get roomAdapter() {
    return this._roomAdapter.get();
  }
  public get messageAdapter() {
    return this._messageAdapter.get();
  }
  public get appId() {
    return this._appId.get();
  }
  public get baseUrl() {
    return this._baseUrl.get();
  }
  public get brokerUrl() {
    return this._brokerUrl.get();
  }
  public get token() {
    return this.userAdapter.token.get();
  }
  public get isLogin() {
    return this.currentUser != null;
  }
  public get currentUser() {
    return this._userAdapter
      .derive(adapter => {
        return adapter.currentUser.get();
      })
      .get();
  }
  private get syncInterval() {
    return this._syncInterval.get();
  }
  private get shouldSync() {
    return this._shouldSync.get();
  }

  setup(appId: string, syncInterval: number = 5000): void {
    this.setupWithCustomServer(
      appId,
      "https://api.qiscus.com/api/v2/sdk/",
      "wss://mqtt.qiscus.com:1886/mqtt",
      null,
      syncInterval
    );
  }

  setupWithCustomServer(
    appId: string,
    baseUrl: string,
    brokerUrl: string,
    brokerLBUrl: string,
    syncInterval: number = 5000
  ): void {
    this._appId.set(appId);
    this._baseUrl.set(baseUrl);
    this._brokerUrl.set(brokerUrl);
    this._syncMode.set("socket");
    this._syncInterval.set(syncInterval);
    this._loggerAdapter.set(getLogger());
    this._httpAdapter.set(
      getHttpAdapter({
        baseUrl: this.baseUrl,
        httpHeader: this._customHeaders,
        getAppId: () => this.appId,
        getToken: () => this.token,
        getUserId: () => (this.currentUser ? this.currentUser.userId : null),
        getSdkVersion: () => "3-alpha"
      })
    );
    this._userAdapter.set(getUserAdapter(this._httpAdapter));
    this._roomAdapter.set(getRoomAdapter(this._httpAdapter, this._userAdapter));
    this._messageAdapter.set(
      getMessageAdapter(this._httpAdapter, this._userAdapter, this._roomAdapter)
    );
    this._realtimeAdapter.set(
      getRealtimeAdapter(
        this._httpAdapter,
        this._messageAdapter,
        this._roomAdapter,
        this._syncInterval,
        this._brokerUrl,
        this._shouldSync,
        this.userAdapter.token.derive(it => it != null),
        this.userAdapter.token
      )
    );
  }

  setCustomHeader(headers: { [key: string]: string }): void {
    this._customHeaders.set(headers);
  }

  // User Adapter ------------------------------------------
  setUser(
    userId: string,
    userKey: string,
    username?: string,
    avatarUrl?: string,
    extras?: object | null,
    callback?: null | IQCallback<IQUser>
  ): void | Promise<IQUser> {
    // this method should set currentUser and token
    return xs
      .combine(
        process(userId, isReqString({ userId })),
        process(userKey, isReqString({ userKey })),
        process(username, isOptString({ username })),
        process(avatarUrl, isOptString({ avatarUrl })),
        process(extras, isOptJson({ extras })),
        process(callback, isOptCallback({ callback }))
      )
      .map(([userId, userKey, username, avatarUrl, extras]) => [
        userId,
        userKey,
        username,
        avatarUrl,
        JSON.stringify(extras)
      ])
      .map(([userId, userKey, username, avatarUrl, extras]) =>
        xs.fromPromise(
          this.userAdapter.login(userId, userKey, {
            name: username,
            avatarUrl,
            extras
          })
        )
      )
      .flatten()
      .compose(
        tap(it => {
          this.realtimeAdapter.mqtt.connect(it.userId);
          this.realtimeAdapter.mqtt.subscribeUser(this.userAdapter.token.get());
        })
      )
      .compose(toCallbackOrPromise(callback));
  }

  blockUser(
    userId: string,
    callback: IQCallback<IQUser>
  ): void | Promise<IQUser> {
    return xs
      .combine(
        process(userId, isReqString({ userId })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([userId]) => xs.fromPromise(this.userAdapter.blockUser(userId)))
      .flatten()
      .compose(toCallbackOrPromise(callback));
  }

  clearUser(callback: IQCallback<void>): void | Promise<void> {
    // this method should clear currentUser and token
    return xs
      .combine(process(callback, isOptCallback({ callback })))
      .map(() => xs.fromPromise(Promise.resolve(this.userAdapter.clear())))
      .flatten()
      .compose(toCallbackOrPromise(callback));
  }

  unblockUser(
    userId: string,
    callback?: IQCallback<IQUser>
  ): void | Promise<IQUser> {
    return xs
      .combine(
        process(userId, isReqString({ userId })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([userId]) => xs.fromPromise(this.userAdapter.unblockUser(userId)))
      .flatten()
      .compose(toCallbackOrPromise(callback));
  }

  updateUser(
    username: string,
    avatarUrl: string,
    extras?: object,
    callback?: IQCallback<IQUser>
  ): void | Promise<IQUser> {
    // this method should update current user
    return xs
      .combine(
        process(username, isOptString({ username })),
        process(avatarUrl, isOptString({ avatarUrl })),
        process(extras, isOptJson({ extras })),
        process(callback, isOptCallback({ callback }))
      )
      .map(([username, avatarUrl, extras]) => [
        username,
        avatarUrl,
        JSON.stringify(extras)
      ])
      .compose(bufferUntil(() => this.isLogin))
      .map(([username, avatarUrl, extras]) =>
        xs.fromPromise(this.userAdapter.updateUser(username, avatarUrl, extras))
      )
      .flatten()
      .compose(toCallbackOrPromise(callback));
  }

  getBlockedUsers(
    page?: number,
    limit?: number,
    callback?: IQCallback<IQUser[]>
  ): void | Promise<IQUser[]> {
    return xs
      .combine(
        process(page, isOptNumber({ page })),
        process(limit, isOptNumber({ limit })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([page, limit]) =>
        xs.fromPromise(this.userAdapter.getBlockedUser(page, limit))
      )
      .flatten()
      .compose(toCallbackOrPromise(callback));
  }

  getUsers(
    searchUsername?: string,
    page?: number,
    limit?: number,
    callback?: IQCallback<IQUser[]>
  ): void | Promise<IQUser[]> {
    return xs
      .combine(
        process(searchUsername, isOptString({ searchUsername })),
        process(page, isOptNumber({ page })),
        process(limit, isOptString({ limit })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([search, page, limit]) =>
        xs.fromPromise(this.userAdapter.getUserList(search, page, limit))
      )
      .flatten()
      .compose(toCallbackOrPromise(callback));
  }

  getJWTNonce(callback?: IQCallback<string>): void | Promise<string> {
    return xs
      .combine(process(callback, isOptCallback({ callback })))
      .map(() => xs.fromPromise(this.userAdapter.getNonce()))
      .flatten()
      .map(nonce => nonce.nonce)
      .compose(toCallbackOrPromise(callback));
  }

  getUserData(
    callback?: (response: IQUser, error?: Error) => void
  ): void | Promise<IQUser> {
    // this method should update current user
    return xs
      .combine(process(callback, isOptCallback({ callback })))
      .compose(bufferUntil(() => this.isLogin))
      .map(() => xs.fromPromise(this.userAdapter.getUserData()))
      .flatten()
      .compose(toCallbackOrPromise(callback));
  }

  registerDeviceToken(
    token: string,
    callback?: IQCallback<boolean>
  ): void | Promise<boolean> {
    return xs
      .combine(
        process(token, isReqString({ token })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([token]) =>
        xs.fromPromise(this.userAdapter.registerDeviceToken(token))
      )
      .flatten()
      .compose(toCallbackOrPromise(callback));
  }

  removeDeviceToken(
    token: string,
    callback?: IQCallback<boolean>
  ): void | Promise<boolean> {
    return xs
      .combine(
        process(token, isReqString({ token })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([token]) =>
        xs.fromPromise(this.userAdapter.unregisterDeviceToken(token))
      )
      .flatten()
      .compose(toCallbackOrPromise(callback));
  }

  updateChatRoom(
    roomId: number,
    name?: string | null,
    avatarUrl?: string | null,
    extras?: object | null,
    callback?: (response: IQRoom, error?: Error) => void
  ): void | Promise<IQRoom> {
    // this method should update room list
    return xs
      .combine(
        process(roomId, isReqNumber({ roomId })),
        process(name, isOptString({ name })),
        process(avatarUrl, isOptString({ avatarUrl })),
        process(extras, isOptJson({ extras }))
      )
      .map(([roomId, name, avatarUrl, extras]) => {
        return { roomId, name, avatarUrl, extras: JSON.stringify(extras) };
      })
      .compose(bufferUntil(() => this.isLogin))
      .map(({ roomId, name, avatarUrl, extras }) =>
        xs.fromPromise(
          this.roomAdapter.updateRoom(roomId, name, avatarUrl, extras)
        )
      )
      .flatten()
      .compose(toCallbackOrPromise(callback));
  }

  setUserWithIdentityToken(
    token: string,
    callback?: (response: IQUser, error?: Error) => void
  ): void | Promise<IQUser> {
    return xs
      .combine(
        process(token, isReqString({ token })),
        process(callback, isOptCallback({ callback }))
      )
      .map(([token]) =>
        xs.fromPromise(this.userAdapter.setUserFromIdentityToken(token))
      )
      .flatten()
      .compose(toCallbackOrPromise(callback));
  }

  getChannel(
    uniqueId: string,
    callback?: IQCallback<IQRoom>
  ): void | Promise<IQRoom> {
    throw new Error("Method not implemented.");
    return xs
      .combine(
        process(uniqueId, isReqString({ uniqueId })),
        process(callback, isOptCallback({ callback }))
      )
      .map(([uniqueId]) =>
        xs.fromPromise(this.roomAdapter.getChannel(uniqueId))
      )
      .flatten()
      .compose(toCallbackOrPromise(callback));
  }
  // -------------------------------------------------------

  // Room Adapter ------------------------------------------
  chatUser(
    userId: string,
    avatarUrl: string,
    extras: object,
    callback?: IQCallback<IQRoom>
  ): void | Promise<IQRoom> {
    return xs
      .combine(
        process(userId, isReqString({ userId })),
        process(avatarUrl, isOptString({ avatarUrl })),
        process(extras, isOptJson({ extras })),
        process(callback, isOptCallback({ callback }))
      )
      .map(([userId, avatarUrl, extras]) => [
        userId,
        avatarUrl,
        JSON.stringify(extras)
      ])
      .compose(bufferUntil(() => this.isLogin))
      .map(([userId, avatarUrl, extras]) =>
        xs.fromPromise(this.roomAdapter.chatUser(userId, avatarUrl, extras))
      )
      .flatten()
      .compose(toCallbackOrPromise(callback));
  }

  addParticipants(
    roomId: number,
    userIds: string[],
    callback?: IQCallback<any>
  ): void | Promise<IQParticipant[]> {
    return xs
      .combine(
        process(roomId, isReqNumber({ roomId })),
        process(userIds, isReqArrayString({ userIds })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([roomId, userIds]) =>
        xs.fromPromise(this.roomAdapter.addParticipants(roomId, userIds))
      )
      .flatten()
      .compose(toCallbackOrPromise(callback));
  }

  // Test me
  removeParticipants(
    roomId: number,
    userIds: string[],
    callback?: IQCallback<IQParticipant[]>
  ): void | Promise<IQParticipant[] | string[]> {
    return xs
      .combine(
        process(roomId, isReqNumber({ roomId })),
        process(userIds, isReqArrayString({ userIds })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([roomId, userIds]) =>
        xs.fromPromise(this.roomAdapter.removeParticipants(roomId, userIds))
      )
      .flatten()
      .compose(toCallbackOrPromise(callback));
  }

  clearMessagesByChatRoomId(
    roomUniqueIds: string[],
    callback?: IQCallback<IQRoom[]>
  ): void | Promise<IQRoom[]> {
    return xs
      .combine(
        process(roomUniqueIds, isReqArrayString({ roomIds: roomUniqueIds })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([roomIds]) => xs.fromPromise(this.roomAdapter.clearRoom(roomIds)))
      .flatten()
      .compose(toCallbackOrPromise(callback));
  }

  createGroupChat(
    name: string,
    userIds: string[],
    avatarUrl: string,
    extras: object,
    callback?: IQCallback<IQRoom>
  ): void | Promise<IQRoom> {
    return xs
      .combine(
        process(name, isReqString({ name })),
        process(userIds, isReqArrayString({ userIds })),
        process(avatarUrl, isOptString({ avatarUrl })),
        process(extras, isOptJson({ extras })),
        process(callback, isOptCallback({ callback }))
      )
      .map(([name, userIds, avatarUrl, extras]) => ({
        name,
        userIds,
        avatarUrl,
        extras: JSON.stringify(extras)
      }))
      .compose(bufferUntil(() => this.isLogin))
      .map(({ name, userIds, avatarUrl, extras }) =>
        xs.fromPromise(
          this.roomAdapter.createGroup(name, userIds, avatarUrl, extras)
        )
      )
      .flatten()
      .compose(toCallbackOrPromise(callback));
  }

  createChannel(
    uniqueId: string,
    name: string,
    avatarUrl: string,
    extras: object,
    callback?: IQCallback<IQRoom>
  ): void | Promise<IQRoom> {
    return xs
      .combine(
        process(uniqueId, isReqString({ uniqueId })),
        process(name, isReqString({ name })),
        process(avatarUrl, isOptString({ avatarUrl })),
        process(extras, isOptJson({ extras })),
        process(callback, isOptCallback({ callback }))
      )
      .map(([uniqueId, name, avatarUrl, extras]) => [
        uniqueId,
        name,
        avatarUrl,
        JSON.stringify(extras)
      ])
      .compose(bufferUntil(() => this.isLogin))
      .map(([uniqueId, name, avatarUrl, extras]) =>
        xs.fromPromise(
          this.roomAdapter.getChannel(uniqueId, name, avatarUrl, extras)
        )
      )
      .flatten()
      .compose(toCallbackOrPromise(callback));
  }

  getParticipants(
    roomUniqueId: string,
    offset?: number,
    sorting?: "asc" | "desc" | null,
    callback?: IQCallback<IQParticipant[]>
  ): void | Promise<IQParticipant[]> {
    return xs
      .combine(
        process(roomUniqueId, isReqString({ roomUniqueId })),
        process(offset, isOptNumber({ offset })),
        process(sorting, isOptString({ sorting })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([roomId, offset, sorting]) =>
        xs.fromPromise(
          this.roomAdapter.getParticipantList(roomId, offset, sorting)
        )
      )
      .flatten()
      .compose(toCallbackOrPromise(callback));
  }

  getChatRooms(
    roomIds: number[],
    page?: number,
    showRemoved?: boolean,
    showParticipant?: boolean,
    callback?: IQCallback<IQRoom[]>
  ): void | Promise<IQRoom[]>;
  getChatRooms(
    uniqueIds: string[],
    page?: number,
    showRemoved?: boolean,
    showParticipant?: boolean,
    callback?: IQCallback<IQRoom[]>
  ): void | Promise<IQRoom[]>;
  getChatRooms(
    ids: number[] | string[],
    page?: number,
    showRemoved?: boolean,
    showParticipant?: boolean,
    callback?: IQCallback<IQRoom[]>
  ): void | Promise<IQRoom[]> {
    let uniqueIds: string[] | null = null;
    let roomIds: number[] | null = null;
    if (isArrayOfNumber(ids)) {
      roomIds = ids;
    }
    if (isArrayOfString(ids)) {
      uniqueIds = ids;
    }
    return xs
      .combine(
        // process(roomIds, isOptArrayNumber({ roomIds })),
        // process(uniqueIds, isOptArrayString({ uniqueIds })),
        process(ids, isReqArrayOfStringOrNumber({ ids })),
        process(page, isOptNumber({ page })),
        process(showRemoved, isOptBoolean({ showRemoved })),
        process(showParticipant, isOptBoolean({ showParticipant })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([_, page, showRemoved, showParticipant]) =>
        xs.fromPromise(
          this.roomAdapter.getRoomInfo(
            roomIds,
            uniqueIds,
            page,
            showRemoved,
            showParticipant
          )
        )
      )
      .flatten()
      .compose(toCallbackOrPromise(callback));
  }

  getAllChatRooms(
    showParticipant?: boolean,
    showRemoved?: boolean,
    showEmpty?: boolean,
    page?: number,
    limit?: number,
    callback?: IQCallback<IQRoom[]>
  ): void | Promise<IQRoom[]> {
    return xs
      .combine(
        process(showParticipant, isOptBoolean({ showParticipant })),
        process(showRemoved, isOptBoolean({ showRemoved })),
        process(showEmpty, isOptBoolean({ showEmpty })),
        process(page, isOptNumber({ page })),
        process(limit, isOptNumber({ limit })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([showParticipant, showRemoved, showEmpty, page, limit]) =>
        xs.fromPromise(
          this.roomAdapter.getRoomList(
            showParticipant,
            showRemoved,
            showEmpty,
            page,
            limit
          )
        )
      )
      .flatten()
      .compose(toCallbackOrPromise(callback));
  }

  getChatRoomWithMessages(
    roomId: number,
    callback?: IQCallback<IQRoom>
  ): void | Promise<IQRoom> {
    return xs
      .combine(
        process(roomId, isReqNumber({ roomId })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([roomId]) => xs.fromPromise(this.roomAdapter.getRoom(roomId)))
      .flatten()
      .compose(toCallbackOrPromise(callback));
  }

  getTotalUnreadCount(callback?: IQCallback<number>): void | Promise<number> {
    return xs
      .combine(process(callback, isOptCallback({ callback })))
      .compose(bufferUntil(() => this.isLogin))
      .map(() => xs.fromPromise(this.roomAdapter.getUnreadCount()))
      .flatten()
      .compose(toCallbackOrPromise(callback));
  }
  // ------------------------------------------------------

  // Message Adapter --------------------------------------
  sendMessage(
    roomId: number,
    message: IQMessageT,
    callback?: IQCallback<IQMessage>
  ): void | Promise<IQMessage> {
    return xs
      .combine(
        process(roomId, isReqNumber({ roomId })),
        process(message, isReqJson({ message })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .compose(
        tap(([roomId, message]) => {
          const m = QMessage.prepareNew(
            this.currentUser.userId,
            roomId,
            message.message,
            getMessageType(message.type),
            message.extras,
            message.payload
          );
          m.status = IQMessageStatus.Sending;
        })
      )
      .map(([roomId, message]) =>
        xs.fromPromise(this.messageAdapter.sendMessage(roomId, message))
      )
      .flatten()
      .compose(toCallbackOrPromise(callback));
  }

  markAsDelivered(
    roomId: number,
    messageId: number,
    callback?: IQCallback<IQMessage>
  ): void | Promise<IQMessage> {
    return xs
      .combine(
        process(roomId, isReqNumber({ roomId })),
        process(messageId, isReqNumber({ messageId })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([roomId, messageId]) =>
        xs.fromPromise(this.messageAdapter.markAsDelivered(roomId, messageId))
      )
      .flatten()
      .compose(toCallbackOrPromise(callback));
  }

  markAsRead(
    roomId: number,
    messageId: number,
    callback?: IQCallback<IQMessage>
  ): void | Promise<IQMessage> {
    return xs
      .combine(
        process(roomId, isReqNumber({ roomId })),
        process(messageId, isReqNumber({ messageId })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([roomId, messageId]) =>
        xs.fromPromise(this.messageAdapter.markAsRead(roomId, messageId))
      )
      .flatten()
      .compose(toCallbackOrPromise(callback));
  }

  deleteMessages(
    messageUniqueIds: string[],
    callback?: IQCallback<IQMessage[]>
  ): void | Promise<IQMessage[]> {
    return xs
      .combine(
        process(messageUniqueIds, isReqArrayString({ messageUniqueIds })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([messageUniqueIds]) =>
        xs.fromPromise(this.messageAdapter.deleteMessage(messageUniqueIds))
      )
      .flatten()
      .compose(toCallbackOrPromise(callback));
  }

  getPreviouseMessagesById(
    roomId: number,
    limit?: number,
    messageId?: number,
    callback?: IQCallback<IQMessage[]>
  ): void | Promise<IQMessage[]> {
    return xs
      .combine(
        process(roomId, isReqNumber({ roomId })),
        process(limit, isOptNumber({ limit })),
        process(messageId, isOptNumber({ messageId })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([roomId, limit, messageId]) =>
        xs.fromPromise(
          this.messageAdapter.getMessages(roomId, messageId, limit, false)
        )
      )
      .flatten()
      .compose(toCallbackOrPromise(callback));
  }

  getNextMessagesById(
    roomId: number,
    limit?: number,
    messageId?: number,
    callback?: IQCallback<IQMessage[]>
  ): void | Promise<IQMessage[]> {
    return xs
      .combine(
        process(roomId, isReqNumber({ roomId })),
        process(limit, isOptNumber({ limit })),
        process(messageId, isOptNumber({ messageId })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([roomId, limit, messageId]) =>
        xs.fromPromise(
          this.messageAdapter.getMessages(roomId, messageId, limit, true)
        )
      )
      .flatten()
      .compose(toCallbackOrPromise(callback));
  }
  // -------------------------------------------------------

  // Misc --------------------------------------------------
  publishCustomEvent(roomId: number, data: any): void {
    const userId = this.currentUser.userId;
    this.realtimeAdapter.mqtt.publishCustomEvent(roomId, userId, data);
  }

  publishOnlinePresence(isOnline: boolean): void {
    this.realtimeAdapter.sendPresence(this.currentUser.userId, isOnline);
  }
  publishTyping(roomId: number, isTyping?: boolean): void {
    this.realtimeAdapter.sendTyping(
      roomId,
      this.currentUser.userId,
      isTyping || true
    );
  }

  subscribeCustomEvent(roomId: number, callback: IQCallback<any>): void {
    this.realtimeAdapter.mqtt.subscribeCustomEvent(roomId, callback);
  }

  unsubscribeCustomEvent(roomId: number): void {
    this.realtimeAdapter.mqtt.unsubscribeCustomEvent(roomId);
  }

  upload(file: File, callback?: IQProgressListener): void {
    const data = new FormData();
    data.append("file", file);
    data.append("token", this.token);
    this.httpAdapter
      .postFormData<UploadResult>("upload", data)
      .then(res => {
        const fileUrl = res.results.file.url;
        callback(null, null, fileUrl);
      })
      .catch(error => callback(error));
  }

  hasSetupUser(callback: (isSetup: boolean) => void): void | Promise<boolean> {
    return xs
      .of(this.currentUser)
      .map(user => user != null)
      .compose(toCallbackOrPromise(callback));
  }

  sendFileMessage(
    roomId: number,
    message: string,
    file: File,
    callback?: (error: Error, progress?: number, message?: IQMessage) => void
  ): void {
    this.upload(file, (error, progress, url) => {
      if (error) return callback(error);
      if (progress) callback(null, progress.loaded);
      if (url) {
        const _message = {
          payload: {
            url,
            file_name: file.name,
            size: file.size,
            caption: message
          },
          extras: {},
          type: IQMessageType.Attachment,
          message: `[file] ${url} [/file]`
        };
        this.sendMessage(roomId, _message, msg => {
          callback(null, null, msg);
        });
      }
    });
  }

  getThumbnailURL(url: string) {
    return url.replace("/upload/", "/upload/w_30,c_scale/");
  }

  setSyncInterval(interval: number): void {
    this._syncInterval.set(interval);
  }

  synchronize(lastMessageId: number): void {
    this.realtimeAdapter.synchronize(lastMessageId);
  }

  synchronizeEvent(lastEventId: number): void {
    this.realtimeAdapter.synchronizeEvent(lastEventId);
  }

  enableDebugMode(enable: boolean) {
    this._loggerAdapter.get().setEnable(enable);
  }

  onMessageReceived(handler: (message: IQMessage) => void): Subscription {
    return xs
      .of(handler)
      .compose(bufferUntil(() => this.isLogin))
      .compose(toEventSubscription(this.realtimeAdapter.onNewMessage));
  }
  onMessageDeleted(handler: (message: IQMessage) => void): Subscription {
    return xs
      .of(handler)
      .compose(bufferUntil(() => this.isLogin))
      .compose(toEventSubscription(this.realtimeAdapter.onMessageDeleted));
  }
  onMessageDelivered(handler: (message: IQMessage) => void): Subscription {
    return xs
      .of(handler)
      .compose(bufferUntil(() => this.isLogin))
      .compose(toEventSubscription(this.realtimeAdapter.onMessageDelivered));
  }
  onMessageRead(handler: (message: IQMessage) => void): Subscription {
    return xs
      .of(handler)
      .compose(bufferUntil(() => this.isLogin))
      .compose(toEventSubscription(this.realtimeAdapter.onMessageRead));
  }
  onUserTyping(
    handler: (userId: string, roomId: number, isTyping: boolean) => void
  ): Subscription {
    return xs
      .of(handler)
      .compose(bufferUntil(() => this.isLogin))
      .compose(toEventSubscription(this.realtimeAdapter.onTyping));
  }
  onUserOnlinePresence(
    handler: (userId: string, isOnline: boolean, lastSeen: Date) => void
  ): Subscription {
    return xs
      .of(handler)
      .compose(bufferUntil(() => this.isLogin))
      .compose(toEventSubscription(this.realtimeAdapter.onPresence));
  }
  onChatRoomCleared(handler: Callback<number>): Subscription {
    return xs
      .of(handler)
      .compose(bufferUntil(() => this.isLogin))
      .compose(toEventSubscription(this.realtimeAdapter.onRoomCleared));
  }
  onConnected(handler: () => void): Subscription {
    return xs
      .of(handler)
      .compose(bufferUntil(() => this.isLogin))
      .compose(toEventSubscription(this.realtimeAdapter.mqtt.onMqttConnected));
  }
  onReconnecting(handler: () => void): Subscription {
    return xs
      .of(handler)
      .compose(bufferUntil(() => this.isLogin))
      .compose(
        toEventSubscription(this.realtimeAdapter.mqtt.onMqttReconnecting)
      );
  }
  onDisconnected(handler: () => void): Subscription {
    return xs
      .of(handler)
      .compose(bufferUntil(() => this.isLogin))
      .compose(
        toEventSubscription(this.realtimeAdapter.mqtt.onMqttDisconnected)
      );
  }
  subscribeChatRoom(room: IQRoom): void {
    xs.of([room])
      .compose(bufferUntil(() => this.isLogin))
      .compose(
        subscribeOnNext(([room]) => {
          if (room.isChannel)
            this.realtimeAdapter.mqtt.subscribeChannel(
              this.appId,
              room.uniqueId
            );
          else this.realtimeAdapter.mqtt.subscribeRoom(room.id);
        })
      );
  }
  unsubscribeChatRoom(room: IQRoom): void {
    xs.of([room])
      .compose(bufferUntil(() => this.isLogin))
      .compose(
        subscribeOnNext(([room]) => {
          if (room.isChannel)
            this.realtimeAdapter.mqtt.subscribeChannel(
              this.appId,
              room.uniqueId
            );
          else this.realtimeAdapter.mqtt.subscribeRoom(room.id);
        })
      );
  }
  subscribeUserOnlinePresence(userId: string): void {
    xs.of([userId])
      .compose(bufferUntil(() => this.isLogin))
      .compose(
        subscribeOnNext(([userId]) =>
          this.realtimeAdapter.mqtt.subscribeUserPresence(userId)
        )
      );
  }
  unsubscribeUserOnlinePresence(userId: string): void {
    xs.of([userId])
      .compose(bufferUntil(() => this.isLogin))
      .compose(
        subscribeOnNext(([userId]) =>
          this.realtimeAdapter.mqtt.unsubscribeUserPresence(userId)
        )
      );
  }
}
