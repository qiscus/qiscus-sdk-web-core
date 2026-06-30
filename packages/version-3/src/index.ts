import * as Core from '@qiscus/core-v3'

export type { IQAccount, IQChatRoom, IQMessage, IQParticipant, IQUser } from '@qiscus/core-v3'

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
  private _onMessageReceived$ = Core.makeOnMessageReceived$(this.deps)
  private _onMessageUpdated$ = Core.makeOnMessageUpdated$(this.deps)
  private _onMessageRead$ = Core.makeOnMessageRead$(this.deps)
  private _onMessageDelivered$ = Core.makeOnMessageDelivered$(this.deps)
  private _onMessageDeleted$ = Core.makeOnMessageDeleted$(this.deps)
  private _onRoomCleared$ = Core.makeOnRoomCleared$(this.deps)
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
    return Core.setup(this.deps, appId, callback)
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
    return Core.setupWithCustomServer(this.deps, appId, baseUrl, brokerUrl, brokerLbUrl, syncInterval, callback)
  }

  setCustomHeader(headers: Record<string, string>): void {
    return Core.setCustomHeader(this.deps, headers)
  }

  setSyncInterval(interval: number): void {
    return Core.setSyncInterval(this.deps, interval)
  }

  enableDebugMode(enable: boolean, callback?: Core.IQCallback1) {
    return Core.enableDebugMode(this.deps, enable, callback)
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

  synchronize(lastMessageId: Core.IQAccount['lastMessageId']): void {
    return Core.synchronize(this.deps, lastMessageId)
  }

  synchronizeEvent(lastEventId: Core.IQAccount['lastSyncEventId']): void {
    return Core.synchronizeEvent(this.deps, lastEventId)
  }
  // endregion

  // region User
  setUser(
    userId: string,
    userKey: string,
    username?: string,
    avatarUrl?: string,
    extras?: object | null
  ): Promise<Core.IQAccount>
  setUser(
    userId: string,
    userKey: string,
    username?: string,
    avatarUrl?: string,
    extras?: object | null,
    callback?: null | Core.IQCallback2<Core.IQAccount>
  ): void
  setUser(
    userId: string,
    userKey: string,
    username?: string,
    avatarUrl?: string,
    extras?: object | null,
    callback?: null | Core.IQCallback2<Core.IQAccount>
  ): void | Promise<Core.IQAccount> {
    return Core.setUser(this.deps, userId, userKey, username, avatarUrl, extras, callback)
  }

  setUserWithIdentityToken(token: string): Promise<Core.IQAccount>
  setUserWithIdentityToken(token: string, callback?: Core.IQCallback2<Core.IQAccount>): void
  setUserWithIdentityToken(token: string, callback?: Core.IQCallback2<Core.IQAccount>): void | Promise<Core.IQAccount> {
    return Core.setUserWithIdentityToken(this.deps, token, callback)
  }

  clearUser(): Promise<void>
  clearUser(callback?: Core.IQCallback1): void
  clearUser(callback?: Core.IQCallback1): void | Promise<void> {
    return Core.clearUser(this.deps, callback)
  }

  blockUser(userId: string): Promise<Core.IQUser>
  blockUser(userId: string, callback?: Core.IQCallback2<Core.IQUser>): void
  blockUser(userId: string, callback?: Core.IQCallback2<Core.IQUser>) {
    return Core.blockUser(this.deps, userId, callback)
  }

  unblockUser(userId: string): Promise<Core.IQUser>
  unblockUser(userId: string, callback: Core.IQCallback2<Core.IQUser>): void
  unblockUser(userId: string, callback?: Core.IQCallback2<Core.IQUser>) {
    return Core.unblockUser(this.deps, userId, callback)
  }

  updateUser(username: string, avatarUrl: string, extras?: object): Promise<Core.IQAccount>
  updateUser(username: string, avatarUrl: string, extras?: object, callback?: Core.IQCallback2<Core.IQAccount>): void
  updateUser(username: string, avatarUrl: string, extras?: object, callback?: Core.IQCallback2<Core.IQAccount>) {
    return Core.updateUser(this.deps, username, avatarUrl, extras, callback)
  }

  getBlockedUsers(page?: number, limit?: number): Promise<Core.IQUser[]>
  getBlockedUsers(page?: number, limit?: number, callback?: Core.IQCallback2<Core.IQUser[]>): void
  getBlockedUsers(page?: number, limit?: number, callback?: Core.IQCallback2<Core.IQUser[]>) {
    return Core.getBlockedUsers(this.deps, page, limit, callback)
  }

  getUsers(searchUsername?: string, page?: number, limit?: number): Promise<Core.IQUser[]>
  getUsers(searchUsername?: string, page?: number, limit?: number, callback?: Core.IQCallback2<Core.IQUser[]>): void
  getUsers(searchUsername?: string, page?: number, limit?: number, callback?: Core.IQCallback2<Core.IQUser[]>) {
    return Core.getUsers(this.deps, searchUsername, page, limit, callback)
  }

  getJWTNonce(): Promise<string>
  getJWTNonce(callback: Core.IQCallback2<string>): void
  getJWTNonce(callback?: Core.IQCallback2<string>): void | Promise<string> {
    return Core.getJWTNonce(this.deps, callback)
  }

  getUserData(): Promise<Core.IQAccount>
  getUserData(callback: Core.IQCallback2<Core.IQAccount>): void
  getUserData(callback?: Core.IQCallback2<Core.IQAccount>) {
    return Core.getUserData(this.deps, callback)
  }

  registerDeviceToken(token: string, isDevelopment: boolean): Promise<boolean>
  registerDeviceToken(token: string, isDevelopment: boolean, callback: Core.IQCallback2<boolean>): void
  registerDeviceToken(token: string, isDevelopment: boolean, callback?: Core.IQCallback2<boolean>) {
    return Core.registerDeviceToken(this.deps, token, isDevelopment, callback)
  }

  removeDeviceToken(token: string, isDevelopment: boolean): Promise<boolean>
  removeDeviceToken(token: string, isDevelopment: boolean, callback: Core.IQCallback2<boolean>): void
  removeDeviceToken(token: string, isDevelopment: boolean, callback?: Core.IQCallback2<boolean>) {
    return Core.removeDeviceToken(this.deps, token, isDevelopment, callback)
  }

  hasSetupUser(): Promise<boolean>
  hasSetupUser(callback: Core.IQCallback2<boolean>): void
  hasSetupUser(callback?: Core.IQCallback2<boolean>): void | Promise<boolean> {
    return Core.hasSetupUser(this.deps, callback)
  }
  // endregion

  // region Room
  chatUser(userId: string, extras?: Record<string, any>): Promise<Core.IQChatRoom>
  chatUser(userId: string, extras?: Record<string, any>, callback?: Core.IQCallback2<Core.IQChatRoom>): void
  chatUser(userId: string, extras?: Record<string, any>, callback?: Core.IQCallback2<Core.IQChatRoom>) {
    return Core.chatUser(this.deps, userId, extras, callback)
  }

  addParticipants(roomId: number, userIds: string[]): Promise<Core.IQParticipant[]>
  addParticipants(roomId: number, userIds: string[], callback?: Core.IQCallback2<Core.IQParticipant[]>): void
  addParticipants(roomId: number, userIds: string[], callback?: Core.IQCallback2<Core.IQParticipant[]>) {
    return Core.addParticipants(this.deps, roomId, userIds, callback)
  }

  removeParticipants(roomId: number, userIds: string[]): Promise<Core.IQParticipant[] | string[]>
  removeParticipants(roomId: number, userIds: string[], callback?: Core.IQCallback2<Core.IQParticipant[]>): void
  removeParticipants(
    roomId: number,
    userIds: string[],
    callback?: Core.IQCallback2<Core.IQParticipant[]>
  ): void | Promise<Core.IQParticipant[] | string[]> {
    return Core.removeParticipants(this.deps, roomId, userIds, callback)
  }

  clearMessagesByChatRoomId(roomUniqueIds: string[]): Promise<void>
  clearMessagesByChatRoomId(roomUniqueIds: string[], callback?: Core.IQCallback1): void
  clearMessagesByChatRoomId(roomUniqueIds: string[], callback?: Core.IQCallback1): void | Promise<void> {
    return Core.clearMessagesByChatRoomId(this.deps, roomUniqueIds, callback)
  }

  createGroupChat(name: string, userIds: string[], avatarUrl?: string, extras?: object): Promise<Core.IQChatRoom>
  createGroupChat(
    name: string,
    userIds: string[],
    avatarUrl?: string,
    extras?: object,
    callback?: Core.IQCallback2<Core.IQChatRoom>
  ): void
  createGroupChat(
    name: string,
    userIds: string[],
    avatarUrl?: string,
    extras?: object,
    callback?: Core.IQCallback2<Core.IQChatRoom>
  ): void | Promise<Core.IQChatRoom> {
    return Core.createGroupChat(this.deps, name, userIds, avatarUrl, extras, callback)
  }

  createChannel(uniqueId: string, name?: string, avatarUrl?: string, extras?: object): Promise<Core.IQChatRoom>
  createChannel(
    uniqueId: string,
    name?: string,
    avatarUrl?: string,
    extras?: object,
    callback?: Core.IQCallback2<Core.IQChatRoom>
  ): void
  createChannel(
    uniqueId: string,
    name?: string,
    avatarUrl?: string,
    extras?: object,
    callback?: Core.IQCallback2<Core.IQChatRoom>
  ): void | Promise<Core.IQChatRoom> {
    return Core.createChannel(this.deps, uniqueId, name, avatarUrl, extras, callback)
  }

  getChannel(uniqueId: string): Promise<Core.IQChatRoom>
  getChannel(uniqueId: string, callback?: Core.IQCallback2<Core.IQChatRoom>): void
  getChannel(uniqueId: string, callback?: Core.IQCallback2<Core.IQChatRoom>) {
    return Core.getChannel(this.deps, uniqueId, callback)
  }

  getParticipants(
    roomUniqueId: string,
    page?: number,
    limit?: number,
    sorting?: 'asc' | 'desc'
  ): Promise<Core.IQParticipant[]>
  getParticipants(
    roomUniqueId: string,
    page?: number,
    limit?: number,
    sorting?: 'asc' | 'desc',
    callback?: Core.IQCallback2<Core.IQParticipant[]>
  ): void
  getParticipants(
    roomUniqueId: string,
    page?: number,
    limit?: number,
    sorting?: 'asc' | 'desc',
    callback?: Core.IQCallback2<Core.IQParticipant[]>
  ): void | Promise<Core.IQParticipant[]> {
    return Core.getParticipants(this.deps, roomUniqueId, page, limit, sorting, callback)
  }

  getChatRooms(
    roomIds: number[],
    page?: number,
    showRemoved?: boolean,
    showParticipant?: boolean
  ): Promise<Core.IQChatRoom[]>
  getChatRooms(
    uniqueIds: string[],
    page?: number,
    showRemoved?: boolean,
    showParticipant?: boolean,
    callback?: Core.IQCallback2<Core.IQChatRoom[]>
  ): void
  getChatRooms(
    ids: number[] | string[],
    page?: number,
    showRemoved?: boolean,
    showParticipant?: boolean,
    callback?: Core.IQCallback2<Core.IQChatRoom[]>
  ): void | Promise<Core.IQChatRoom[]> {
    return Core.getChatRooms(this.deps, ids, page, showRemoved, showParticipant, callback)
  }

  getAllChatRooms(
    showParticipant?: boolean,
    showRemoved?: boolean,
    showEmpty?: boolean,
    page?: number,
    limit?: number
  ): Promise<Core.IQChatRoom[]>
  getAllChatRooms(
    showParticipant?: boolean,
    showRemoved?: boolean,
    showEmpty?: boolean,
    page?: number,
    limit?: number,
    callback?: Core.IQCallback2<Core.IQChatRoom[]>
  ): void
  getAllChatRooms(
    showParticipant?: boolean,
    showRemoved?: boolean,
    showEmpty?: boolean,
    page?: number,
    limit?: number,
    callback?: Core.IQCallback2<Core.IQChatRoom[]>
  ): void | Promise<Core.IQChatRoom[]> {
    return Core.getAllChatRooms(this.deps, showParticipant, showRemoved, showEmpty, page, limit, callback)
  }

  getChatRoomWithMessages(roomId: number): Promise<[Core.IQChatRoom, Core.IQMessage[]]>
  getChatRoomWithMessages(roomId: number, callback?: Core.IQCallback2<[Core.IQChatRoom, Core.IQMessage[]]>): void
  getChatRoomWithMessages(
    roomId: number,
    callback?: Core.IQCallback2<[Core.IQChatRoom, Core.IQMessage[]]>
  ): void | Promise<[Core.IQChatRoom, Core.IQMessage[]]> {
    return Core.getChatRoomWithMessages(this.deps, roomId, callback)
  }

  getTotalUnreadCount(): Promise<number>
  getTotalUnreadCount(callback?: Core.IQCallback2<number>): void
  getTotalUnreadCount(callback?: Core.IQCallback2<number>): void | Promise<number> {
    return Core.getTotalUnreadCount(this.deps, callback)
  }

  getRoomUnreadCount(): Promise<number>
  getRoomUnreadCount(callback?: Core.IQCallback2<number>): void
  getRoomUnreadCount(callback?: Core.IQCallback2<number>): void | Promise<number> {
    return Core.getRoomUnreadCount(this.deps, callback)
  }

  updateChatRoom(roomId: number, name?: string, avatarUrl?: string, extras?: object): Promise<Core.IQChatRoom>
  updateChatRoom(
    roomId: number,
    name?: string,
    avatarUrl?: string,
    extras?: object,
    callback?: Core.IQCallback2<Core.IQChatRoom>
  ): void
  updateChatRoom(
    roomId: number,
    name?: string,
    avatarUrl?: string,
    extras?: object,
    callback?: Core.IQCallback2<Core.IQChatRoom>
  ) {
    return Core.updateChatRoom(this.deps, roomId, name, avatarUrl, extras, callback)
  }
  // endregion

  // region Message
  sendMessage(message: Core.IQMessage): Promise<Core.IQMessage>
  sendMessage(message: Core.IQMessage, callback?: Core.IQCallback2<Core.IQMessage>): void
  sendMessage(message: Core.IQMessage, callback?: Core.IQCallback2<Core.IQMessage>) {
    return Core.sendMessage(this.deps, message, callback)
  }

  markAsDelivered(roomId: number, messageId: number): Promise<void>
  markAsDelivered(roomId: number, messageId: number, callback?: Core.IQCallback2<void>): void
  markAsDelivered(roomId: number, messageId: number, callback?: Core.IQCallback2<void>): void | Promise<void> {
    return Core.markAsDelivered(this.deps, roomId, messageId, callback)
  }

  markAsRead(roomId: number, messageId: number): Promise<void>
  markAsRead(roomId: number, messageId: number, callback?: Core.IQCallback2<void>): void
  markAsRead(roomId: number, messageId: number, callback?: Core.IQCallback2<void>): void | Promise<void> {
    return Core.markAsRead(this.deps, roomId, messageId, callback)
  }

  deleteMessages(messageUniqueIds: string[]): Promise<Core.IQMessage[]>
  deleteMessages(messageUniqueIds: string[], callback?: Core.IQCallback2<Core.IQMessage[]>): void
  deleteMessages(messageUniqueIds: string[], callback?: Core.IQCallback2<Core.IQMessage[]>) {
    return Core.deleteMessages(this.deps, messageUniqueIds, callback)
  }

  getPreviousMessagesById(roomId: number, limit?: number, messageId?: number): Promise<Core.IQMessage[]>
  getPreviousMessagesById(
    roomId: number,
    limit?: number,
    messageId?: number,
    callback?: Core.IQCallback2<Core.IQMessage[]>
  ): void
  getPreviousMessagesById(
    roomId: number,
    limit?: number,
    messageId?: number,
    callback?: Core.IQCallback2<Core.IQMessage[]>
  ) {
    return Core.getPreviousMessagesById(this.deps, roomId, limit, messageId, callback)
  }

  getNextMessagesById(roomId: number, limit?: number, messageId?: number): Promise<Core.IQMessage[]>
  getNextMessagesById(
    roomId: number,
    limit?: number,
    messageId?: number,
    callback?: Core.IQCallback2<Core.IQMessage[]>
  ): void
  getNextMessagesById(
    roomId: number,
    limit?: number,
    messageId?: number,
    callback?: Core.IQCallback2<Core.IQMessage[]>
  ): void | Promise<Core.IQMessage[]> {
    return Core.getNextMessagesById(this.deps, roomId, limit, messageId, callback)
  }

  searchMessage(opts: {
    query: string
    roomIds: number[]
    userId?: string
    type?: string
    roomType?: string
    page?: number
    limit?: number
  }): Promise<Core.IQMessage[]>
  searchMessage(opts: {
    query: string
    roomIds: number[]
    userId?: string
    type?: string
    roomType?: string
    page?: number
    limit?: number
    callback?: (messages?: Core.IQMessage[], error?: Error) => void
  }): void
  searchMessage(opts: {
    query: string
    roomIds: number[]
    userId?: string
    type?: string
    roomType?: string
    page?: number
    limit?: number
    callback?: (messages?: Core.IQMessage[], error?: Error) => void
  }) {
    return Core.searchMessage(this.deps, opts)
  }

  getFileList(opts: {
    roomIds?: number[]
    fileType?: string
    page?: number
    limit?: number
  }): Promise<Core.IQMessage[]>
  getFileList(opts: {
    roomIds?: number[]
    fileType?: string
    page?: number
    limit?: number
    callback?: (messages?: Core.IQMessage[], error?: Error) => void
  }): void
  getFileList(opts: {
    roomIds?: number[]
    fileType?: string
    page?: number
    limit?: number
    userId?: string
    includeExtensions?: string[]
    excludeExtensions?: string[]
    callback?: (messages?: Core.IQMessage[], error?: Error) => void
  }): void | Promise<Core.IQMessage[]> {
    return Core.getFileList(this.deps, opts)
  }

  updateMessage(message: Core.IQMessage): Promise<void>
  updateMessage(message: Core.IQMessage, callback?: Core.IQCallback1): void
  updateMessage(message: Core.IQMessage, callback?: Core.IQCallback1) {
    return Core.updateMessage(this.deps, message, callback)
  }

  upload(file: File, callback?: Core.IQProgressListener): void {
    return Core.upload(this.deps, file, callback)
  }

  sendFileMessage(message: Core.IQMessage, file: File, callback?: Core.IQProgressListener<Core.IQMessage>): void {
    return Core.sendFileMessage(this.deps, message, file, callback)
  }

  getThumbnailURL(url: string) {
    return Core.getThumbnailURL(url)
  }

  generateMessage({
    roomId,
    text,
    extras,
  }: {
    roomId: number
    text: string
    extras?: Record<string, any>
  }): Core.IQMessage {
    return Core.generateMessage(this.deps, { roomId, text, extras })
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
  }): Core.IQMessage {
    return Core.generateFileAttachmentMessage(this.deps, { roomId, caption, url, text, extras, filename, size })
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
  }): Core.IQMessage {
    return Core.generateCustomMessage(this.deps, { roomId, text, type, payload, extras })
  }

  generateReplyMessage({
    roomId,
    text,
    repliedMessage,
    extras,
  }: {
    roomId: number
    text: string
    repliedMessage: Core.IQMessage
    extras?: Record<string, unknown>
  }): Core.IQMessage {
    return Core.generateReplyMessage(this.deps, { roomId, text, repliedMessage, extras })
  }

  _generateUniqueId(): string {
    return Core.generateUniqueId()
  }
  // endregion

  // region Realtime
  publishCustomEvent(roomId: number, data: any): Promise<void>
  publishCustomEvent(roomId: number, data: any, callback?: Core.IQCallback1): void
  publishCustomEvent(roomId: number, data: any, callback?: Core.IQCallback1) {
    return Core.publishCustomEvent(this.deps, roomId, data, callback)
  }

  publishOnlinePresence(isOnline: boolean): Promise<void>
  publishOnlinePresence(isOnline: boolean, callback?: Core.IQCallback1): void
  publishOnlinePresence(isOnline: boolean, callback?: Core.IQCallback1): void | Promise<void> {
    return Core.publishOnlinePresence(this.deps, isOnline, callback)
  }

  publishTyping(roomId: number, isTyping?: boolean): Promise<void>
  publishTyping(roomId: number, isTyping?: boolean, callback?: Core.IQCallback1): void
  publishTyping(roomId: number, isTyping?: boolean, callback?: Core.IQCallback1): void | Promise<void> {
    return Core.publishTyping(this.deps, roomId, isTyping, callback)
  }

  subscribeCustomEvent(roomId: number, callback: Core.IQCallback2<any>): void {
    return Core.subscribeCustomEvent(this.deps, roomId, callback)
  }

  unsubscribeCustomEvent(roomId: number): void {
    return Core.unsubscribeCustomEvent(this.deps, roomId)
  }

  onMessageReceived(handler: (message: Core.IQMessage) => void) {
    return Core.onMessageReceived(this.deps, this._onMessageReceived$, handler)
  }

  onMessageUpdated(handler: (message: Core.IQMessage) => void): () => void {
    return Core.onMessageUpdated(this.deps, this._onMessageUpdated$, handler)
  }

  onMessageDeleted(handler: (message: Core.IQMessage) => void): Core.Subscription {
    return Core.onMessageDeleted(this.deps, this._onMessageDeleted$, handler)
  }

  onMessageDelivered(handler: (message: Core.IQMessage) => void): Core.Subscription {
    return Core.onMessageDelivered(this.deps, this._onMessageDelivered$, handler)
  }

  onMessageRead(handler: (message: Core.IQMessage) => void): Core.Subscription {
    return Core.onMessageRead(this.deps, this._onMessageRead$, handler)
  }

  onUserTyping(handler: (userId: string, roomId: number, isTyping: boolean) => void): Core.Subscription {
    return Core.onUserTyping(this.deps, handler)
  }

  onUserOnlinePresence(handler: (userId: string, isOnline: boolean, lastSeen: Date) => void): Core.Subscription {
    return Core.onUserOnlinePresence(this.deps, handler)
  }

  onChatRoomCleared(handler: Core.Callback<number>): Core.Subscription {
    return Core.onChatRoomCleared(this.deps, this._onRoomCleared$, handler)
  }

  onConnected(handler: () => void): Core.Subscription {
    return Core.onConnected(this.deps, handler)
  }

  onReconnecting(handler: () => void): Core.Subscription {
    return Core.onReconnecting(this.deps, handler)
  }

  onDisconnected(handler: () => void): Core.Subscription {
    return Core.onDisconnected(this.deps, handler)
  }

  subscribeChatRoom(room: Core.IQChatRoom): void {
    return Core.subscribeChatRoom(this.deps, room)
  }

  unsubscribeChatRoom(room: Core.IQChatRoom): void {
    return Core.unsubscribeChatRoom(this.deps, room)
  }

  subscribeUserOnlinePresence(userId: string): void {
    return Core.subscribeUserOnlinePresence(this.deps, userId)
  }

  unsubscribeUserOnlinePresence(userId: string): void {
    return Core.unsubscribeUserOnlinePresence(this.deps, userId)
  }
  // endregion
}
