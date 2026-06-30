// Hand-written TypeScript declarations for qiscus-sdk-core public API.
// Source of truth: src/index.js, src/lib/Comment.js, src/lib/Room.js

// ---------------------------------------------------------------------------
// Auxiliary types
// ---------------------------------------------------------------------------

export interface Participant {
  id: number | string;
  email: string;
  username: string;
  avatar_url?: string;
  [key: string]: unknown;
}

export interface UserData {
  email: string;
  username: string;
  avatar_url: string;
  token: string;
  refresh_token?: string;
  token_expires_at?: string;
  last_comment_id: number;
  user_extras?: unknown;
  [key: string]: unknown;
}

export interface LoginResponse {
  user: UserData;
  [key: string]: unknown;
}

export interface IdentityTokenData {
  identity_token: string;
  user: {
    email: string;
    username: string;
    avatar_url: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// QiscusCallbacks — all 27 options.*Callback entries
// ---------------------------------------------------------------------------

export interface QiscusCallbacks {
  authTokenRefreshedCallback?: (param: {
    token: string;
    refreshToken: string;
    expiredAt: unknown;
    oldToken: string;
  }) => void;
  blockUserCallback?: (response: unknown) => void;
  chatRoomCreatedCallback?: (response: { room: Room }) => void;
  commentDeletedCallback?: (data: {
    roomId: number;
    commentUniqueIds: string[];
    isForEveryone: boolean;
    isHard: boolean;
  }) => void;
  commentDeliveredCallback?: (response: { comment: Comment; userId: string }) => void;
  /** Note: intentional typo from the source — "Formater" not "Formatter" */
  commentFormaterCallback?: (message: string) => string;
  commentReadCallback?: (response: { comment: Comment; userId: string }) => void;
  commentRetryExceedCallback?: (comment: Comment) => void;
  commentSentCallback?: (data: { comment: Comment }) => void;
  fileUploadedCallback?: (url: string) => void;
  groupRoomCreatedCallback?: (response: Room) => void;
  headerClickedCallback?: (response: unknown) => void;
  loginErrorCallback?: (error: unknown) => void;
  loginSuccessCallback?: (response: LoginResponse) => void;
  messageInfoCallback?: (response: unknown) => void;
  messageUpdatedCallback?: (message: unknown) => void;
  newMessagesCallback?: (comments: unknown[]) => void;
  onReconnectCallback?: () => void;
  onReconnectedCallback?: () => void;
  onRoomTypingCallback?: (data: unknown) => void;
  prePostCommentCallback?: (message: string) => void;
  presenceCallback?: (message: string, userId: string) => void;
  roomChangedCallback?: (room: Room) => void;
  roomClearedCallback?: (room: unknown) => void;
  typingCallback?: (data: { message: unknown; username: string; room_id: number }) => void;
  unblockUserCallback?: (response: unknown) => void;
  updateProfileCallback?: (user: unknown) => void;
  /** Optional avatar display flag (not a callback but lives in options) */
  avatar?: boolean;
}

// ---------------------------------------------------------------------------
// QiscusInitConfig
// ---------------------------------------------------------------------------

export interface QiscusInitConfig {
  /** Required. The Qiscus App ID. */
  AppId: string;
  baseURL?: string;
  mqttURL?: string;
  brokerUrl?: string;
  brokerLbURL?: string;
  uploadURL?: string;
  googleMapKey?: string;
  /** Realtime sync mode. Default: 'socket'. */
  sync?: 'socket' | 'http' | 'both';
  mode?: string;
  /** Polling interval in milliseconds. Default: 5000. */
  syncInterval?: number;
  /** Sync delay after connecting in milliseconds. Default: 10000. */
  syncOnConnect?: number;
  enableRealtime?: boolean;
  enableRealtimeLB?: boolean;
  allowedFileTypes?: string[];
  customTemplate?: boolean;
  templateFunction?: (...args: unknown[]) => unknown;
  /** Whether to fetch server config on init. Default: true. */
  withConfig?: boolean;
  updateCommentStatusMode?: string;
  updateCommentStatusThrottleDelay?: number;
  /** Callback options wired at init time. */
  options?: QiscusCallbacks;
}

// ---------------------------------------------------------------------------
// Comment
// ---------------------------------------------------------------------------

export declare class Comment {
  id: number;
  before_id: number;
  message: string;
  username_as: string;
  username_real: string;
  email: string;
  user_extras: unknown;
  date: string;
  time: string;
  timestamp: string | Date;
  unique_id: string;
  unique_temp_id: string;
  avatar: string;
  room_id: number;
  isChannel: boolean;
  unix_timestamp: number;
  unix_nano_timestamp: number;
  extras: unknown;
  is_deleted: boolean;
  isPending: boolean;
  isFailed: boolean;
  isDelivered: boolean;
  isRead: boolean;
  isSent: boolean;
  attachment: unknown;
  payload: unknown;
  status: string;
  type: string;
  subtype: string | null;

  constructor(comment: object);

  isAttachment(message: string): boolean;
  isImageAttachment(message: string): boolean;
  attachUniqueId(uniqueId: string): void;
  getAttachmentURI(message: string): string | undefined;
  setAttachment(attachment: unknown): void;
  markAsPending(): void;
  markAsSent(): void;
  markAsDelivered(opts?: { actor?: string; activeActorId?: string }): void;
  markAsRead(opts?: { actor?: string; activeActorId?: string }): void;
  markAsFailed(): void;
  update(data: object): void;
}

// ---------------------------------------------------------------------------
// Room
// ---------------------------------------------------------------------------

export declare class Room {
  id: number;
  last_comment_id: number;
  last_comment_message: string;
  last_comment_message_created_at: string | Date;
  last_comment_topic_title: string;
  last_comment: unknown;
  avatar: string;
  name: string;
  room_type: 'single' | 'group' | string;
  secret_code: string | null;
  participants: Participant[];
  options: unknown;
  topics: unknown[];
  comments: Comment[];
  count_notif: number;
  isLoaded: boolean;
  custom_title: string | null;
  custom_subtitle: string | null;
  unique_id: string;
  isChannel: boolean;
  participantNumber: number;

  constructor(roomData: object);

  isCurrentlySelected(selected: Room): boolean;
  getParticipantCount(): number;
  setTitle(title: string): void;
  setSubTitle(subtitle: string): void;
  receiveComment(comment: Comment): void;
  receiveComments(comments: object[]): void;
  getParticipant(participantEmail: string): Participant | null;
  addParticipant(participant: Participant): void;
}

// ---------------------------------------------------------------------------
// LoadComments options
// ---------------------------------------------------------------------------

export interface LoadCommentsOptions {
  last_comment_id?: number;
  after?: boolean;
  limit?: number;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// SearchMessage params
// ---------------------------------------------------------------------------

export interface SearchMessageParams {
  query?: string;
  roomIds?: number[];
  userId?: string;
  type?: string | string[];
  roomType?: 'group' | 'single' | 'channel';
  page?: number;
  limit?: number;
}

// ---------------------------------------------------------------------------
// GetFileList params
// ---------------------------------------------------------------------------

export interface GetFileListParams {
  roomIds?: number[];
  fileType?: string;
  page?: number;
  limit?: number;
  sender?: string | null;
  userId?: string | null;
  includeExtensions?: string;
  excludeExtensions?: string;
}

// ---------------------------------------------------------------------------
// QiscusSDK
// ---------------------------------------------------------------------------

export declare class QiscusSDK {
  // Static const-enum-like
  static readonly UpdateCommentStatusMode: {
    readonly disabled: string;
    readonly throttled: string;
    readonly enabled: string;
  };
  static readonly Interceptor: object;

  // Public instance state
  rooms: Room[];
  selected: Room | null;
  isLogin: boolean;
  isInit: boolean;
  isSynced: boolean;
  userData: UserData | Record<string, unknown>;
  version: string;
  AppId: string | null;
  baseURL: string;
  mqttURL: string;
  sync: 'socket' | 'http' | 'both';
  syncInterval: number;
  syncOnConnect: number;
  enableRealtime: boolean;
  updateCommentStatusMode: string;
  updateCommentStatusThrottleDelay: number;
  last_received_comment_id: number;
  chatmateStatus: string | null;
  isTypingStatus: string | null;
  debugMode: boolean;
  options: QiscusCallbacks;
  extras: unknown;

  // Public getters
  readonly uploadURL: string;
  /** Triggers a sync poll immediately. Delegates to the internal SyncAdapter. */
  readonly synchronize: (...args: unknown[]) => unknown;
  /** Triggers a sync-event poll immediately. Delegates to the internal SyncAdapter. */
  readonly synchronizeEvent: (...args: unknown[]) => unknown;
  readonly Interceptor: object;

  constructor();

  // Lifecycle
  init(config: QiscusInitConfig): Promise<unknown>;
  setUser(
    userId: string,
    key: string,
    username?: string,
    avatarURL?: string,
    extras?: object
  ): Promise<LoginResponse>;
  setUserWithIdentityToken(data: IdentityTokenData): void;
  refreshAuthToken(): Promise<unknown>;
  logout(): Promise<void>;
  disconnect(): void;

  // Presence
  publishOnlinePresence(val: boolean): void;
  subscribeUserPresence(userId: string): void;
  unsubscribeUserPresence(userId: string): void;

  // Realtime connection
  closeRealtimeConnection(): Promise<boolean>;
  openRealtimeConnection(): Promise<boolean>;

  // Sync
  startSync(): Promise<void>;
  stopSync(): Promise<void>;

  // Rooms
  setActiveRoom(room: Room): void;
  chatTarget(userId: string, options?: object): Promise<Room>;
  chatGroup(id: number): Promise<Room> | undefined;
  getRoomById(id: number): Promise<Room> | undefined;
  getOrCreateRoomByUniqueId(
    id: string,
    roomName?: string,
    avatarURL?: string
  ): Promise<Room>;
  getOrCreateRoomByChannel(
    channel: string,
    name?: string,
    avatarURL?: string
  ): Promise<Room>;
  loadRoomList(params?: object): Promise<Room[]>;
  updateRoom(args: object): Promise<unknown>;
  getRoomsInfo(params: object): Promise<unknown>;
  clearRoomsCache(): void;
  exitChatRoom(): void;
  clearRoomMessages(roomIds: number[]): Promise<unknown>;
  getTotalUnreadCount(): Promise<unknown>;
  getRoomUnreadCount(): Promise<unknown>;
  sortComments(): void;

  // Comments / messages
  loadComments(
    roomId: number,
    options?: LoadCommentsOptions
  ): Promise<object[]>;
  loadMore(
    lastCommentId: number,
    options?: object
  ): Promise<object[]> | undefined;
  sendComment(
    topicId: number,
    commentMessage: string,
    uniqueId?: string,
    type?: string,
    payload?: object | string,
    extras?: object
  ): Promise<Comment>;
  resendComment(comment: Comment): Promise<Room>;
  readComment(roomId: number, commentId: number): void;
  receiveComment(roomId: number, commentId: number): void;
  updateLastReceivedComment(id: number): void;
  deleteComment(
    roomId: number,
    commentUniqueIds: string[],
    isForEveryone: boolean,
    isHard: boolean
  ): Promise<unknown>;
  searchMessages(params?: object): Promise<Comment[]>;
  searchMessage(params?: SearchMessageParams): Promise<unknown>;
  updateMessage(message: object): Promise<unknown>;
  onMessageUpdated(handler: (message: unknown) => void): () => void;

  // Message generators (create a local Comment object without sending)
  generateMessage(params: {
    roomId: number;
    text: string;
    extras?: object;
  }): Comment;
  generateFileAttachmentMessage(params: {
    roomId: number;
    caption?: string;
    url: string;
    text?: string;
    extras?: object;
    filename?: string;
    size?: number;
  }): Comment;
  generateCustomMessage(params: {
    roomId: number;
    text: string;
    type: string;
    payload?: object;
    extras?: object;
  }): Comment;
  generateReplyMessage(params: {
    roomId: number;
    text: string;
    repliedMessage: Comment;
    extras?: object;
  }): Comment;

  // Participants
  createGroupRoom(
    name: string,
    emails: string[],
    options?: object
  ): Promise<Room>;
  addParticipantsToGroup(roomId: number, emails: string[]): Promise<unknown>;
  removeParticipantsFromGroup(
    roomId: number,
    emails: string[]
  ): Promise<unknown>;
  getRoomParticipants(roomUniqueId: string, offset?: number): Promise<unknown>;
  getParticipants(
    roomUniqueId: string,
    page?: number,
    limit?: number
  ): Promise<unknown>;
  removeSelectedRoomParticipants(
    values?: unknown[],
    payload?: 'id' | 'email' | 'username'
  ): Promise<Participant[]>;

  // Users
  getUsers(query?: string, page?: number, limit?: number): Promise<unknown>;
  updateProfile(user: object): Promise<unknown>;
  getUserProfile(): Promise<unknown>;
  blockUser(email: string): Promise<unknown>;
  unblockUser(email: string): Promise<unknown>;
  getBlockedUser(page?: number, limit?: number): Promise<unknown>;
  getUserPresences(email?: string[]): Promise<unknown>;

  // Auth helpers
  getNonce(): Promise<unknown>;
  verifyIdentityToken(identityToken: string): Promise<unknown>;

  // Upload
  upload(
    file: File,
    callback: (
      error: Error | null,
      progress: object | null,
      fileURL?: string
    ) => void
  ): Promise<string>;
  uploadFile(roomId: number, file: File): void;

  // Device tokens
  registerDeviceToken(token: string, isDevelopment?: boolean): Promise<unknown>;
  removeDeviceToken(token: string, isDevelopment?: boolean): Promise<unknown>;

  // Realtime / custom events
  publishTyping(val: boolean): void;
  publishEvent(...args: unknown[]): void;
  subscribeEvent(...args: unknown[]): void;
  unsubscribeEvent(...args: unknown[]): void;

  // File list
  getFileList(params?: GetFileListParams): Promise<unknown>;

  // Headers
  setCustomHeader(headers: Record<string, string>): void;

  // URL helpers
  getThumbnailURL(fileURL: string): string;
  getBlurryThumbnailURL(fileURL: string): string;

  // Hooks / interceptors
  intercept(
    interceptor: unknown,
    callback: (payload: unknown) => unknown | Promise<unknown>
  ): void;
}

export default QiscusSDK;
