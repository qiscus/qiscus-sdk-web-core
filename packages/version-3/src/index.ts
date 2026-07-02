import * as Core from '@qiscus/core-v3'
import * as V3 from '@qiscus/core-v3/v3'

export type { IQAccount, IQChatRoom, IQMessage, IQParticipant, IQUser } from '@qiscus/core-v3/v3'

export default class Qiscus {
  private static _instance: Qiscus

  // region State fields (initializers run top-to-bottom)
  private storage = Core.storageFactory()
  private apiAdapter = Core.makeApiRequest(this.storage)
  private hookAdapter = Core.hookAdapterFactory()
  private userAdapter = Core.getUserAdapter(this.storage, this.apiAdapter)
  private realtimeAdapter = Core.getRealtimeAdapter(this.storage, this.apiAdapter)
  private loggerAdapter = Core.getLogger(this.storage)
  private roomAdapter = Core.getRoomAdapter(this.storage, this.apiAdapter)
  private messageAdapter = Core.getMessageAdapter(this.storage, this.apiAdapter)
  private deps: Core.QiscusDeps = {
    storage: this.storage,
    apiAdapter: this.apiAdapter,
    hookAdapter: this.hookAdapter,
    userAdapter: this.userAdapter,
    realtimeAdapter: this.realtimeAdapter,
    loggerAdapter: this.loggerAdapter,
    roomAdapter: this.roomAdapter,
    messageAdapter: this.messageAdapter,
  }
  private _onMessageReceived$ = V3.makeOnMessageReceived$(this.deps)
  private _onMessageUpdated$ = V3.makeOnMessageUpdated$(this.deps)
  private _onMessageRead$ = V3.makeOnMessageRead$(this.deps)
  private _onMessageDelivered$ = V3.makeOnMessageDelivered$(this.deps)
  private _onMessageDeleted$ = V3.makeOnMessageDeleted$(this.deps)
  private _onRoomCleared$ = V3.makeOnRoomCleared$(this.deps)
  // endregion

  public static get instance(): Qiscus {
    if (this._instance == null) this._instance = new this()
    return this._instance
  }

  // region Getters (state access only)
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

  // region Interceptor
  static Interceptor = Core.Hooks
  get Interceptor() {
    return Core.Hooks
  }
  intercept(interceptor: string, callback: (data: unknown) => unknown) {
    return this.hookAdapter.intercept(interceptor, callback)
  }
  // endregion

  // region Setup
  setup(appId: string): Promise<void>
  setup(appId: string, callback?: Core.IQCallback1): void
  setup(appId: string, callback?: Core.IQCallback1): void | Promise<void> {
    return V3.setup(this.deps, appId, callback)
  }

  setupWithCustomServer(
    appId: string,
    baseUrl?: string,
    brokerUrl?: string,
    brokerLbUrl?: string,
    syncInterval?: number
  ): Promise<void>
  setupWithCustomServer(
    appId: string,
    baseUrl?: string,
    brokerUrl?: string,
    brokerLbUrl?: string,
    syncInterval?: number,
    callback?: Core.IQCallback1
  ): void
  setupWithCustomServer(
    appId: string,
    baseUrl?: string,
    brokerUrl?: string,
    brokerLbUrl?: string,
    syncInterval?: number,
    callback?: (error?: Error) => void
  ): void | Promise<void> {
    return V3.setupWithCustomServer(this.deps, appId, baseUrl, brokerUrl, brokerLbUrl, syncInterval, callback)
  }

  setCustomHeader(headers: Record<string, string>): void {
    return V3.setCustomHeader(this.deps, headers)
  }

  setSyncInterval(interval: number): void {
    return V3.setSyncInterval(this.deps, interval)
  }

  enableDebugMode(enable: boolean, callback?: Core.IQCallback1) {
    return V3.enableDebugMode(this.deps, enable, callback)
  }

  async startSync() {
    return Core.startSync(this.deps)
  }

  async stopSync() {
    return Core.stopSync(this.deps)
  }

  async openRealtimeConnection() {
    return Core.openRealtimeConnection(this.deps)
  }

  async closeRealtimeConnection() {
    return Core.closeRealtimeConnection(this.deps)
  }

  synchronize(lastMessageId: V3.IQAccount['lastMessageId']): void {
    return V3.synchronize(this.deps, lastMessageId)
  }

  synchronizeEvent(lastEventId: V3.IQAccount['lastSyncEventId']): void {
    return V3.synchronizeEvent(this.deps, lastEventId)
  }
  // endregion

  // region User
  setUser(
    userId: string,
    userKey: string,
    username?: string,
    avatarUrl?: string,
    extras?: object | null
  ): Promise<V3.IQAccount>
  setUser(
    userId: string,
    userKey: string,
    username?: string,
    avatarUrl?: string,
    extras?: object | null,
    callback?: null | Core.IQCallback2<V3.IQAccount>
  ): void
  setUser(
    userId: string,
    userKey: string,
    username?: string,
    avatarUrl?: string,
    extras?: object | null,
    callback?: null | Core.IQCallback2<V3.IQAccount>
  ): void | Promise<V3.IQAccount> {
    return V3.setUser(this.deps, userId, userKey, username, avatarUrl, extras, callback)
  }

  setUserWithIdentityToken(token: string): Promise<V3.IQAccount>
  setUserWithIdentityToken(token: string, callback?: Core.IQCallback2<V3.IQAccount>): void
  setUserWithIdentityToken(token: string, callback?: Core.IQCallback2<V3.IQAccount>): void | Promise<V3.IQAccount> {
    return V3.setUserWithIdentityToken(this.deps, token, callback)
  }

  clearUser(): Promise<void>
  clearUser(callback?: Core.IQCallback1): void
  clearUser(callback?: Core.IQCallback1): void | Promise<void> {
    return V3.clearUser(this.deps, callback)
  }

  blockUser(userId: string): Promise<V3.IQUser>
  blockUser(userId: string, callback?: Core.IQCallback2<V3.IQUser>): void
  blockUser(userId: string, callback?: Core.IQCallback2<V3.IQUser>) {
    return V3.blockUser(this.deps, userId, callback)
  }

  unblockUser(userId: string): Promise<V3.IQUser>
  unblockUser(userId: string, callback: Core.IQCallback2<V3.IQUser>): void
  unblockUser(userId: string, callback?: Core.IQCallback2<V3.IQUser>) {
    return V3.unblockUser(this.deps, userId, callback)
  }

  updateUser(username: string, avatarUrl: string, extras?: object): Promise<V3.IQAccount>
  updateUser(username: string, avatarUrl: string, extras?: object, callback?: Core.IQCallback2<V3.IQAccount>): void
  updateUser(username: string, avatarUrl: string, extras?: object, callback?: Core.IQCallback2<V3.IQAccount>) {
    return V3.updateUser(this.deps, username, avatarUrl, extras, callback)
  }

  getBlockedUsers(page?: number, limit?: number): Promise<V3.IQUser[]>
  getBlockedUsers(page?: number, limit?: number, callback?: Core.IQCallback2<V3.IQUser[]>): void
  getBlockedUsers(page?: number, limit?: number, callback?: Core.IQCallback2<V3.IQUser[]>) {
    return V3.getBlockedUsers(this.deps, page, limit, callback)
  }

  getUsers(searchUsername?: string, page?: number, limit?: number): Promise<V3.IQUser[]>
  getUsers(searchUsername?: string, page?: number, limit?: number, callback?: Core.IQCallback2<V3.IQUser[]>): void
  getUsers(searchUsername?: string, page?: number, limit?: number, callback?: Core.IQCallback2<V3.IQUser[]>) {
    return V3.getUsers(this.deps, searchUsername, page, limit, callback)
  }

  getJWTNonce(): Promise<string>
  getJWTNonce(callback: Core.IQCallback2<string>): void
  getJWTNonce(callback?: Core.IQCallback2<string>): void | Promise<string> {
    return V3.getJWTNonce(this.deps, callback)
  }

  getUserData(): Promise<V3.IQAccount>
  getUserData(callback: Core.IQCallback2<V3.IQAccount>): void
  getUserData(callback?: Core.IQCallback2<V3.IQAccount>) {
    return V3.getUserData(this.deps, callback)
  }

  registerDeviceToken(token: string, isDevelopment: boolean): Promise<boolean>
  registerDeviceToken(token: string, isDevelopment: boolean, callback: Core.IQCallback2<boolean>): void
  registerDeviceToken(token: string, isDevelopment: boolean, callback?: Core.IQCallback2<boolean>) {
    return V3.registerDeviceToken(this.deps, token, isDevelopment, callback)
  }

  removeDeviceToken(token: string, isDevelopment: boolean): Promise<boolean>
  removeDeviceToken(token: string, isDevelopment: boolean, callback: Core.IQCallback2<boolean>): void
  removeDeviceToken(token: string, isDevelopment: boolean, callback?: Core.IQCallback2<boolean>) {
    return V3.removeDeviceToken(this.deps, token, isDevelopment, callback)
  }

  hasSetupUser(): Promise<boolean>
  hasSetupUser(callback: Core.IQCallback2<boolean>): void
  hasSetupUser(callback?: Core.IQCallback2<boolean>): void | Promise<boolean> {
    return Core.hasSetupUser(this.deps, callback)
  }
  // endregion

  // region Room
  chatUser(userId: string, extras?: Record<string, any>): Promise<V3.IQChatRoom>
  chatUser(userId: string, extras?: Record<string, any>, callback?: Core.IQCallback2<V3.IQChatRoom>): void
  chatUser(userId: string, extras?: Record<string, any>, callback?: Core.IQCallback2<V3.IQChatRoom>) {
    return V3.chatUser(this.deps, userId, extras, callback)
  }

  addParticipants(roomId: number, userIds: string[]): Promise<V3.IQParticipant[]>
  addParticipants(roomId: number, userIds: string[], callback?: Core.IQCallback2<V3.IQParticipant[]>): void
  addParticipants(roomId: number, userIds: string[], callback?: Core.IQCallback2<V3.IQParticipant[]>) {
    return V3.addParticipants(this.deps, roomId, userIds, callback)
  }

  removeParticipants(roomId: number, userIds: string[]): Promise<V3.IQParticipant[] | string[]>
  removeParticipants(roomId: number, userIds: string[], callback?: Core.IQCallback2<V3.IQParticipant[]>): void
  removeParticipants(
    roomId: number,
    userIds: string[],
    callback?: Core.IQCallback2<V3.IQParticipant[]>
  ): void | Promise<V3.IQParticipant[] | string[]> {
    return V3.removeParticipants(this.deps, roomId, userIds, callback)
  }

  clearMessagesByChatRoomId(roomUniqueIds: string[]): Promise<void>
  clearMessagesByChatRoomId(roomUniqueIds: string[], callback?: Core.IQCallback1): void
  clearMessagesByChatRoomId(roomUniqueIds: string[], callback?: Core.IQCallback1): void | Promise<void> {
    return V3.clearMessagesByChatRoomId(this.deps, roomUniqueIds, callback)
  }

  createGroupChat(name: string, userIds: string[], avatarUrl?: string, extras?: object): Promise<V3.IQChatRoom>
  createGroupChat(
    name: string,
    userIds: string[],
    avatarUrl?: string,
    extras?: object,
    callback?: Core.IQCallback2<V3.IQChatRoom>
  ): void
  createGroupChat(
    name: string,
    userIds: string[],
    avatarUrl?: string,
    extras?: object,
    callback?: Core.IQCallback2<V3.IQChatRoom>
  ): void | Promise<V3.IQChatRoom> {
    return V3.createGroupChat(this.deps, name, userIds, avatarUrl, extras, callback)
  }

  createChannel(uniqueId: string, name?: string, avatarUrl?: string, extras?: object): Promise<V3.IQChatRoom>
  createChannel(
    uniqueId: string,
    name?: string,
    avatarUrl?: string,
    extras?: object,
    callback?: Core.IQCallback2<V3.IQChatRoom>
  ): void
  createChannel(
    uniqueId: string,
    name?: string,
    avatarUrl?: string,
    extras?: object,
    callback?: Core.IQCallback2<V3.IQChatRoom>
  ): void | Promise<V3.IQChatRoom> {
    return V3.createChannel(this.deps, uniqueId, name, avatarUrl, extras, callback)
  }

  getChannel(uniqueId: string): Promise<V3.IQChatRoom>
  getChannel(uniqueId: string, callback?: Core.IQCallback2<V3.IQChatRoom>): void
  getChannel(uniqueId: string, callback?: Core.IQCallback2<V3.IQChatRoom>) {
    return V3.getChannel(this.deps, uniqueId, callback)
  }

  getParticipants(
    roomUniqueId: string,
    page?: number,
    limit?: number,
    sorting?: 'asc' | 'desc'
  ): Promise<V3.IQParticipant[]>
  getParticipants(
    roomUniqueId: string,
    page?: number,
    limit?: number,
    sorting?: 'asc' | 'desc',
    callback?: Core.IQCallback2<V3.IQParticipant[]>
  ): void
  getParticipants(
    roomUniqueId: string,
    page?: number,
    limit?: number,
    sorting?: 'asc' | 'desc',
    callback?: Core.IQCallback2<V3.IQParticipant[]>
  ): void | Promise<V3.IQParticipant[]> {
    return V3.getParticipants(this.deps, roomUniqueId, page, limit, sorting, callback)
  }

  getChatRooms(
    roomIds: number[],
    page?: number,
    showRemoved?: boolean,
    showParticipant?: boolean
  ): Promise<V3.IQChatRoom[]>
  getChatRooms(
    uniqueIds: string[],
    page?: number,
    showRemoved?: boolean,
    showParticipant?: boolean,
    callback?: Core.IQCallback2<V3.IQChatRoom[]>
  ): void
  getChatRooms(
    ids: number[] | string[],
    page?: number,
    showRemoved?: boolean,
    showParticipant?: boolean,
    callback?: Core.IQCallback2<V3.IQChatRoom[]>
  ): void | Promise<V3.IQChatRoom[]> {
    return V3.getChatRooms(this.deps, ids, page, showRemoved, showParticipant, callback)
  }

  getAllChatRooms(
    showParticipant?: boolean,
    showRemoved?: boolean,
    showEmpty?: boolean,
    page?: number,
    limit?: number
  ): Promise<V3.IQChatRoom[]>
  getAllChatRooms(
    showParticipant?: boolean,
    showRemoved?: boolean,
    showEmpty?: boolean,
    page?: number,
    limit?: number,
    callback?: Core.IQCallback2<V3.IQChatRoom[]>
  ): void
  getAllChatRooms(
    showParticipant?: boolean,
    showRemoved?: boolean,
    showEmpty?: boolean,
    page?: number,
    limit?: number,
    callback?: Core.IQCallback2<V3.IQChatRoom[]>
  ): void | Promise<V3.IQChatRoom[]> {
    return V3.getAllChatRooms(this.deps, showParticipant, showRemoved, showEmpty, page, limit, callback)
  }

  getChatRoomWithMessages(roomId: number): Promise<[V3.IQChatRoom, V3.IQMessage[]]>
  getChatRoomWithMessages(roomId: number, callback?: Core.IQCallback2<[V3.IQChatRoom, V3.IQMessage[]]>): void
  getChatRoomWithMessages(
    roomId: number,
    callback?: Core.IQCallback2<[V3.IQChatRoom, V3.IQMessage[]]>
  ): void | Promise<[V3.IQChatRoom, V3.IQMessage[]]> {
    return V3.getChatRoomWithMessages(this.deps, roomId, callback)
  }

  getTotalUnreadCount(): Promise<number>
  getTotalUnreadCount(callback?: Core.IQCallback2<number>): void
  getTotalUnreadCount(callback?: Core.IQCallback2<number>): void | Promise<number> {
    return V3.getTotalUnreadCount(this.deps, callback)
  }

  getRoomUnreadCount(): Promise<number>
  getRoomUnreadCount(callback?: Core.IQCallback2<number>): void
  getRoomUnreadCount(callback?: Core.IQCallback2<number>): void | Promise<number> {
    return V3.getRoomUnreadCount(this.deps, callback)
  }

  updateChatRoom(roomId: number, name?: string, avatarUrl?: string, extras?: object): Promise<V3.IQChatRoom>
  updateChatRoom(
    roomId: number,
    name?: string,
    avatarUrl?: string,
    extras?: object,
    callback?: Core.IQCallback2<V3.IQChatRoom>
  ): void
  updateChatRoom(
    roomId: number,
    name?: string,
    avatarUrl?: string,
    extras?: object,
    callback?: Core.IQCallback2<V3.IQChatRoom>
  ) {
    return V3.updateChatRoom(this.deps, roomId, name, avatarUrl, extras, callback)
  }
  // endregion

  // region Message
  sendMessage(message: V3.IQMessage): Promise<V3.IQMessage>
  sendMessage(message: V3.IQMessage, callback?: Core.IQCallback2<V3.IQMessage>): void
  sendMessage(message: V3.IQMessage, callback?: Core.IQCallback2<V3.IQMessage>) {
    return V3.sendMessage(this.deps, message, callback)
  }

  markAsDelivered(roomId: number, messageId: number): Promise<void>
  markAsDelivered(roomId: number, messageId: number, callback?: Core.IQCallback2<void>): void
  markAsDelivered(roomId: number, messageId: number, callback?: Core.IQCallback2<void>): void | Promise<void> {
    return V3.markAsDelivered(this.deps, roomId, messageId, callback)
  }

  markAsRead(roomId: number, messageId: number): Promise<void>
  markAsRead(roomId: number, messageId: number, callback?: Core.IQCallback2<void>): void
  markAsRead(roomId: number, messageId: number, callback?: Core.IQCallback2<void>): void | Promise<void> {
    return V3.markAsRead(this.deps, roomId, messageId, callback)
  }

  deleteMessages(messageUniqueIds: string[]): Promise<V3.IQMessage[]>
  deleteMessages(messageUniqueIds: string[], callback?: Core.IQCallback2<V3.IQMessage[]>): void
  deleteMessages(messageUniqueIds: string[], callback?: Core.IQCallback2<V3.IQMessage[]>) {
    return V3.deleteMessages(this.deps, messageUniqueIds, callback)
  }

  getPreviousMessagesById(roomId: number, limit?: number, messageId?: number): Promise<V3.IQMessage[]>
  getPreviousMessagesById(
    roomId: number,
    limit?: number,
    messageId?: number,
    callback?: Core.IQCallback2<V3.IQMessage[]>
  ): void
  getPreviousMessagesById(
    roomId: number,
    limit?: number,
    messageId?: number,
    callback?: Core.IQCallback2<V3.IQMessage[]>
  ) {
    return V3.getPreviousMessagesById(this.deps, roomId, limit, messageId, callback)
  }

  getNextMessagesById(roomId: number, limit?: number, messageId?: number): Promise<V3.IQMessage[]>
  getNextMessagesById(
    roomId: number,
    limit?: number,
    messageId?: number,
    callback?: Core.IQCallback2<V3.IQMessage[]>
  ): void
  getNextMessagesById(
    roomId: number,
    limit?: number,
    messageId?: number,
    callback?: Core.IQCallback2<V3.IQMessage[]>
  ): void | Promise<V3.IQMessage[]> {
    return V3.getNextMessagesById(this.deps, roomId, limit, messageId, callback)
  }

  searchMessage(opts: {
    query: string
    roomIds: number[]
    userId?: string
    type?: string
    roomType?: string
    page?: number
    limit?: number
  }): Promise<V3.IQMessage[]>
  searchMessage(opts: {
    query: string
    roomIds: number[]
    userId?: string
    type?: string
    roomType?: string
    page?: number
    limit?: number
    callback?: (messages?: V3.IQMessage[], error?: Error) => void
  }): void
  searchMessage(opts: {
    query: string
    roomIds: number[]
    userId?: string
    type?: string
    roomType?: string
    page?: number
    limit?: number
    callback?: (messages?: V3.IQMessage[], error?: Error) => void
  }) {
    return V3.searchMessage(this.deps, opts)
  }

  getFileList(opts: {
    roomIds?: number[]
    fileType?: string
    page?: number
    limit?: number
  }): Promise<V3.IQMessage[]>
  getFileList(opts: {
    roomIds?: number[]
    fileType?: string
    page?: number
    limit?: number
    callback?: (messages?: V3.IQMessage[], error?: Error) => void
  }): void
  getFileList(opts: {
    roomIds?: number[]
    fileType?: string
    page?: number
    limit?: number
    userId?: string
    includeExtensions?: string[]
    excludeExtensions?: string[]
    callback?: (messages?: V3.IQMessage[], error?: Error) => void
  }): void | Promise<V3.IQMessage[]> {
    return V3.getFileList(this.deps, opts)
  }

  updateMessage(message: V3.IQMessage): Promise<void>
  updateMessage(message: V3.IQMessage, callback?: Core.IQCallback1): void
  updateMessage(message: V3.IQMessage, callback?: Core.IQCallback1) {
    return V3.updateMessage(this.deps, message, callback)
  }

  upload(file: File, callback?: Core.IQProgressListener): void {
    return V3.upload(this.deps, file, callback)
  }

  sendFileMessage(message: V3.IQMessage, file: File, callback?: Core.IQProgressListener<V3.IQMessage>): void {
    return V3.sendFileMessage(this.deps, message, file, callback)
  }

  getThumbnailURL(url: string) {
    return V3.getThumbnailURL(url)
  }

  generateMessage({
    roomId,
    text,
    extras,
  }: {
    roomId: number
    text: string
    extras?: Record<string, any>
  }): V3.IQMessage {
    return V3.generateMessage(this.deps, { roomId, text, extras })
  }

  generateFileAttachmentMessage({
    roomId,
    caption,
    url,
    text,
    extras,
    filename,
    size,
  }: {
    roomId: number
    caption: string
    url: string
    text: string
    extras?: Record<string, unknown>
    filename?: string
    size?: number
  }): V3.IQMessage {
    return V3.generateFileAttachmentMessage(this.deps, { roomId, caption, url, text, extras, filename, size })
  }

  generateCustomMessage({
    roomId,
    text,
    type,
    payload,
    extras,
  }: {
    roomId: number
    text: string
    type: string
    extras?: Record<string, unknown>
    payload?: Record<string, any>
  }): V3.IQMessage {
    return V3.generateCustomMessage(this.deps, { roomId, text, type, payload, extras })
  }

  generateReplyMessage({
    roomId,
    text,
    repliedMessage,
    extras,
  }: {
    roomId: number
    text: string
    repliedMessage: V3.IQMessage
    extras?: Record<string, unknown>
  }): V3.IQMessage {
    return V3.generateReplyMessage(this.deps, { roomId, text, repliedMessage, extras })
  }

  _generateUniqueId(): string {
    return V3.generateUniqueId()
  }
  // endregion

  // region Realtime
  publishCustomEvent(roomId: number, data: any): Promise<void>
  publishCustomEvent(roomId: number, data: any, callback?: Core.IQCallback1): void
  publishCustomEvent(roomId: number, data: any, callback?: Core.IQCallback1) {
    return V3.publishCustomEvent(this.deps, roomId, data, callback)
  }

  publishOnlinePresence(isOnline: boolean): Promise<void>
  publishOnlinePresence(isOnline: boolean, callback?: Core.IQCallback1): void
  publishOnlinePresence(isOnline: boolean, callback?: Core.IQCallback1): void | Promise<void> {
    return V3.publishOnlinePresence(this.deps, isOnline, callback)
  }

  publishTyping(roomId: number, isTyping?: boolean): Promise<void>
  publishTyping(roomId: number, isTyping?: boolean, callback?: Core.IQCallback1): void
  publishTyping(roomId: number, isTyping?: boolean, callback?: Core.IQCallback1): void | Promise<void> {
    return V3.publishTyping(this.deps, roomId, isTyping, callback)
  }

  subscribeCustomEvent(roomId: number, callback: Core.IQCallback2<any>): void {
    return V3.subscribeCustomEvent(this.deps, roomId, callback)
  }

  unsubscribeCustomEvent(roomId: number): void {
    return V3.unsubscribeCustomEvent(this.deps, roomId)
  }

  onMessageReceived(handler: (message: V3.IQMessage) => void) {
    return V3.onMessageReceived(this.deps, this._onMessageReceived$, handler)
  }

  onMessageUpdated(handler: (message: V3.IQMessage) => void): () => void {
    return V3.onMessageUpdated(this.deps, this._onMessageUpdated$, handler)
  }

  onMessageDeleted(handler: (message: V3.IQMessage) => void): Core.Subscription {
    return V3.onMessageDeleted(this.deps, this._onMessageDeleted$, handler)
  }

  onMessageDelivered(handler: (message: V3.IQMessage) => void): Core.Subscription {
    return V3.onMessageDelivered(this.deps, this._onMessageDelivered$, handler)
  }

  onMessageRead(handler: (message: V3.IQMessage) => void): Core.Subscription {
    return V3.onMessageRead(this.deps, this._onMessageRead$, handler)
  }

  onUserTyping(handler: (userId: string, roomId: number, isTyping: boolean) => void): Core.Subscription {
    return V3.onUserTyping(this.deps, handler)
  }

  onUserOnlinePresence(handler: (userId: string, isOnline: boolean, lastSeen: Date) => void): Core.Subscription {
    return V3.onUserOnlinePresence(this.deps, handler)
  }

  onChatRoomCleared(handler: Core.Callback<number>): Core.Subscription {
    return V3.onChatRoomCleared(this.deps, this._onRoomCleared$, handler)
  }

  onConnected(handler: () => void): Core.Subscription {
    return V3.onConnected(this.deps, handler)
  }

  onReconnecting(handler: () => void): Core.Subscription {
    return V3.onReconnecting(this.deps, handler)
  }

  onDisconnected(handler: () => void): Core.Subscription {
    return V3.onDisconnected(this.deps, handler)
  }

  subscribeChatRoom(room: V3.IQChatRoom): void {
    return V3.subscribeChatRoom(this.deps, room)
  }

  unsubscribeChatRoom(room: V3.IQChatRoom): void {
    return V3.unsubscribeChatRoom(this.deps, room)
  }

  subscribeUserOnlinePresence(userId: string): void {
    return V3.subscribeUserOnlinePresence(this.deps, userId)
  }

  unsubscribeUserOnlinePresence(userId: string): void {
    return V3.unsubscribeUserOnlinePresence(this.deps, userId)
  }
  // endregion
}
