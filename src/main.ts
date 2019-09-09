import Symbol from 'es6-symbol'
import { Atom, atom, Derivable, lens } from 'derivable'
import { mod, findBy } from 'shades'
import getUserAdapter from './adapters/user'
import getMessageAdapter, { getMessageType, QMessage } from './adapters/message'
import getRoomAdapter from './adapters/room'
import getRealtimeAdapter, { IQRealtimeAdapter } from './adapters/realtime'
import getHttpAdapter, { IQHttpAdapter } from './adapters/http'
import {
  IQCallback,
  IQiscus,
  IQMessage,
  IQMessageAdapter,
  IQMessageStatus,
  IQMessageT,
  IQParticipant,
  IQProgressListener,
  IQRoom,
  IQRoomAdapter,
  IQUser,
  IQUserAdapter
} from './defs'
import {
  isArrayOfNumber, isArrayOfString, isOptArrayNumber, isOptArrayString,
  isOptBoolean,
  isOptCallback,
  isOptJson,
  isOptNumber,
  isOptString,
  isReqArrayNumber, isReqArrayOfStringOrNumber,
  isReqArrayString,
  isReqJson,
  isReqNumber,
  isReqString
} from './utils/param-utils'
import { process, tap, toCallbackOrPromise } from './utils/stream'
import xs from 'xstream'

const __secret = Symbol('secret');
export type QSyncMode = 'socket' | 'http' | 'both'

const updateRoomParticipantLastRead = (participantUserId: string, messageId: number) => (room: IQRoom): IQRoom => {
  const selector = mod('participants', findBy.of<IQParticipant>({ id: participantUserId }));
  const transformer = selector(it => ({ ...it, lastReadMessageId: messageId }));
  return transformer(room)
};
const updateRoomParticipantLastReceived = (participantUserId: string, messageId: number) => (room: IQRoom): IQRoom => {
  const selector = mod('participants', findBy.of<IQParticipant>({ id: participantUserId }));
  const transformer = selector(it => ({ ...it, lastReceivedMessageId: messageId }));
  return transformer(room)
};

export default class Qiscus implements IQiscus {
  private static _instance: Qiscus = null;

  //<editor-fold desc="Property">
  private readonly get _secret() { return __secret; }
  private readonly syncMode: Atom<QSyncMode> = atom('socket');
  private readonly _currentUser: Atom<IQUser | null> = atom(null);
  private readonly _rooms: Atom<{ [key: number]: IQRoom }> = atom({});
  private readonly _messages: Atom<{ [key: string]: IQMessage }> = atom({});

  private readonly _token: Atom<string | null> = atom(null);
  private readonly _realtimeAdapter: Atom<IQRealtimeAdapter | null> = atom(null);
  private readonly _httpAdapter: Atom<IQHttpAdapter | null> = atom(null);
  private readonly _userAdapter: Atom<IQUserAdapter | null> = atom(null);
  private readonly _roomAdapter: Atom<IQRoomAdapter | null> = atom(null);
  private readonly _messageAdapter: Atom<IQMessageAdapter | null> = atom(null);
  private readonly _syncInterval: Atom<number> = atom(5000);
  private readonly _baseUrl: Atom<string> = atom(null);
  private readonly _brokerUrl: Atom<string | null> = atom(null);
  private readonly _appId: Atom<string> = atom(null);
  private readonly _isLogin = this._token.derive(token => token != null);
  private readonly _shouldSync = atom(true);

  private readonly _currentRoomId: Atom<number | null> = atom(null);
  private readonly _currentRoom: Derivable<IQRoom | null> = this._rooms
    .derive((rooms) => {
      const r = rooms[this._currentRoomId.get()];
      const messages = this._messages.derive((messages) =>
        Object.values(messages)
          .filter(it => it.roomId === r.id)
          .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      );
      return {
        ...r,
        messages: messages.get()
      }
    });

  private readonly _lastReadMessageId: Derivable<number> = this._currentRoom
    .derive((room) => {
      if (room == null) return 0;
      const user = room.participants.find(it => it.userId === this.currentUser.userId);
      if (user == null) return 0;
      return user.lastReadMessageId
    });
  private readonly _lastReceivedMessageId: Derivable<number> = this._currentRoom
    .derive((room) => {
      if (room == null) return 0;
      const user = room.participants.find(it => it.userId === this.currentUser.userId);
      if (user == null) return 0;
      return user.lastReceivedMessageId
    });

  //</editor-fold>

  public static get instance (): Qiscus {
    if (this._instance == null) this._instance = new this();
    return this._instance
  }

  public get httpAdapter () { return this._httpAdapter.get() }
  public get realtimeAdapter () { return this._realtimeAdapter.get() }
  public get userAdapter () { return this._userAdapter.get() }
  public get roomAdapter () { return this._roomAdapter.get() }
  public get messageAdapter () { return this._messageAdapter.get() }
  public get appId () { return this._appId.get() }
  public get baseUrl () { return this._baseUrl.get() }
  public get brokerUrl () { return this._brokerUrl.get() }
  public get token () { return this._token.get() }
  public get isLogin () { return this._isLogin.get() }
  public get currentUser () { return this._currentUser.get() }
  public get currentRoom () { return this._currentRoom.get() }
  private get syncInterval () { return this._syncInterval.get() }
  private get shouldSync () { return this._shouldSync.get() }

  private _getRoomById = (roomId) => lens({
    get: () => { return this._rooms.get()[roomId] },
    set: (room) => {
      this._rooms.update((rooms) => ({
        ...rooms,
        [roomId]: room
      }))
    }
  });
  private _getParticipantsOfRoomById = (roomId) => lens({
    get: () => { return this._getRoomById(roomId).get().participants },
    set: (participants) => {
      this._getRoomById(roomId).update((room) => ({
        ...room,
        participants: participants,
        totalParticipants: participants.length
      }))
    }
  });

  setup (appId: string, syncInterval: number = 5000): void {
    this.setupWithCustomServer(
      appId,
      'https://api.qiscus.com/api/v2/sdk/',
      'wss://mqtt.qiscus.com:1886/mqtt',
      null,
      syncInterval
    )
  }

  setupWithCustomServer (
    appId: string,
    baseUrl: string,
    brokerUrl: string,
    brokerLBUrl: string,
    syncInterval: number = 5000
  ): void {
    this._appId.set(appId);
    this._baseUrl.set(baseUrl);
    this._brokerUrl.set(brokerUrl);
    this.syncMode.set('socket');
    this._syncInterval.set(syncInterval);
    this._httpAdapter.set(getHttpAdapter({
      baseUrl: this.baseUrl,
      getAppId: () => this.appId,
      getToken: () => this.token,
      getUserId: () => this.userAdapter.currentUserId,
      getSdkVersion: () => '3-beta'
    }));
    this._userAdapter.set(getUserAdapter(this.httpAdapter));
    this._roomAdapter.set(getRoomAdapter(this.httpAdapter, this.userAdapter));
    this._messageAdapter.set(getMessageAdapter(this.httpAdapter, this.userAdapter, this.roomAdapter));
    this._realtimeAdapter.set(getRealtimeAdapter(this.httpAdapter, this.syncInterval, this.brokerUrl, this.shouldSync, this.isLogin, this.token))
  }

  // User Adapter ------------------------------------------
  setUser (
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
      .map(([userId, userKey, username, avatarUrl, extras]) =>
        [userId, userKey, username, avatarUrl, JSON.stringify(extras)]
      )
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
        tap(user => {
          this._currentUser.set(user);
          this._token.set(this.userAdapter.token)
        })
      )
      .compose(toCallbackOrPromise(callback))
  }

  blockUser (
    userId: string,
    callback: IQCallback<IQUser>
  ): void | Promise<IQUser> {
    return xs
      .combine(
        process(userId, isReqString({ userId })),
        process(callback, isReqString({ callback }))
      )
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
      .compose(tap(() => {
        this._currentUser.set(null);
        this._token.set(null)
      }))
      .compose(toCallbackOrPromise(callback))
  }

  unblockUser (
    userId: string,
    callback?: IQCallback<IQUser>
  ): void | Promise<IQUser> {
    return xs
      .combine(
        process(userId, isReqString({ userId })),
        process(callback, isOptCallback({ callback }))
      )
      .map(([userId]) => xs.fromPromise(this.userAdapter.unblockUser(userId)))
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }

  updateUser (
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
      .map(([username, avatarUrl, extras]) =>
        xs.fromPromise(this.userAdapter.updateUser(username, avatarUrl, extras))
      )
      .flatten()
      .compose(tap(user => this._currentUser.set(user)))
      .compose(toCallbackOrPromise(callback))
  }

  getBlockedUsers (
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
      .map(([page, limit]) =>
        xs.fromPromise(this.userAdapter.getBlockedUser(page, limit))
      )
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }

  getUsers (
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
      .map(([search, page, limit]) =>
        xs.fromPromise(this.userAdapter.getUserList(search, page, limit))
      )
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }

  getJWTNonce (callback?: IQCallback<string>): void | Promise<string> {
    return xs
      .combine(process(callback, isOptCallback({ callback })))
      .map(() => xs.fromPromise(this.userAdapter.getNonce()))
      .flatten()
      .map(nonce => nonce.nonce)
      .compose(toCallbackOrPromise(callback))
  }

  getUserData (
    callback?: (response: IQUser, error?: Error) => void
  ): void | Promise<IQUser> {
    // this method should update current user
    return xs
      .combine(process(callback, isOptCallback({ callback })))
      .map(() => xs.fromPromise(this.userAdapter.getUserData()))
      .flatten()
      .compose(tap((user) => this._currentUser.set(user)))
      .compose(toCallbackOrPromise(callback))
  }

  registerDeviceToken (
    token: string,
    callback?: IQCallback<boolean>
  ): void | Promise<boolean> {
    return xs
      .combine(
        process(token, isReqString({ token })),
        process(callback, isOptCallback({ callback }))
      )
      .map(([token]) =>
        xs.fromPromise(this.userAdapter.registerDeviceToken(token))
      )
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }

  removeDeviceToken (
    token: string,
    callback?: IQCallback<boolean>
  ): void | Promise<boolean> {
    return xs
      .combine(
        process(token, isReqString({ token })),
        process(callback, isOptCallback({ callback }))
      )
      .map(([token]) =>
        xs.fromPromise(this.userAdapter.unregisterDeviceToken(token))
      )
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }

  updateChatRoom (
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
        return { roomId, name, avatarUrl, extras: JSON.stringify(extras) }
      })
      .map(({ roomId, name, avatarUrl, extras }) =>
        xs.fromPromise(this.roomAdapter.updateRoom(roomId, name, avatarUrl, extras))
      )
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }

  setUserWithIdentityToken (
    token: string,
    callback?: (response: IQUser, error?: Error) => void
  ): void | Promise<IQUser> {
    return xs.combine(
      process(token, isReqString({ token })),
      process(callback, isOptCallback({ callback }))
    )
      .map(([token]) => xs.fromPromise(this.userAdapter.setUserFromIdentityToken(token)))
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }

  getChannel(uniqueId: string, callback?: IQCallback<IQRoom>): void | Promise<IQRoom> {
    throw new Error("Method not implemented.");
  }
  // -------------------------------------------------------

  // Room Adapter ------------------------------------------
  chatUser (
    userId: string,
    avatarUrl: string,
    extras: object,
    callback?: IQCallback<IQRoom>
  ): void | Promise<IQRoom> {
    return xs.combine(
      process(userId, isReqString({ userId })),
      process(avatarUrl, isOptString({ avatarUrl })),
      process(extras, isOptJson({ extras })),
      process(callback, isOptCallback({ callback }))
    )
      .map(([userId, avatarUrl, extras]) => [userId, avatarUrl, JSON.stringify(extras)])
      .map(([userId, avatarUrl, extras]) =>
        xs.fromPromise(this.roomAdapter.chatUser(userId, avatarUrl, extras))
      )
      .flatten()
      .compose(tap((room) => {
        this._getRoomById(room.id).set(room)
      }))
      .compose(toCallbackOrPromise(callback))
  }

  addParticipants (
    roomId: number,
    userIds: string[],
    callback?: IQCallback<any>
  ): void | Promise<IQParticipant[]> {
    return xs.combine(
      process(roomId, isReqNumber({ roomId })),
      process(userIds, isReqArrayString({ userIds })),
      process(callback, isOptCallback({ callback }))
    )
      .map(([roomId, userIds]) => xs.fromPromise(this.roomAdapter.addParticipants(roomId, userIds)))
      .flatten()
      .compose(tap((participants) => {
        this._getParticipantsOfRoomById(roomId)
          .update((it) => [
            ...it,
            ...participants
          ])
      }))
      .compose(toCallbackOrPromise(callback))
  }

  // Test me
  removeParticipants (
    roomId: number,
    userIds: string[],
    callback?: IQCallback<IQParticipant[]>
  ): void | Promise<IQParticipant[] | string[]> {
    return xs.combine(
      process(roomId, isReqNumber({ roomId })),
      process(userIds, isReqArrayString({ userIds })),
      process(callback, isOptCallback({ callback }))
    )
      .map(([roomId, userIds]) =>
        xs.fromPromise(this.roomAdapter.removeParticipants(roomId, userIds))
      )
      .flatten()
      .map<IQParticipant[] | string[]>((userIds) => {
        const room = this._getRoomById(roomId).get();
        if (room == null) return userIds;
        return room.participants.filter(p => userIds.includes(p.userId))
      })
      .compose(tap((participants: IQParticipant[] | string[]) => {
        this._getRoomById(roomId).update((room) => {
          if (room == null) return room;
          const ps = (participants as any[]).filter((it) => typeof it !== 'string');
          return {
            ...room,
            participants: ps
          }
        })
      }))
      .compose(toCallbackOrPromise(callback))
  }


  clearMessagesByChatRoomId (
    roomIds: number[],
    callback?: IQCallback<IQRoom[]>
  ): void | Promise<IQRoom[]> {
    return xs.combine(
      process(roomIds, isReqArrayNumber({ roomIds })),
      process(callback, isOptCallback({ callback }))
    )
      .map(([roomIds]) => xs.fromPromise(this.roomAdapter.clearRoom(roomIds)))
      .flatten()
      .compose(tap((rooms) => {
        this._messages.update((messages) => {
          const rIds = rooms.map(it => it.id);
          return Object.values(messages)
            .filter(it => !rIds.includes(it.roomId))
            .reduce((res, it) => {
              res[it.uniqueId] = it;
              return res
            }, {})
        })
      }))
      .compose(toCallbackOrPromise(callback))
  }

  createGroupChat (
    name: string,
    userIds: string[],
    avatarUrl: string,
    extras: object,
    callback?: IQCallback<IQRoom>
  ): void | Promise<IQRoom> {
    return xs.combine(
      process(name, isReqString({ name })),
      process(userIds, isReqArrayString({ userIds })),
      process(avatarUrl, isOptString({ avatarUrl })),
      process(extras, isOptJson({ extras })),
      process(callback, isOptCallback({ callback }))
    )
      .map(([name, userIds, avatarUrl, extras]) =>
        ({ name, userIds, avatarUrl, extras: JSON.stringify(extras) })
      )
      .map(({ name, userIds, avatarUrl, extras }) =>
        xs.fromPromise(this.roomAdapter.createGroup(name, userIds, avatarUrl, extras))
      )
      .flatten()
      .compose(tap((room) => {
        this._getRoomById(room.id).set(room)
      }))
      .compose(toCallbackOrPromise(callback))
  }

  createChannel (
    uniqueId: string,
    name: string,
    avatarUrl: string,
    extras: object,
    callback?: IQCallback<IQRoom>
  ): void | Promise<IQRoom> {
    return xs.combine(
      process(uniqueId, isReqString({ uniqueId })),
      process(name, isReqString({ name })),
      process(avatarUrl, isOptString({ avatarUrl })),
      process(extras, isOptJson({ extras })),
      process(callback, isOptCallback({ callback }))
    )
      .map(([uniqueId, name, avatarUrl, extras]) => [uniqueId, name, avatarUrl, JSON.stringify(extras)])
      .map(([uniqueId, name, avatarUrl, extras]) =>
        xs.fromPromise(this.roomAdapter.getChannel(uniqueId, name, avatarUrl, extras))
      )
      .flatten()
      .compose(tap((room) => {
        this._getRoomById(room.id).set(room)
      }))
      .compose(toCallbackOrPromise(callback))
  }

  getParticipants (
    roomId: number,
    offset?: number,
    sorting?: 'asc' | 'desc' | null,
    callback?: IQCallback<IQParticipant[]>
  ): void | Promise<IQParticipant[]> {
    return xs.combine(
      process(roomId, isReqNumber({ roomId })),
      process(offset, isOptNumber({ offset })),
      process(sorting, isOptString({ sorting })),
      process(callback, isOptCallback({ callback }))
    )
      .map(([roomId, offset, sorting]) =>
        xs.fromPromise(this.roomAdapter.getParticipantList(roomId, offset, sorting))
      )
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }

  getChatRooms(roomIds: number[], page?: number, showRemoved?: boolean, showParticipant?: boolean, callback?: IQCallback<IQRoom[]>): void | Promise<IQRoom[]>
  getChatRooms(uniqueIds: string[], page?: number, showRemoved?: boolean, showParticipant?: boolean, callback?: IQCallback<IQRoom[]>): void | Promise<IQRoom[]>
  getChatRooms (
    ids: number[] | string[],
    page?: number,
    showRemoved?: boolean,
    showParticipant?: boolean,
    callback?: IQCallback<IQRoom[]>
  ): void | Promise<IQRoom[]> {
    let uniqueIds: string[] | null = null;
    let roomIds: number[] | null = null;
    if (isArrayOfNumber(ids)) { roomIds = ids }
    if (isArrayOfString(ids)) { uniqueIds = ids }
    return xs.combine(
      // process(roomIds, isOptArrayNumber({ roomIds })),
      // process(uniqueIds, isOptArrayString({ uniqueIds })),
      process(ids, isReqArrayOfStringOrNumber({ ids })),
      process(page, isOptNumber({ page })),
      process(showRemoved, isOptBoolean({ showRemoved })),
      process(showParticipant, isOptBoolean({ showParticipant })),
      process(callback, isOptCallback({ callback }))
    )
      .map(([_, page, showRemoved, showParticipant]) =>
        xs.fromPromise(this.roomAdapter.getRoomInfo(roomIds, uniqueIds, page, showRemoved, showParticipant))
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
    callback?: IQCallback<IQRoom[]>
  ): void | Promise<IQRoom[]> {
    return xs.combine(
      process(showParticipant, isOptBoolean({ showParticipant })),
      process(showRemoved, isOptBoolean({ showRemoved })),
      process(showEmpty, isOptBoolean({ showEmpty })),
      process(page, isOptNumber({ page })),
      process(limit, isOptNumber({ limit })),
      process(callback, isOptCallback({ callback }))
    )
      .map(([showParticipant, showRemoved, showEmpty, page, limit]) =>
        xs.fromPromise(this.roomAdapter.getRoomList(showParticipant, showRemoved, showEmpty, page, limit))
      )
      .flatten()
      .compose(tap((rooms) => {
        this._rooms.update((_rooms) => {
          return {
            ..._rooms,
            ...rooms.reduce((res, it) => {
              res[it.id] = it;
              return res
            }, {})
          }
        })
      }))
      .compose(toCallbackOrPromise(callback))
  }

  getChatRoomWithMessages (
    roomId: number,
    callback?: IQCallback<IQRoom>
  ): void | Promise<IQRoom> {
    return xs.combine(
      process(roomId, isReqNumber({ roomId })),
      process(callback, isOptCallback({ callback }))
    )
      .map(([roomId]) => xs.fromPromise(this.roomAdapter.getRoom(roomId)))
      .flatten()
      .compose(tap((room: IQRoom) => this._currentRoomId.set(room.id)))
      .compose(tap((room: IQRoom) => {
        this._getRoomById(room.id).update(it => ({ ...it, ...room }))
      }))
      .compose(toCallbackOrPromise(callback))
  }

  getTotalUnreadCount (callback?: IQCallback<number>): void | Promise<number> {
    return xs.combine(
      process(callback, isOptCallback({ callback }))
    )
      .map(() => xs.fromPromise(this.roomAdapter.getUnreadCount()))
      .flatten()
      .compose(toCallbackOrPromise(callback))
  }
  // ------------------------------------------------------

  // Message Adapter --------------------------------------
  sendMessage (
    roomId: number,
    message: IQMessageT,
    callback?: IQCallback<IQMessage>
  ): void | Promise<IQMessage> {
    return xs.combine(
      process(roomId, isReqNumber({ roomId })),
      process(message, isReqJson({ message })),
      process(callback, isOptCallback({ callback }))
    )
      .compose(tap(([roomId, message]) => {
        const m = QMessage.prepareNew(
          this.currentUser.userId,
          roomId,
          message.message,
          getMessageType(message.type),
          message.extras,
          message.payload
        );
        m.status = IQMessageStatus.Sending;
        this._messages.update(messages => ({
          ...messages,
          [m.uniqueId]: m
        }))
      }))
      .map(([roomId, message]) =>
        xs.fromPromise(this.messageAdapter.sendMessage(roomId, message))
      )
      .flatten()
      .compose(tap((message) => {
        this._messages.update((messages) => ({
          ...messages,
          [message.uniqueId]: message
        }))
      }))
      .compose(toCallbackOrPromise(callback))
  }

  markAsDelivered (
    roomId: number,
    messageId: number,
    callback?: IQCallback<IQMessage>
  ): void | Promise<IQMessage> {
    return xs.combine(
      process(roomId, isReqNumber({ roomId })),
      process(messageId, isReqNumber({ messageId })),
      process(callback, isOptCallback({ callback }))
    )
      .map(([roomId, messageId]) =>
        xs.fromPromise(this.messageAdapter.markAsDelivered(roomId, messageId))
      )
      .flatten()
      .compose(tap((message) => {
        this._getRoomById(roomId).update(updateRoomParticipantLastReceived(this.currentUser.userId, message.id))
      }))
      .compose(toCallbackOrPromise(callback))
  }

  markAsRead (
    roomId: number,
    messageId: number,
    callback?: IQCallback<IQMessage>
  ): void | Promise<IQMessage> {
    return xs.combine(
      process(roomId, isReqNumber({ roomId })),
      process(messageId, isReqNumber({ messageId })),
      process(callback, isOptCallback({ callback }))
    )
      .map(([roomId, messageId]) =>
        xs.fromPromise(this.messageAdapter.markAsRead(roomId, messageId)
      ))
      .flatten()
      .compose(tap((message) => {
        this._getRoomById(roomId).update(updateRoomParticipantLastRead(this.currentUser.userId, message.id))
      }))
      .compose(toCallbackOrPromise(callback))
  }

  deleteMessages (
    messageUniqueIds: string[],
    callback?: IQCallback<IQMessage[]>
  ): void | Promise<IQMessage[]> {
    return xs.combine(
      process(messageUniqueIds, isReqArrayString({ messageUniqueIds })),
      process(callback, isOptCallback({ callback }))
    )
      .map(([messageUniqueIds]) =>
        xs.fromPromise(this.messageAdapter.deleteMessage(messageUniqueIds))
      )
      .flatten()
      .compose(tap((messages) => {
        this._messages.update((_messages) => {
          const mIds = messages.map(it => it.uniqueId);
          return Object.values(_messages)
            .filter(it => !mIds.includes(it.uniqueId))
            .reduce((res, it) => {
              res[it.uniqueId] = it;
              return res
            }, {})
        })
      }))
      .compose(toCallbackOrPromise(callback))
  }

  getPreviouseMessagesById (
    roomId: number,
    limit?: number,
    messageId?: number,
    callback?: IQCallback<IQMessage[]>
  ): void | Promise<IQMessage[]> {
    return xs.combine(
      process(roomId, isReqNumber({ roomId })),
      process(limit, isOptNumber({ limit })),
      process(messageId, isOptNumber({ messageId })),
      process(callback, isOptCallback({ callback }))
    )
      .map(([roomId, limit, messageId]) =>
        xs.fromPromise(this.messageAdapter.getMessages(roomId, messageId, limit, false))
      )
      .flatten()
      .compose(tap((messages) => {
        this._messages.update((_messages) => {
          const m = messages.reduce((res, it) => {
            res[it.uniqueId] = it;
            return res
          }, {});
          return { ..._messages, ...m }
        })
      }))
      .compose(toCallbackOrPromise(callback))
  }

  getNextMessagesById (
    roomId: number,
    limit?: number,
    messageId?: number,
    callback?: IQCallback<IQMessage[]>
  ): void | Promise<IQMessage[]> {
    return xs.combine(
      process(roomId, isReqNumber({ roomId })),
      process(limit, isOptNumber({ limit })),
      process(messageId, isOptNumber({ messageId })),
      process(callback, isOptCallback({ callback }))
    )
      .map(([roomId, limit, messageId]) =>
        xs.fromPromise(this.messageAdapter.getMessages(roomId, messageId, limit, true))
      )
      .flatten()
      .compose(tap((messages) => {
        this._messages.update((_messages) => {
          const m = messages.reduce((res, it) => {
            res[it.uniqueId] = it;
            return res
          }, {});
          return { ..._messages, ...m }
        })
      }))
      .compose(toCallbackOrPromise(callback))
  }
  // -------------------------------------------------------

  // Misc --------------------------------------------------
  publishEvent (roomId: number, data: any): void {
    const userId = this.currentUser.userId;
    this.realtimeAdapter.mqtt.publishCustomEvent(roomId, userId, data)
  }

  setTyping (isTyping?: boolean): void {
    this.realtimeAdapter
      .sendTyping(this._currentRoomId.get(), this.currentUser.userId, isTyping || true)
  }

  subscribeEvent (roomId: number, callback: IQCallback<any>): void {
    this.realtimeAdapter.mqtt.subscribeCustomEvent(roomId, callback)
  }

  unsubscribeEvent (roomId: number): void {
    this.realtimeAdapter.mqtt.unsubscribeCustomEvent(roomId)
  }

  upload (file: File, callback?: IQProgressListener): void {}
  setSyncInterval (interval: number): void {
    this._syncInterval.set(interval)
  }

  synchronize (lastMessageId: number): void {
    this.realtimeAdapter.synchronize(lastMessageId)
  }

  synchronizeEvent (lastEventId: number): void {
    this.realtimeAdapter.synchronizeEvent(lastEventId)
  }
}
