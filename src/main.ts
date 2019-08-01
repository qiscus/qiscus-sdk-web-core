import is from 'is_js'
import getUserAdapter, { IQUser, IQUserAdapter, IQUserExtraProps, QNonce } from './adapters/user'
import getMessageAdapter, { IQMessage, IQMessageAdapter } from './adapters/message'
import getRoomAdapter, { IQParticipant, IQRoom, IQRoomAdapter } from './adapters/room'
import getRealtimeAdapter, { IQRealtimeAdapter } from './adapters/realtime'
import getHttpAdapter, { IQHttpAdapter } from './adapters/http'

export type IQCallback<T> = (error: Error, response?: T) => void
export type IQOptionalCallback<T, CallbackResponseType> = T | IQCallback<CallbackResponseType>

export interface IQInitOptions {
  baseUrl: string
  brokerUrl: string
  syncMode: 'socket' | 'http' | 'both'
  syncInterval: number
}
export interface IQUploadProgress {
  progress?: number
  fileUrl?: string
}

export interface IQiscus {
  init(opts: IQInitOptions): void

  // from UserAdapter
  setUser(userId: string, userKey: string, extra?: IQOptionalCallback<IQUserExtraProps, IQUser>, callback?: IQCallback<IQUser>): void
  clearUser(callback?: IQCallback<void>): void
  updateUser(userId: string, extra?: IQOptionalCallback<IQUserExtraProps, IQUser>, callback?: IQCallback<IQUser>): void
  getNonce(callback?: IQCallback<QNonce>): void
  setUserFromIdentityToken(token: string, callback?: IQCallback<IQUser>): void
  getUserList(
    query?: IQOptionalCallback<string, IQUser[]>,
    page?: IQOptionalCallback<number, IQUser[]>,
    limit?: IQOptionalCallback<number, IQUser[]>,
    callback?: IQCallback<IQUser[]>): void
  getBlockedUserList(page?: IQOptionalCallback<number, IQUser[]>, limit?: IQOptionalCallback<number, IQUser[]>, callback?: IQCallback<IQUser[]>): void
  blockUser(userId: string, callback?: IQCallback<IQUser>): void
  unblockUser(userId: string, callback?: IQCallback<IQUser>): void

  // from RoomAdapter
  chatUser(userId: string, callback?: IQCallback<IQRoom>): void
  getRoomList(page?: IQOptionalCallback<number, IQRoom[]>,
              limit?: IQOptionalCallback<number, IQRoom[]>,
              callback?: IQCallback<IQRoom[]>): void
  getRoom(roomId: number, callback?: IQCallback<IQRoom>): void
  getChannel(uniqueId: string, callback?: IQCallback<IQRoom>): void
  updateRoom(roomId: number, room: IQRoom, callback?: IQCallback<IQRoom>): void
  getParticipantList(roomId: number,
                     page?: IQOptionalCallback<number, IQParticipant[]>,
                     limit?: IQOptionalCallback<number, IQParticipant[]>,
                     callback?: IQCallback<IQParticipant[]>): void
  createGroup(name: string, initialParticipantIds: string[], callback?: IQCallback<IQRoom>): void
  removeParticipants(roomId: number, participantIds: string[], callback?: IQCallback<IQParticipant[]>): void
  addParticipants(roomId: number, participantIds: string[], callback?: IQCallback<IQParticipant[]>): void
  getRoomInfo(roomIds: number[], callback?: IQCallback<IQRoom>): void
  clearRoom(roomIds: number[], callback?: IQCallback<IQRoom[]>): void
  getUnreadCount(callback?: IQCallback<number>): void

  // from MessageAdapter
  getMessageList(roomId: number,
                 lastMessageId?: number,
                 page?: IQOptionalCallback<number, IQMessage[]>,
                 limit?: IQOptionalCallback<number, IQMessage[]>,
                 callback?: IQCallback<IQMessage[]>): void
  sendMessage(roomId: number, message: IQMessage, callback?: IQCallback<IQMessage>): void
  resendMessage(roomId: number, message: IQMessage, callback?: IQCallback<IQMessage>): void
  deleteMessage(messageIds: number[], callback?: IQCallback<IQMessage[]>): void
  markAsRead(message: IQMessage, callback?: IQCallback<IQMessage>): void
  markAsDelivered(message: IQMessage, callback?: IQCallback<IQMessage>): void

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
  private readonly syncInterval: number = null

  constructor(private appId: string, opts?: IQInitOptions) {
    this.baseUrl = opts.baseUrl || 'https://api.qiscus.com/api/v2/sdk/'
    this.brokerUrl = opts.brokerUrl || 'wss://mqtt.qiscus.com:1886/mqtt'
    this.syncInterval = opts.syncInterval || 5000
    this.syncMode = opts.syncMode || 'socket'
    this.httpAdapter = getHttpAdapter({
      baseUrl: this.baseUrl,
      getAppId: () => appId,
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
      // TODO: Replace me when mqtt adapter are ready
      shouldSync: () => true
    })
  }

  init(opts: IQInitOptions): void {
    this.baseUrl = opts.baseUrl
    this.brokerUrl = opts.brokerUrl
    this.syncMode = opts.syncMode
  }

  // User Adapter
  setUser(userId: string, userKey: string, extra?: IQUserExtraProps | IQCallback<IQUser>, callback?: IQCallback<IQUser>) {
    if (is.null(userId)) return callback(new Error('`userId` required'))
    if (is.not.string(userId)) return callback(new TypeError('`userId` must have type of string'))
    if (is.null(userKey)) return callback(new Error('`userKey` required'))
    if (is.not.string(userKey)) return callback(new TypeError('`userKey` must have type of string'))
    if (is.not.null(extra) && (is.not.json(extra) || is.not.function(extra))) {
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
  updateUser(name: string, extra?: IQUserExtraProps, callback?: IQCallback<any>): void {
    callback = getCallback(extra, callback)
    if (is.null(name)) return callback(new Error('`name` required'))
    if (is.not.function(extra) && is.not.object(extra)) return callback(new Error('`extra` must have type of object'))
    this.userAdapter.updateUser(name, extra)
      .then(user => callback(null, user))
      .catch(error => callback(error))
  }
  setUserFromIdentityToken (token: string, callback?: IQCallback<IQUser>): void {
    this.userAdapter.setUserFromIdentityToken(token)
      .then(resp => callback(null, resp))
      .catch(error => callback(error))
  }
  getBlockedUserList(page?: number, limit?: number, callback?: IQCallback<IQUser[]>): void {
    if (is.not.function(page) && is.not.number(page)) return callback(new Error('`page` must have type of number'))
    if (is.not.function(limit) && is.not.number(limit)) return callback(new Error('`limit` must have type of number'))
    callback = getCallback<IQCallback<IQUser[]>>(page, limit, callback)
    this.userAdapter.getBlockedUser(page, limit)
      .then(users => callback(null, users))
      .catch(error => callback(error))
  }
  getUserList(query?: string, page?: number, limit?: number, callback?: IQCallback<IQUser[]>): void {
    callback = getCallback(query, page, limit, callback)
    if (is.not.function(query) && is.not.string(query)) return callback(new Error('`query` must have type of string'))
    if (is.not.function(page) && is.not.number(page)) return callback(new Error('`page` must have type of number'))
    if (is.not.function(limit) && is.not.number(limit)) return callback(new Error('`limit` must have type of number'))
    this.userAdapter.getUserList(query, page, limit)
      .then(users => callback(null, users))
      .catch(error => callback(error))
  }

  // Room Adapter
  chatUser(userId: string, callback?: IQCallback<IQRoom>): void {
    callback = getCallback(callback)
    if (is.null(userId)) return callback(new Error('`userId` required'))
    if (is.not.string(userId)) return callback(new Error('`userId` must have type of string'))
    this.roomAdapter.chatUser(userId)
      .then(room => callback(null, room))
      .catch(error => callback(error))
  }
  addParticipants(roomId: number, participantIds: string[], callback?: IQCallback<any>): void {
    callback = getCallback(callback)
    this.roomAdapter.addParticipants(roomId, participantIds)
      .then(room => callback(null, room))
      .catch(error => callback(error))
  }
  clearRoom(roomIds: number[], callback?: IQCallback<IQRoom[]>): void {
    callback = getCallback(callback)
    this.roomAdapter.clearRoom(roomIds)
      .then(rooms => callback(null, rooms))
      .catch(error => callback(error))
  }
  createGroup(name: string, initialParticipantIds: string[], callback?: IQCallback<IQRoom>): void {
    callback = getCallback(callback)
    this.roomAdapter.createGroup(name, initialParticipantIds)
      .then(rooms => callback(null, rooms))
      .catch(error => callback(error))
  }
  deleteMessage(messageIds: number[], callback?: IQCallback<IQMessage[]>): void {
    callback = getCallback(callback)
    this.messageAdapter.deleteMessage(messageIds)
      .then(message => callback(null, message))
      .catch(error => callback(error))
  }
  getChannel(uniqueId: string, callback?: IQCallback<IQRoom>): void {
    callback = getCallback(callback)
    this.roomAdapter.getChannel(uniqueId, null)
      .then(room => callback(null, room))
      .catch(error => callback(error))
  }
  getMessageList(roomId: number, lastMessageId?: number, page?: number, limit?: number, callback?: IQCallback<IQMessage[]>): void {
    callback = getCallback(lastMessageId, page, limit, callback)
    this.messageAdapter.getMessages(roomId, lastMessageId, page, limit)
      .then(messages => callback(null, messages))
      .catch(error => callback(error))
  }
  getParticipantList(roomId: number, page?: number, limit?: number, callback?: IQCallback<IQParticipant[]>): void {
    callback = getCallback(page, limit, callback)
    this.roomAdapter.getParticipantList(roomId, page, limit)
      .then(participants => callback(null, participants))
      .catch(error => callback(error))
  }
  getRoom(roomId: number, callback?: IQCallback<IQRoom>): void {
    callback = getCallback(callback)
    this.roomAdapter.getRoom(roomId)
      .then(room => callback(null, room))
      .catch(error => callback(error))
  }
  getRoomInfo(roomIds: number[], callback?: IQCallback<any>): void {
    callback = getCallback(callback)
    this.roomAdapter.getRoomInfo(roomIds)
      .then(rooms => callback(null, rooms))
      .catch(error => callback(error))
  }
  getRoomList(page?: IQOptionalCallback<number, IQRoom[]>, limit?: IQOptionalCallback<number, IQRoom[]>, callback?: IQCallback<IQRoom[]>): void {
    callback = getCallback(page, limit, callback)
    this.roomAdapter.getRoomList(false, page as number, limit as number)
      .then(rooms => callback(null, rooms))
      .catch(error => callback(error))
  }
  getUnreadCount(callback?: IQCallback<number>): void {
    callback = getCallback(callback)
    this.roomAdapter.getUnreadCount()
      .then(count => callback(null, count))
      .catch(error => callback(error))
  }

  // Message Adapter
  markAsDelivered (message: IQMessage, callback?: IQCallback<IQMessage>): void {
  }
  markAsRead (message: IQMessage, callback?: IQCallback<IQMessage>): void {}

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
