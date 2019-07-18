import is from 'is_js'
import getUserAdapter, { IQUser, IQUserAdapter, IQUserExtraProps, QNonce } from 'adapters/user'
import getMessageAdapter, { IQMessage, IQMessageAdapter } from './adapters/message'
import getRoomAdapter, { IQParticipant, IQRoom, IQRoomAdapter } from './adapters/room'
import getRealtimeAdapter, { IQRealtimeAdapter } from './adapters/realtime'
import getHttpAdapter, { IQHttpAdapter } from './adapters/http'

export type IQCallback<T> = (error: Error, response?: T) => void

export interface IQInitOptions {
  baseUrl: string
  brokerUrl: string
  syncMode: string
}
export interface IQUploadProgress {
  progress?: number
  fileUrl?: string
}

export interface IQiscus {
  init(opts: IQInitOptions): void

  // from UserAdapter
  setUser(userId: string, userKey: string, extra?: IQUserExtraProps, callback?: IQCallback<IQUser>): void
  clearUser(callback?: IQCallback<void>): void
  updateUser(userId: string, avatarUrl: string, callback?: IQCallback<IQUser>): void
  getNonce(callback?: IQCallback<QNonce>): void
  verifyIdentityToken(token: string, callback?: IQCallback<any>): void
  getUserList(query?: string, page?: number, limit?: number, callback?: IQCallback<IQUser[]>): void
  getBlockedUserList(page?: number, limit?: number, callback?: IQCallback<IQUser[]>): void
  blockUser(userId: string, callback?: IQCallback<IQUser>): void
  unblockUser(userId: string, callback?: IQCallback<IQUser>): void

  // from RoomAdapter
  chatUser(userId: string, callback?: IQCallback<IQRoom>): void
  getRoomList(page?: number, limit?: number, callback?: IQCallback<IQRoom[]>): void
  getRoom(roomId: number, callback?: IQCallback<IQRoom>): void
  getChannel(uniqueId: string, callback?: IQCallback<IQRoom>): void
  updateRoom(roomId: number, room: IQRoom, callback?: IQCallback<IQRoom>): void
  getParticipantList(roomId: number, page?: number, limit?: number, callback?: IQCallback<IQParticipant>): void
  createGroup(name: string, initialParticipantIds: string[], callback?: IQCallback<IQRoom>): void
  removeParticipants(roomId: number, participantIds: string[], callback?: IQCallback<IQParticipant[]>): void
  addParticipants(roomId: number, participantIds: string[], callback?: IQCallback<IQParticipant[]>): void
  getRoomInfo(roomIds: number[], callback?: IQCallback<IQRoom>): void
  clearRoom(roomId: number, callback?: IQCallback<IQRoom>): void
  getUnreadCount(callback?: IQCallback<number>): void

  // from MessageAdapter
  getMessageList(roomId: number, page?: number, limit?: number, callback?: IQCallback<IQMessage[]>): void
  sendMessage(roomId: number, message: IQMessage, callback?: IQCallback<IQMessage>): void
  resendMessage(roomId: number, message: IQMessage, callback?: IQCallback<IQMessage>): void
  deleteMessage(messageIds: number[], callback?: IQCallback<IQMessage>): void

  upload(file: File, callback?: IQCallback<IQUploadProgress>): void
  setTyping(isTyping?: boolean): void

  // from CustomEventAdapter
  publishEvent(eventId: string, data: any): void
  subscribeEvent(eventId: string, callback: IQCallback<any>): void
  unsubscribeEvent(eventId): void
}

const noop = () => { }
/**
 * A helper function to get callback from given arguments
 * Make sure, to place the real callback on the most right
 * if all given arguments are null, will return a noop function
 *
 * @param args
 */
function getCallback<T>(...args: any | T) {
  return args.reduceRight((result, item) => {
    if (is.not.function(item)) return result
    return item
  }, noop) as T
}

export default class Qiscus implements IQiscus {
  private readonly realtimeAdapter: IQRealtimeAdapter
  private readonly httpAdapter: IQHttpAdapter
  private readonly userAdapter: IQUserAdapter
  private readonly roomAdapter: IQRoomAdapter
  private readonly messageAdapter: IQMessageAdapter

  private syncMode: string = 'socket'
  private baseUrl: string = null
  private brokerUrl: string = null
  private syncInterval: number = 5000

  constructor(private appId: string) {
    this.httpAdapter = getHttpAdapter({
      baseUrl: this.baseUrl,
      getAppId: () => appId,
      getToken: () => this.token,
      getUserId: () => this.currentUser.userId,
      getSdkVersion: () => ''
    })
    this.userAdapter = getUserAdapter(() => this.httpAdapter)
    this.roomAdapter = getRoomAdapter(() => this.httpAdapter, () => this.userAdapter)
    this.messageAdapter = getMessageAdapter(() => this.httpAdapter, () => this.userAdapter)
    this.realtimeAdapter = getRealtimeAdapter(this.syncInterval, {
      brokerUrl: () => this.brokerUrl,
      http: () => this.httpAdapter,
      user: () => this.userAdapter,
      // TODO: Replace me when mqtt adapter are ready
      shouldSync: () => false
    })
  }

  init(opts: IQInitOptions): void {
    this.baseUrl = opts.baseUrl
    this.brokerUrl = opts.brokerUrl
    this.syncMode = opts.syncMode
  }
  setUser(userId: string, userKey: string, extra?: IQUserExtraProps | IQCallback<IQUser>, callback?: IQCallback<IQUser>) {
    if (is.null(userId)) return callback(new Error('`userId` required'))
    if (is.not.string(userId)) return callback(new TypeError('`userId` must have type of string'))
    if (is.null(userKey)) return callback(new Error('`userKey` required'))
    if (is.not.string(userKey)) return callback(new TypeError('`userKey` must have type of string'))
    if (is.not.null(extra) && (is.not.object(extra) || is.not.function(extra))) {
      return callback(new TypeError('`extra` must have type of object'))
    }

    callback = getCallback<IQCallback<IQUser>>(extra, callback)
    this.userAdapter.login(userId, userKey, extra as IQUserExtraProps)
      .then((user) => callback(null, user))
      .catch((error) => callback(error))
  }
  blockUser(userId: string, callback?: IQCallback<IQUser>): void {
    if (is.null(userId)) return callback(new Error('`userId` required'))
    if (is.not.string(userId)) return callback(new TypeError('`userId` must have type of string'))

    callback = getCallback<IQCallback<IQUser>>(callback)
    this.userAdapter.blockUser(userId)
      .then(user => callback(null, user))
      .catch(error => callback(error))
  }
  clearUser(callback?: IQCallback<void>): void {
    callback = getCallback<IQCallback<void>>(callback)
    Promise.resolve(this.userAdapter.clear())
      .then(() => callback(null))
      .catch(error => callback(error))
  }
  getNonce(callback?: IQCallback<QNonce>): void {
    callback = getCallback<IQCallback<QNonce>>(callback)
    this.userAdapter.getNonce()
      .then((nonce) => callback(null, nonce))
      .catch((error) => callback(error))
  }
  unblockUser(userId: string, callback?: IQCallback<IQUser>): void {
    if (is.null(userId)) return callback(new Error('`userId` required'))
    if (is.not.string(userId)) return callback(new TypeError('`userId` must have type of string'))
    this.userAdapter.unblockUser(userId)
      .then(user => callback(null, user))
      .catch(error => callback(error))
  }
  updateUser(name: string, avatarUrl?: string, callback?: IQCallback<any>): void {
    callback = getCallback(avatarUrl, callback)
    this.userAdapter.updateUser(name, { avatarUrl: avatarUrl })
      .then(user => callback(null, user))
      .catch(error => callback(error))
  }
  verifyIdentityToken(token: string, callback?: IQCallback<any>): void {
    this.userAdapter.verifyIdentityToken(token)
      .then(resp => callback(null, resp))
      .catch(error => callback(error))
  }


  addParticipants(roomId: number, participantIds: string[], callback?: IQCallback<any>): void {
  }
  chatUser(userId: string, callback?: IQCallback<any>): void {
  }
  clearRoom(roomId: number, callback?: IQCallback<any>): void {
  }
  createGroup(name: string, initialParticipantIds: string[], callback?: IQCallback<any>): void {
  }
  deleteMessage(messageIds: number[], callback?: IQCallback<any>): void {
  }
  getBlockedUserList(page?: number, limit?: number, callback?: IQCallback<any>): void {
  }
  getChannel(uniqueId: string, callback?: IQCallback<any>): void {
  }
  getMessageList(roomId: number, page?: number, limit?: number, callback?: IQCallback<any>): void {
  }
  getParticipantList(roomId: number, page?: number, limit?: number, callback?: IQCallback<any>): void {
  }
  getRoom(roomId: number, callback?: IQCallback<any>): void {
  }
  getRoomInfo(roomIds: number[], callback?: IQCallback<any>): void {
  }
  getRoomList(page?: number, limit?: number, callback?: IQCallback<any>): void {
  }
  getUnreadCount(callback?: IQCallback<any>): void {
  }
  getUserList(query?: string, page?: number, limit?: number, callback?: IQCallback<any>): void {
  }

  publishEvent(eventId: string, data: any): void {
  }
  removeParticipants(roomId: number, participantIds: string[], callback?: IQCallback<any>): void {
  }
  resendMessage(roomId: number, message: IQMessage, callback?: IQCallback<any>): void {
  }
  sendMessage(roomId: number, message: IQMessage, callback?: IQCallback<any>): void {
  }
  setTyping(isTyping?: boolean): void {
  }
  subscribeEvent(eventId: string, callback: IQCallback<any>): void {
  }
  unsubscribeEvent(eventId): void {
  }
  updateRoom(roomId: number, room: IQRoom, callback?: IQCallback<any>): void {
  }
  upload(file: File, callback?: IQCallback<any>): void {
  }

  private get token() {
    if (this.userAdapter == null) return null
    return this.userAdapter.token
  }
  private get currentUser() {
    if (this.userAdapter == null) return null
    return this.userAdapter.currentUser
  }
}
