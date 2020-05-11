import axios, { AxiosResponse } from 'axios'
import { atom } from 'derivable'
import xs from 'xstream'
import { getLogger } from './adapters/logger'
import getMessageAdapter from './adapters/message'
import getRealtimeAdapter from './adapters/realtime'
import getRoomAdapter from './adapters/room'
import getUserAdapter from './adapters/user'
import getSetupAdapter from './adapters/setup'
import {
  Callback,
  IQCallback,
  IQMessageT,
  IQMessageType,
  IQProgressListener,
  Subscription,
  UploadResult,
  isChatRoom,
} from './defs'
import { hookAdapterFactory, Hooks } from './hook'
import * as model from './model'
import * as Provider from './provider'
import { storageFactory } from './storage'
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
  isReqBoolean,
  isReqJson,
  isReqNumber,
  isReqString,
  isRequired,
} from './utils/param-utils'
import {
  bufferUntil,
  process,
  subscribeOnNext,
  tap,
  toCallbackOrPromise,
  toEventSubscription,
  toEventSubscription_,
} from './utils/stream'

import flattenConcurrently from 'xstream/extra/flattenConcurrently'

export default class Qiscus {
  private static _instance: Qiscus

  private storage = storageFactory()

  // region Property
  private readonly hookAdapter = hookAdapterFactory()
  private readonly userAdapter = getUserAdapter(this.storage)
  private readonly setupAdapter = getSetupAdapter(this.storage)
  private readonly realtimeAdapter = getRealtimeAdapter(this.storage)
  private readonly loggerAdapter = getLogger(this.storage)
  private readonly roomAdapter = getRoomAdapter(this.storage)
  private readonly messageAdapter = getMessageAdapter(this.storage)

  private readonly _customHeaders = atom<{ [key: string]: string }>({})

  private readonly _onMessageReceived$ = this.realtimeAdapter
    .onNewMessage$()
    .map(it => this.hookAdapter.triggerBeforeReceived$(it))
    .compose(flattenConcurrently)
    .compose(
      tap(message => {
        if (this.currentUser?.id !== message.sender.id) {
          this.messageAdapter.markAsDelivered(message.chatRoomId, message.id)
        }
      })
    )
  private readonly _onMessageRead$ = this.realtimeAdapter
    .onMessageRead$()
    .map(this.hookAdapter.triggerBeforeReceived$)
    .compose(flattenConcurrently)
  private readonly _onMessageDelivered$ = this.realtimeAdapter
    .onMessageDelivered$()
    .map(this.hookAdapter.triggerBeforeReceived$)
    .compose(flattenConcurrently)
  private readonly _onMessageDeleted$ = this.realtimeAdapter.onMessageDeleted$
    .map(this.hookAdapter.triggerBeforeReceived$)
    .compose(flattenConcurrently)
  private readonly _onRoomCleared$ = this.realtimeAdapter
    .onRoomCleared$()
    .map(this.hookAdapter.triggerBeforeReceived$)
    .compose(flattenConcurrently)
  // endregion

  public static get instance(): Qiscus {
    if (this._instance == null) this._instance = new this()
    return this._instance
  }

  // region helpers
  public get appId() {
    return this.storage.getAppId()
  }
  public get token() {
    return this.storage.getToken()
  }
  public get isLogin() {
    return this.currentUser != null
  }
  public get currentUser() {
    return this.storage.getCurrentUser()
  }
  // endregion

  // Setup Adapter ----------------------------------------
  setup(appId: string, syncInterval: number = 5000, callback: void): void {
    this.setupWithCustomServer(
      appId,
      undefined,
      undefined,
      undefined,
      syncInterval,
      callback
    )
  }

  setupWithCustomServer(
    appId: string,
    baseUrl: string = this.storage.getBaseUrl(),
    brokerUrl: any = this.storage.getBrokerUrl(),
    brokerLbUrl: string = this.storage.getBrokerLbUrl(),
    syncInterval: number = 5000,
    callback: void
  ): void {
    this.storage.setAppId(appId)

    xs.combine(
      process(appId, isReqString({ appId })),
      process(baseUrl, isReqString({ baseUrl })),
      process(brokerLbUrl, isReqString({ brokerLbUrl })),
      process(brokerUrl, isReqString({ brokerUrl })),
      process(syncInterval, isReqNumber({ syncInterval })),
      process(callback, isOptCallback({ callback }))
    )
    .map(() => xs.fromPromise(this.setupAdapter.setupWithCustomServer()))
    .compose(flattenConcurrently)
    .compose(
      tap(resp => {
        const defaultBaseUrl = this.storage.getBaseUrl()
        const defaultBrokerLbUrl = this.storage.getBrokerLbUrl()
        const defaultBrokerUrl = this.storage.getBrokerUrl()
        const defaultEnableEventReport = this.storage.getEnableEventReport()
        const defaultEnableRealtime = this.storage.getEnableRealtime()
        const defaultEnableRealtimeCheck = this.storage.getEnableRealtimeCheck()
        const defaultExtras = this.storage.getExtras()
        const defaultSyncInterval = this.storage.getSyncInterval()
        const defaultSyncIntervalWhenConnected = this.storage.getSyncIntervalWhenConnected()
    
        // We need to disable realtime load balancing if user are using custom server
        // and did not provide a brokerLbUrl
        const isDifferentBaseUrl = baseUrl !== defaultBaseUrl
        const isDifferentBrokerUrl = brokerUrl !== defaultBrokerUrl
        const isDifferentBrokerLbUrl = brokerLbUrl !== defaultBrokerLbUrl
        // disable realtime lb if user change baseUrl or mqttUrl but did not change
        // broker lb url
        if (
          (isDifferentBaseUrl || isDifferentBrokerUrl) &&
          !isDifferentBrokerLbUrl
        ) {
          this.loggerAdapter.log(
            '' +
              'force disable load balancing for realtime server, because ' +
              '`baseUrl` or `brokerUrl` get changed but ' +
              'did not provide `brokerLbURL`'
          )
          this.storage.setBrokerLbEnabled(false)
        }
    
        this.storage.setAppId(appId)
        
        const customSetterHelper = (
          fromUser: any,
          fromServer: any,
          defaultValue: any
        ) => {
          if (fromServer == '') {
            if (fromUser != null) {
              if (typeof fromUser !== 'string') return fromUser
              if (fromUser.length > 0) return fromUser
            }
          }
          if (fromServer != null) {
            if (fromServer.length > 0) return fromServer
            if (typeof fromServer !== 'string') return fromServer
          }
          return defaultValue
        }

        const mqttWssCheck = (mqttResult : string) => {
          if (mqttResult.includes('wss://')) {
            return mqttResult
          } else {
            return `wss://${mqttResult}:1886/mqtt`
          }
        }

        this.storage.setBaseUrl(customSetterHelper(baseUrl, resp.results.base_url, defaultBaseUrl))
        this.storage.setBrokerLbUrl(customSetterHelper(brokerLbUrl, resp.results.broker_lb_url, defaultBrokerLbUrl))
        this.storage.setBrokerUrl(mqttWssCheck(customSetterHelper(brokerUrl, resp.results.broker_url, defaultBrokerUrl)))
        this.storage.setSyncInterval(customSetterHelper(syncInterval, resp.results.sync_interval, defaultSyncInterval))

        this.storage.setEnableEventReport(customSetterHelper(null, resp.results.enable_event_report, defaultEnableEventReport))
        this.storage.setEnableRealtime(customSetterHelper(null, resp.results.enable_realtime, defaultEnableRealtime))
        this.storage.setEnableRealtimeCheck(customSetterHelper(null, resp.results.enable_realtime_check, defaultEnableRealtimeCheck))
        this.storage.setExtras(customSetterHelper(null, resp.results.extras, defaultExtras))
        this.storage.setSyncInterval(customSetterHelper(null, resp.results.sync_interval, defaultSyncInterval))
        this.storage.setSyncIntervalWhenConnected(customSetterHelper(null, resp.results.sync_on_connect, defaultSyncIntervalWhenConnected))
        
        this.storage.setDebugEnabled(false)
        this.storage.setVersion('3-alpha')
      })
    )
    .compose(toCallbackOrPromise())
  }

  setCustomHeader(headers: Record<string, string>): void {
    this._customHeaders.set(headers)
  }

  // User Adapter ------------------------------------------
  setUser(
    userId: string,
    userKey: string,
    username?: string,
    avatarUrl?: string,
    extras?: object | null,
    callback?: null | IQCallback<model.IQAccount>
  ): void | Promise<model.IQAccount> {
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
        xs.fromPromise(
          this.userAdapter.login(userId, userKey, {
            name: username,
            avatarUrl,
            extras,
          } as { name: string; avatarUrl: string; extras: any })
        )
      )
      .compose(flattenConcurrently)
      .compose(
        tap(() => {
          this.realtimeAdapter.mqtt.conneck()
          this.realtimeAdapter.mqtt.subscribeUser(this.storage.getToken())
        })
      )
      .compose(toCallbackOrPromise(callback))
  }

  blockUser(
    userId: string,
    callback: IQCallback<model.IQUser>
  ): void | Promise<model.IQUser> {
    return xs
      .combine(
        process(userId, isReqString({ userId })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([userId]) => xs.fromPromise(this.userAdapter.blockUser(userId)))
      .compose(flattenConcurrently)
      .compose(toCallbackOrPromise(callback))
  }

  clearUser(callback: IQCallback<void>): void | Promise<void> {
    // this method should clear currentUser and token
    return xs
      .combine(process(callback, isOptCallback({ callback })))
      .map(() =>
        xs.fromPromise(
          Promise.all([
            Promise.resolve(this.publishOnlinePresence(false)),
            Promise.resolve(this.userAdapter.clear()),
            Promise.resolve(this.realtimeAdapter.clear()),
          ])
        )
      )
      .compose(flattenConcurrently)
      .map(() => undefined as void)
      .compose(toCallbackOrPromise(callback))
  }

  unblockUser(
    userId: string,
    callback?: IQCallback<model.IQUser>
  ): void | Promise<model.IQUser> {
    return xs
      .combine(
        process(userId, isReqString({ userId })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([userId]) => xs.fromPromise(this.userAdapter.unblockUser(userId)))
      .compose(flattenConcurrently)
      .compose(toCallbackOrPromise(callback))
  }

  getUserPresence(
    userIds: string[],
    callback: IQCallback<model.IQUserPresence[]>
  ): void | Promise<model.IQUserPresence[]> {
    return xs
      .combine(
        process(userIds, isReqArrayString({ userIds })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([userId]) => 
        xs.fromPromise(this.userAdapter.getUserPresence(userId))
      )
      .compose(flattenConcurrently)
      .compose(toCallbackOrPromise(callback))
  }

  updateUser(
    username: string,
    avatarUrl: string,
    extras?: object,
    callback?: IQCallback<model.IQAccount>
  ): void | Promise<model.IQAccount> {
    // this method should update current user
    return xs
      .combine(
        process(username, isOptString({ username })),
        process(avatarUrl, isOptString({ avatarUrl })),
        process(extras, isOptJson({ extras })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([username, avatarUrl, extras]) =>
        xs.fromPromise(
          this.userAdapter.updateUser(username, avatarUrl, extras as any)
        )
      )
      .compose(flattenConcurrently)
      .compose(
        tap((user: model.IQAccount) => {
          const currentUser = this.storage.getCurrentUser()
          this.storage.setCurrentUser({
            ...currentUser,
            ...user,
          })
        })
      )
      .compose(toCallbackOrPromise(callback))
  }

  getBlockedUsers(
    page?: number,
    limit?: number,
    callback?: IQCallback<model.IQUser[]>
  ): void | Promise<model.IQUser[]> {
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
      .compose(flattenConcurrently)
      .compose(toCallbackOrPromise(callback))
  }

  getUsers(
    searchUsername?: string,
    page?: number,
    limit?: number,
    callback?: IQCallback<model.IQUser[]>
  ): void | Promise<model.IQUser[]> {
    return xs
      .combine(
        process(searchUsername, isOptString({ searchUsername })),
        process(page, isOptNumber({ page })),
        process(limit, isOptNumber({ limit })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([search, page, limit]) =>
        xs.fromPromise(this.userAdapter.getUserList(search, page, limit))
      )
      .compose(flattenConcurrently)
      .compose(toCallbackOrPromise(callback))
  }

  getJWTNonce(callback?: IQCallback<string>): void | Promise<string> {
    return xs
      .combine(process(callback, isOptCallback({ callback })))
      .map(() => xs.fromPromise(this.userAdapter.getNonce()))
      .compose(flattenConcurrently)
      .map(nonce => nonce)
      .compose(toCallbackOrPromise(callback))
  }

  getUserData(
    callback?: IQCallback<model.IQAccount>
  ): void | Promise<model.IQAccount> {
    return xs
      .combine(process(callback, isOptCallback({ callback })))
      .compose(bufferUntil(() => this.isLogin))
      .map(() => xs.fromPromise(this.userAdapter.getUserData()))
      .compose(flattenConcurrently)
      .compose(toCallbackOrPromise(callback))
  }

  registerDeviceToken(
    token: string,
    isDevelopment: boolean,
    callback?: IQCallback<boolean>
  ): void | Promise<boolean> {
    return xs
      .combine(
        process(token, isReqString({ token })),
        process(isDevelopment, isOptBoolean({ isDevelopment })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([token, isDevelopment]) =>
        xs.fromPromise(
          this.userAdapter.registerDeviceToken(token, isDevelopment)
        )
      )
      .compose(flattenConcurrently)
      .compose(toCallbackOrPromise(callback))
  }

  removeDeviceToken(
    token: string,
    isDevelopment: boolean,
    callback?: IQCallback<boolean>
  ): void | Promise<boolean> {
    return xs
      .combine(
        process(token, isReqString({ token })),
        process(isDevelopment, isOptBoolean({ isDevelopment })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([token, isDevelopment]) =>
        xs.fromPromise(
          this.userAdapter.unregisterDeviceToken(token, isDevelopment)
        )
      )
      .compose(flattenConcurrently)
      .compose(toCallbackOrPromise(callback))
  }

  updateChatRoom(
    roomId: number,
    name?: string,
    avatarUrl?: string,
    extras?: object,
    callback?: IQCallback<model.IQChatRoom>
  ): void | Promise<model.IQChatRoom> {
    // this method should update room list
    return xs
      .combine(
        process(roomId, isReqNumber({ roomId })),
        process(name, isOptString({ name })),
        process(avatarUrl, isOptString({ avatarUrl })),
        process(extras, isOptJson({ extras }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([roomId, name, avatarUrl, extras]) =>
        xs.fromPromise(
          this.roomAdapter.updateRoom(roomId, name, avatarUrl, extras as any)
        )
      )
      .compose(flattenConcurrently)
      .compose(toCallbackOrPromise(callback))
  }

  setUserWithIdentityToken(
    token: string,
    callback?: IQCallback<model.IQAccount>
  ): void | Promise<model.IQAccount> {
    return xs
      .combine(
        process(token, isReqString({ token })),
        process(callback, isOptCallback({ callback }))
      )
      .map(([token]) =>
        xs.fromPromise(this.userAdapter.setUserFromIdentityToken(token))
      )
      .compose(flattenConcurrently)
      .compose(toCallbackOrPromise(callback))
  }

  getChannel(
    uniqueId: string,
    callback?: IQCallback<model.IQChatRoom>
  ): void | Promise<model.IQChatRoom> {
    return xs
      .combine(
        process(uniqueId, isReqString({ uniqueId })),
        process(callback, isOptCallback({ callback }))
      )
      .map(([uniqueId]) =>
        xs.fromPromise(this.roomAdapter.getChannel(uniqueId))
      )
      .compose(flattenConcurrently)
      .compose(toCallbackOrPromise(callback))
  }
  // -------------------------------------------------------

  // Room Adapter ------------------------------------------
  chatUser(
    userId: string,
    extras: object,
    callback?: IQCallback<model.IQChatRoom>
  ): void | Promise<model.IQChatRoom> {
    return xs
      .combine(
        process(userId, isReqString({ userId })),
        process(extras, isOptJson({ extras })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([userId, extras]) =>
        xs.fromPromise(this.roomAdapter.chatUser(userId, extras as any))
      )
      .compose(flattenConcurrently)
      .compose(toCallbackOrPromise(callback))
  }

  addParticipants(
    roomId: number,
    userIds: string[],
    callback?: IQCallback<model.IQParticipant[]>
  ): void | Promise<model.IQParticipant[]> {
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
      .compose(flattenConcurrently)
      .compose(toCallbackOrPromise(callback))
  }

  removeParticipants(
    roomId: number,
    userIds: string[],
    callback?: IQCallback<model.IQParticipant[]>
  ): void | Promise<model.IQParticipant[] | string[]> {
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
      .compose(flattenConcurrently)
      .compose(toCallbackOrPromise(callback))
  }

  clearMessagesByChatRoomId(
    roomUniqueIds: string[],
    callback?: IQCallback<void>
  ): void | Promise<void> {
    return xs
      .combine(
        process(roomUniqueIds, isReqArrayString({ roomIds: roomUniqueIds })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([roomIds]) => xs.fromPromise(this.roomAdapter.clearRoom(roomIds)))
      .compose(flattenConcurrently)
      .compose(toCallbackOrPromise(callback))
  }

  createGroupChat(
    name: string,
    userIds: string[],
    avatarUrl: string,
    extras: object,
    callback?: IQCallback<model.IQChatRoom>
  ): void | Promise<model.IQChatRoom> {
    return xs
      .combine(
        process(name, isReqString({ name })),
        process(userIds, isReqArrayString({ userIds })),
        process(avatarUrl, isOptString({ avatarUrl })),
        process(extras, isOptJson({ extras })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([name, userIds, avatarUrl, extras]) =>
        xs.fromPromise(
          this.roomAdapter.createGroup(name, userIds, avatarUrl, extras as any)
        )
      )
      .compose(flattenConcurrently)
      .compose(toCallbackOrPromise(callback))
  }

  createChannel(
    uniqueId: string,
    name: string,
    avatarUrl: string,
    extras: object,
    callback?: IQCallback<model.IQChatRoom>
  ): void | Promise<model.IQChatRoom> {
    return xs
      .combine(
        process(uniqueId, isReqString({ uniqueId })),
        process(name, isReqString({ name })),
        process(avatarUrl, isOptString({ avatarUrl })),
        process(extras, isOptJson({ extras })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([uniqueId, name, avatarUrl, extras]) =>
        xs.fromPromise(
          this.roomAdapter.getChannel(uniqueId, name, avatarUrl, extras as any)
        )
      )
      .compose(flattenConcurrently)
      .compose(toCallbackOrPromise(callback))
  }

  getParticipants(
    roomUniqueId: string,
    page?: number,
    limit?: number,
    sorting?: 'asc' | 'desc',
    callback?: IQCallback<model.IQParticipant[]>
  ): void | Promise<model.IQParticipant[]> {
    return xs
      .combine(
        process(roomUniqueId, isReqString({ roomUniqueId })),
        process(page, isOptNumber({ page })),
        process(limit, isOptNumber({ limit })),
        process(sorting, isOptString({ sorting })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([roomId, page, limit, sorting]) =>
        xs.fromPromise(
          this.roomAdapter.getParticipantList(roomId, page, limit, sorting)
        )
      )
      .compose(flattenConcurrently)
      .compose(toCallbackOrPromise(callback))
  }

  getChatRooms(
    roomIds: number[],
    page?: number,
    showRemoved?: boolean,
    showParticipant?: boolean,
    callback?: IQCallback<model.IQChatRoom[]>
  ): void | Promise<model.IQChatRoom[]>
  getChatRooms(
    uniqueIds: string[],
    page?: number,
    showRemoved?: boolean,
    showParticipant?: boolean,
    callback?: IQCallback<model.IQChatRoom[]>
  ): void | Promise<model.IQChatRoom[]>
  getChatRooms(
    ids: number[] | string[],
    page?: number,
    showRemoved?: boolean,
    showParticipant?: boolean,
    callback?: IQCallback<model.IQChatRoom[]>
  ): void | Promise<model.IQChatRoom[]> {
    let uniqueIds: string[] | undefined
    let roomIds: number[] | undefined
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
      .compose(flattenConcurrently)
      .compose(toCallbackOrPromise(callback))
  }

  getAllChatRooms(
    showParticipant?: boolean,
    showRemoved?: boolean,
    showEmpty?: boolean,
    page?: number,
    limit?: number,
    callback?: IQCallback<model.IQChatRoom[]>
  ): void | Promise<model.IQChatRoom[]> {
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
      .compose(flattenConcurrently)
      .compose(toCallbackOrPromise(callback))
  }

  getChatRoomWithMessages(
    roomId: number,
    callback?: IQCallback<model.IQChatRoom>
  ): void | Promise<model.IQChatRoom> {
    return xs
      .combine(
        process(roomId, isReqNumber({ roomId })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([roomId]) => xs.fromPromise(this.roomAdapter.getRoom(roomId)))
      .compose(flattenConcurrently)
      .compose(toCallbackOrPromise(callback) as any)
  }

  getTotalUnreadCount(callback?: IQCallback<number>): void | Promise<number> {
    return xs
      .combine(process(callback, isOptCallback({ callback })))
      .compose(bufferUntil(() => this.isLogin))
      .map(() => xs.fromPromise(this.roomAdapter.getUnreadCount()))
      .compose(flattenConcurrently)
      .compose(toCallbackOrPromise(callback))
  }
  // ------------------------------------------------------

  // Message Adapter --------------------------------------
  sendMessage(
    roomId: number,
    message: IQMessageT,
    callback?: IQCallback<model.IQMessage>
  ): void | Promise<model.IQMessage> {
    return xs
      .combine(
        process(roomId, isReqNumber({ roomId })),
        process(message, isReqJson({ message })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([roomId, message]) =>
        xs.fromPromise(
          Promise.all([
            roomId,
            this.hookAdapter.trigger(
              Hooks.MESSAGE_BEFORE_SENT,
              message
            ) as Promise<typeof message>,
          ])
        )
      )
      .compose(flattenConcurrently)
      .map(([roomId, message]) =>
        xs.fromPromise(this.messageAdapter.sendMessage(roomId, message))
      )
      .compose(flattenConcurrently)
      .compose(toCallbackOrPromise(callback))
  }

  markAsDelivered(
    roomId: number,
    messageId: number,
    callback?: IQCallback<void>
  ): void | Promise<void> {
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
      .compose(flattenConcurrently)
      .compose(toCallbackOrPromise(callback))
  }

  markAsRead(
    roomId: number,
    messageId: number,
    callback?: IQCallback<void>
  ): void | Promise<void> {
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
      .compose(flattenConcurrently)
      .compose(toCallbackOrPromise(callback))
  }

  deleteMessages(
    messageUniqueIds: string[],
    callback?: IQCallback<model.IQMessage[]>
  ): void | Promise<model.IQMessage[]> {
    return xs
      .combine(
        process(messageUniqueIds, isReqArrayString({ messageUniqueIds })),
        process(callback, isOptCallback({ callback }))
      )
      .compose(bufferUntil(() => this.isLogin))
      .map(([messageUniqueIds]) =>
        xs.fromPromise(this.messageAdapter.deleteMessage(messageUniqueIds))
      )
      .compose(flattenConcurrently)
      .compose(toCallbackOrPromise(callback))
  }

  getPreviousMessagesById(
    roomId: number,
    limit?: number,
    messageId?: number,
    callback?: IQCallback<model.IQMessage[]>
  ): void | Promise<model.IQMessage[]> {
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
      .compose(flattenConcurrently)
      .compose(toCallbackOrPromise(callback))
  }

  getNextMessagesById(
    roomId: number,
    limit?: number,
    messageId?: number,
    callback?: IQCallback<model.IQMessage[]>
  ): void | Promise<model.IQMessage[]> {
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
      .compose(flattenConcurrently)
      .compose(toCallbackOrPromise(callback))
  }
  // -------------------------------------------------------

  // Misc --------------------------------------------------
  publishCustomEvent(
    roomId: number,
    data: any,
    callback?: Callback<void>
  ): void {
    const userId = this.currentUser?.id
    xs.combine(
      process(roomId, isReqNumber({ roomId })),
      process(userId, isReqString({ userId })),
      process(data, isOptJson({ data }))
    )
      .compose(bufferUntil(() => this.isLogin))
      .map(([roomId, userId, data]) =>
        xs.fromPromise(
          Promise.resolve(
            this.realtimeAdapter.mqtt.publishCustomEvent(roomId, userId, data)
          )
        )
      )
      .compose(flattenConcurrently)
      .compose(toCallbackOrPromise(callback))
  }

  publishOnlinePresence(isOnline: boolean, callback?: Callback<void>): void {
    const userId = this.currentUser?.id
    xs.combine(
      process(isOnline, isReqBoolean({ isOnline })),
      process(userId, isReqString({ userId }))
    )
      .compose(bufferUntil(() => this.isLogin))
      .map(([isOnline, userId]) =>
        xs.fromPromise(
          Promise.resolve(this.realtimeAdapter.sendPresence(userId, isOnline))
        )
      )
      .compose(flattenConcurrently)
      .compose(toCallbackOrPromise(callback))
  }
  publishTyping(roomId: number, isTyping?: boolean): void {
    this.realtimeAdapter.sendTyping(
      roomId,
      this.currentUser.id,
      isTyping || true
    )
  }

  subscribeCustomEvent(roomId: number, callback: IQCallback<any>): void {
    this.realtimeAdapter.mqtt.subscribeCustomEvent(roomId, callback)
  }

  unsubscribeCustomEvent(roomId: number): void {
    this.realtimeAdapter.mqtt.unsubscribeCustomEvent(roomId)
  }

  upload(file: File, callback?: IQProgressListener): void {
    const data = new FormData()
    data.append('file', file)
    data.append('token', this.token)

    axios({
      ...Provider.withHeaders(this.storage),
      baseURL: this.storage.getBaseUrl(),
      url: this.storage.getUploadUrl(),
      method: 'post',
      data: data,
      onUploadProgress(event: ProgressEvent) {
        const percentage = ((event.loaded / event.total) * 100).toFixed(2)
        callback?.(void 0, Number(percentage))
      },
    })
      .then((resp: AxiosResponse<UploadResult>) => {
        const url = resp.data.results.file.url
        callback?.(void 0, void 0, url)
      })
      .catch(error => callback?.(error))
  }

  hasSetupUser(callback: IQCallback<boolean>): void | Promise<boolean> {
    return xs
      .of(this.currentUser)
      .map(user => user != null)
      .compose(toCallbackOrPromise(callback))
  }

  sendFileMessage(
    roomId: number,
    message: string,
    file: File,
    callback?: IQProgressListener<model.IQMessage>
  ): void {
    this.upload(file, (error, progress, url) => {
      if (error) return callback?.(error)
      if (progress) callback?.(undefined, progress)
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
          callback?.(undefined, undefined, msg)
        })
      }
    })
  }

  getThumbnailURL(url: string) {
    return url.replace('/upload/', '/upload/w_30,c_scale/')
  }

  setSyncInterval(interval: number): void {
    this.storage.setSyncInterval(interval)
  }

  synchronize(lastMessageId: model.IQAccount['lastMessageId']): void {
    this.realtimeAdapter.synchronize(lastMessageId)
  }

  synchronizeEvent(lastEventId: model.IQAccount['lastSyncEventId']): void {
    this.realtimeAdapter.synchronizeEvent(lastEventId)
  }

  enableDebugMode(enable: boolean, callback: Callback<void>) {
    process(enable, isReqBoolean({ enable }))
      .compose(bufferUntil(() => this.isLogin))
      .map((enable: boolean) => this.loggerAdapter.setEnable(enable))
      .compose(toCallbackOrPromise(callback))
  }
  static Interceptor = Hooks
  get Interceptor() {
    return Hooks
  }
  intercept(interceptor: string, callback: (data: unknown) => unknown) {
    return this.hookAdapter.intercept(interceptor, callback)
  }

  onMessageReceived(handler: (message: model.IQMessage) => void) {
    return process(handler, isRequired({ handler }))
      .compose(bufferUntil(() => this.isLogin))
      .mapTo(this._onMessageReceived$)
      .compose(flattenConcurrently)
      .compose(toEventSubscription_(handler))
  }
  onMessageDeleted(handler: (message: model.IQMessage) => void): Subscription {
    return process(handler, isRequired({ handler }))
      .compose(bufferUntil(() => this.isLogin))
      .mapTo(this._onMessageDeleted$)
      .compose(flattenConcurrently)
      .compose(toEventSubscription_(handler))
  }
  onMessageDelivered(
    handler: (message: model.IQMessage) => void
  ): Subscription {
    return process(handler, isRequired({ handler }))
      .compose(bufferUntil(() => this.isLogin))
      .mapTo(this._onMessageDelivered$)
      .compose(flattenConcurrently)
      .compose(toEventSubscription_(handler))
  }
  onMessageRead(handler: (message: model.IQMessage) => void): Subscription {
    return process(handler, isRequired({ handler }))
      .compose(bufferUntil(() => this.isLogin))
      .mapTo(this._onMessageRead$)
      .compose(flattenConcurrently)
      .compose(toEventSubscription_(handler))
  }
  onUserTyping(
    handler: (userId: string, roomId: number, isTyping: boolean) => void
  ): Subscription {
    return process(handler, isRequired({ handler }))
      .compose(bufferUntil(() => this.isLogin))
      .compose(toEventSubscription(this.realtimeAdapter.onTyping))
  }
  onUserOnlinePresence(
    handler: (userId: string, isOnline: boolean, lastSeen: Date) => void
  ): Subscription {
    return process(handler, isRequired({ handler }))
      .compose(bufferUntil(() => this.isLogin))
      .compose(toEventSubscription(this.realtimeAdapter.onPresence))
  }
  onChatRoomCleared(handler: Callback<number>): Subscription {
    return process(handler, isRequired({ handler }))
      .compose(bufferUntil(() => this.isLogin))
      .mapTo(this._onRoomCleared$)
      .compose(flattenConcurrently)
      .compose(
        toEventSubscription_(data => {
          if (typeof data === 'number') return handler(data)
          if (isChatRoom(data)) return handler(data.id)
        })
      )
  }
  onConnected(handler: () => void): Subscription {
    return process(handler, isRequired({ handler }))
      .compose(bufferUntil(() => this.isLogin))
      .compose(toEventSubscription(this.realtimeAdapter.mqtt.onMqttConnected))
  }
  onReconnecting(handler: () => void): Subscription {
    return process(handler, isRequired({ handler }))
      .compose(bufferUntil(() => this.isLogin))
      .compose(
        toEventSubscription(this.realtimeAdapter.mqtt.onMqttReconnecting)
      )
  }
  onDisconnected(handler: () => void): Subscription {
    return process(handler, isRequired({ handler }))
      .compose(bufferUntil(() => this.isLogin))
      .compose(
        toEventSubscription(this.realtimeAdapter.mqtt.onMqttDisconnected)
      )
  }
  subscribeChatRoom(room: model.IQChatRoom): void {
    process(room, isRequired({ room }))
      .compose(bufferUntil(() => this.isLogin))
      .map(it => [it])
      .compose(
        subscribeOnNext(([room]) => {
          if (room.type === 'channel') {
            this.realtimeAdapter.mqtt.subscribeChannel(
              this.appId,
              room.uniqueId
            )
          } else {
            this.realtimeAdapter.mqtt.subscribeRoom(room.id)
          }
        })
      )
  }
  unsubscribeChatRoom(room: model.IQChatRoom): void {
    process(room, isRequired({ room }))
      .compose(bufferUntil(() => this.isLogin))
      .map(it => [it])
      .compose(
        subscribeOnNext(([room]) => {
          if (room.type === 'channel')
            this.realtimeAdapter.mqtt.unsubscribeChannel(
              this.appId,
              room.uniqueId
            )
          else this.realtimeAdapter.mqtt.unsubscribeRoom(room.id)
        })
      )
  }
  subscribeUserOnlinePresence(userId: string): void {
    process(userId, isReqString({ userId }))
      .compose(bufferUntil(() => this.isLogin))
      .map(it => [it])
      .compose(
        subscribeOnNext(([userId]) =>
          this.realtimeAdapter.mqtt.subscribeUserPresence(userId)
        )
      )
  }
  unsubscribeUserOnlinePresence(userId: string): void {
    process(userId, isReqString({ userId }))
      .compose(bufferUntil(() => this.isLogin))
      .map(it => [it])
      .compose(
        subscribeOnNext(([userId]) =>
          this.realtimeAdapter.mqtt.unsubscribeUserPresence(userId)
        )
      )
  }
}
