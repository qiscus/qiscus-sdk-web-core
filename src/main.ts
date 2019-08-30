import pipe from 'callbag-pipe'
import Symbol from 'es6-symbol'
import fromPromise from 'callbag-from-promise'
import flatten from 'callbag-flatten'
import { Atom, atom, Derivable, lens } from 'derivable'
import getUserAdapter from './adapters/user'
import getMessageAdapter from './adapters/message'
import getRoomAdapter from './adapters/room'
import getRealtimeAdapter, { IQRealtimeAdapter } from './adapters/realtime'
import getHttpAdapter, { IQHttpAdapter } from './adapters/http'
import combine from './utils/callbag-combine'
import {
  IQCallback,
  IQiscus,
  IQMessage,
  IQMessageAdapter,
  IQMessageT,
  IQParticipant,
  IQProgressListener,
  IQRoom,
  IQRoomAdapter,
  IQUser,
  IQUserAdapter
} from './defs'
import {
  isOptCallback,
  isOptJson,
  isOptNumber,
  isOptString,
  isReqArrayNumber,
  isReqArrayString,
  isReqNumber,
  isReqString
} from './utils/param-utils'
import { process, tap, toCallbackOrPromise } from './utils/stream'
import xs from 'xstream'
import { map } from 'shades'

const __secret = Symbol('secret')
export type QSyncMode = 'socket' | 'http' | 'both'

export default class Qiscus implements IQiscus {
  private static _instance: Qiscus = null

  //<editor-fold desc="Property">
  private readonly syncMode: Atom<QSyncMode> = atom('socket')
  private readonly _currentUser: Atom<IQUser | null> = atom(null)
  private readonly rooms: Atom<{ [key: number]: IQRoom }> = atom({})
  private readonly messages: Atom<{ [key: string]: IQMessage }> = atom({})

  private readonly _token: Atom<string | null> = atom(null)
  private readonly _realtimeAdapter: Atom<IQRealtimeAdapter | null> = atom(null)
  private readonly _httpAdapter: Atom<IQHttpAdapter | null> = atom(null)
  private readonly _userAdapter: Atom<IQUserAdapter | null> = atom(null)
  private readonly _roomAdapter: Atom<IQRoomAdapter | null> = atom(null)
  private readonly _messageAdapter: Atom<IQMessageAdapter | null> = atom(null)
  private readonly _syncInterval: Atom<number> = atom(5000)
  private readonly _baseUrl: Atom<string> = atom(null)
  private readonly _brokerUrl: Atom<string | null> = atom(null)
  private readonly _appId: Atom<string> = atom(null)
  private readonly _isLogin = this._token.derive(token => token != null)
  private readonly _shouldSync = atom(true)

  private readonly currentRoomId: Atom<number | null> = atom(null)
  public readonly currentRoom: Derivable<IQRoom | null> = this.rooms.derive((rooms) => rooms[this.currentRoomId.get()])

  //</editor-fold>

  public static get instance (): Qiscus {
    if (this._instance == null) this._instance = new this()
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

  private get syncInterval () { return this._syncInterval.get() }

  private get shouldSync () { return this._shouldSync.get() }

  private getRoomById = (roomId) => lens({
    get: () => { return this.rooms.get()[roomId] },
    set: (room) => {
      this.rooms.update((rooms) => ({
        ...rooms,
        [roomId]: room
      }))
    }
  })
  private getParticipantsOfRoomById = (roomId) => lens({
    get: () => { return this.getRoomById(roomId).get().participants },
    set: (participants) => {
      this.getRoomById(roomId).update((room) => ({
        ...room,
        participants: participants,
        totalParticipants: participants.length
      }))
    }
  })

  init (appId: string, syncInterval: number = 5000): void {
    this.initWithCustomServer(
      appId,
      'https://api.qiscus.com/api/v2/sdk/',
      'wss://mqtt.qiscus.com:1886/mqtt',
      null,
      syncInterval
    )
  }

  initWithCustomServer (
    appId: string,
    baseUrl: string,
    brokerUrl: string,
    brokerLBUrl: string,
    syncInterval: number = 5000
  ): void {
    this._appId.set(appId)
    this._baseUrl.set(baseUrl)
    this._brokerUrl.set(brokerUrl)
    this.syncMode.set('socket')
    this._syncInterval.set(syncInterval)
    this._httpAdapter.set(getHttpAdapter({
      baseUrl: this.baseUrl,
      getAppId: () => this.appId,
      getToken: () => this.token,
      getUserId: () => this.userAdapter.currentUserId,
      getSdkVersion: () => '3-beta'
    }))
    this._userAdapter.set(getUserAdapter(this.httpAdapter))
    this._roomAdapter.set(getRoomAdapter(this.httpAdapter, this.userAdapter))
    this._messageAdapter.set(getMessageAdapter(this.httpAdapter, this.userAdapter, this.roomAdapter))
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
          this._currentUser.set(user)
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
        this._currentUser.set(null)
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

  getBlockedUserList (
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

  getUserList (
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
        this.getRoomById(room.id).set(room)
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
      process(userIds, isReqArrayNumber({ userIds })),
      process(callback, isOptCallback({ callback }))
    )
      .map(([roomId, userIds]) => xs.fromPromise(this.roomAdapter.addParticipants(roomId, userIds)))
      .flatten()
      .compose(tap((participants) => {
        this.getParticipantsOfRoomById(roomId)
          .update((it) => [
            ...it,
            ...participants
          ])
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
        // TODO: Update local data to remove messages from room with selected ids
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
        this.getRoomById(room.id).set(room)
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
        this.getRoomById(room.id).set(room)
      }))
      .compose(toCallbackOrPromise(callback))
  }

  getParticipantList (
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

  getChatRoom (
    roomId: number,
    uniqueId: number,
    page?: number,
    showRemoved?: boolean,
    showParticipant?: boolean,
    callback?: IQCallback<IQRoom>
  ): void | Promise<IQRoom> {
    return pipe(
      combine(
        process(roomId, isReqNumber('`roomId` need to be number')),
        process(uniqueId, isReqString('`uniqueId` need to be string')),
        process(page, isOptNumber('`page` need to be number or null')),
        process(
          showRemoved,
          isOptBoolean('`showRemoved` need to be boolean or null')
        ),
        process(
          showParticipant,
          isOptBoolean('`showParticipant` need to be boolean or null')
        ),
        process(
          callback,
          isOptCallback('`callback` need to be function or null')
        )
      ),
      map(([roomId, uniqueId, page, showRemoved, showParticipant]) =>
        fromPromise(
          this.roomAdapter.getRoomInfo(
            roomId,
            uniqueId,
            page,
            showRemoved,
            showParticipant
          )
        )
      ),
      flatten,
      toCallbackOrPromise(callback)
    )
  }

  getChatRooms (
    showParticipant?: boolean,
    showRemoved?: boolean,
    showEmpty?: boolean,
    page?: number,
    limit?: number,
    callback?: IQCallback<IQRoom[]>
  ): void | Promise<IQRoom[]> {
    return pipe(
      combine(
        process(
          showParticipant,
          isOptBoolean('`showParticipant` need to be boolean or null')
        ),
        process(
          showRemoved,
          isOptBoolean('`showRemoved` need to be boolean or null')
        ),
        process(
          showEmpty,
          isOptBoolean('`showEmpty` need to be boolean or null')
        ),
        process(page, isOptNumber('`page` need to be number or null')),
        process(limit, isOptNumber('`limit` need to be number or null')),
        process(
          callback,
          isOptCallback('`callback` need to be function or  null')
        )
      ),
      map(([showParticipant, showRemoved, showEmpty, page, limit]) =>
        fromPromise(
          this.roomAdapter.getRoomList(
            showParticipant,
            showRemoved,
            showEmpty,
            page,
            limit
          )
        )
      ),
      flatten,
      toCallbackOrPromise(callback)
    )
  }

  getChatRoomWithMessages (
    roomId: number,
    callback?: IQCallback<IQRoom>
  ): void | Promise<IQRoom> {
    return pipe(
      combine(
        process(roomId, isReqNumber('`roomId` need to be number')),
        process(
          callback,
          isOptCallback('`callback` need to be function or null')
        )
      ),
      map(([roomId]) => fromPromise(this.roomAdapter.getRoom(roomId))),
      flatten,
      toCallbackOrPromise(callback)
    )
  }

  getTotalUnreadCount (callback?: IQCallback<number>): void | Promise<number> {
    return pipe(
      process(
        callback,
        isOptCallback('`callback` need to be function or null')
      ),
      map(() => fromPromise(this.roomAdapter.getUnreadCount())),
      flatten,
      toCallbackOrPromise(callback)
    )
  }

  // ------------------------------------------------------

  // Message Adapter --------------------------------------
  sendMessage (
    roomId: number,
    message: IQMessageT,
    callback?: IQCallback<IQMessage>
  ): void | Promise<IQMessage> {
    return pipe(
      combine(
        process(roomId, isReqNumber('`roomId` need to be number')),
        process(message, isReqJson('`message` need to be object')),
        process(
          callback,
          isOptCallback('`callback` need to be function or null')
        )
      ),
      map(([roomId, message]) =>
        fromPromise(this.messageAdapter.sendMessage(roomId, message))
      ),
      flatten,
      toCallbackOrPromise(callback)
    )
  }

  markAsDelivered (
    roomId: number,
    messageId: number,
    callback?: IQCallback<IQMessage>
  ): void | Promise<IQMessage> {
    return pipe(
      combine(
        process(roomId, isReqNumber('`roomId` need to be number')),
        process(messageId, isReqNumber('`messageId` need to be number')),
        process(
          callback,
          isOptCallback('`callback` need to be function or null')
        )
      ),
      map(([roomId, messageId]) =>
        fromPromise(this.messageAdapter.markAsRead(roomId, messageId))
      ),
      flatten,
      toCallbackOrPromise(callback)
    )
  }

  markAsRead (
    roomId: number,
    messageId: number,
    callback?: IQCallback<IQMessage>
  ): void | Promise<IQMessage> {
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

  deleteMessages (
    messageUniqueIds: string[],
    callback?: IQCallback<IQMessage[]>
  ): void | Promise<IQMessage[]> {
    return pipe(
      combine(
        process(
          messageUniqueIds,
          isReqArrayString('`messageUniqueIds` need to be array of string')
        ),
        process(
          callback,
          isOptCallback('`callback` need to be function or null')
        )
      ),
      map(([messageUniqueIds]) =>
        fromPromise(this.messageAdapter.deleteMessage(messageUniqueIds))
      ),
      flatten,
      toCallbackOrPromise(callback)
    )
  }

  getPreviouseMessagesById (
    roomId: number,
    limit?: number,
    messageId?: number,
    callback?: IQCallback<IQMessage[]>
  ): void | Promise<IQMessage[]> {
    return pipe(
      combine(
        process(roomId, isReqNumber('`roomId` need to be number')),
        process(limit, isOptNumber('`limit` need to be number or null')),
        process(
          messageId,
          isOptNumber('`messageId` need to be number or null')
        ),
        process(
          callback,
          isOptCallback('`callback` need to be function or null')
        )
      ),
      map(([roomId, limit, messageId]) =>
        fromPromise(
          this.messageAdapter.getMessages(roomId, messageId, limit, false)
        )
      ),
      flatten,
      toCallbackOrPromise(callback)
    )
  }

  getNextMessagesById (
    roomId: number,
    limit?: number,
    messageId?: number,
    callback?: IQCallback<IQMessage[]>
  ): void | Promise<IQMessage[]> {
    return pipe(
      combine(
        process(roomId, isReqNumber('`roomId` need to be number')),
        process(limit, isOptNumber('`limit` need to be number or null')),
        process(messageId, isOptNumber('`limit` need to be number or null')),
        process(
          callback,
          isOptCallback('`callback` need to be function or null')
        )
      ),
      map(([roomId, limit, messageId]) =>
        fromPromise(
          this.messageAdapter.getMessages(roomId, messageId, limit, true)
        )
      ),
      flatten,
      toCallbackOrPromise(callback)
    )
  }

  // -------------------------------------------------------

  // Misc --------------------------------------------------
  publishEvent (eventId: string, data: any): void {}

  removeParticipants (
    roomId: number,
    participantIds: string[],
    callback?: IQCallback<any>
  ): void {}

  setTyping (isTyping?: boolean): void {}

  subscribeEvent (eventId: string, callback: IQCallback<any>): void {}

  unsubscribeEvent (eventId): void {}

  upload (file: File, callback?: IQProgressListener): void {}

  synchronize (lastMessageId: number): void {
    this.realtimeAdapter.synchronize(lastMessageId)
  }

  syncrhronizeEvent (lastEventId: number): void {
    this.realtimeAdapter.synchronizeEvent(lastEventId)
  }
}
