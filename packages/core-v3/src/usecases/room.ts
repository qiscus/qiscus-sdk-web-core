import xs from 'xstream'
import flattenConcurrently from 'xstream/extra/flattenConcurrently'
import { IQCallback1, IQCallback2 } from '../defs'
import * as model from '../model'
import {
  bufferUntil,
  process,
  toCallbackOrPromise,
} from '../utils/stream'
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
  isReqNumber,
  isReqString,
} from '../utils/param-utils'
import { QiscusDeps } from './types'

export function updateChatRoom(
  deps: QiscusDeps,
  roomId: number,
  name?: string,
  avatarUrl?: string,
  extras?: object,
  callback?: IQCallback2<model.IQChatRoom>
) {
  // this method should update room list
  return xs
    .combine(
      process(roomId, isReqNumber({ roomId })),
      process(name, isOptString({ name })),
      process(avatarUrl, isOptString({ avatarUrl })),
      process(extras, isOptJson({ extras }))
    )
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map(([roomId, name, avatarUrl, extras]) =>
      xs.fromPromise(deps.roomAdapter.updateRoom(roomId, name, avatarUrl, extras as any))
    )
    .compose(flattenConcurrently)
    .compose(toCallbackOrPromise(callback))
}

export function getChannel(
  deps: QiscusDeps,
  uniqueId: string,
  callback?: IQCallback2<model.IQChatRoom>
) {
  return xs
    .combine(process(uniqueId, isReqString({ uniqueId })), process(callback, isOptCallback({ callback })))
    .map(([uniqueId]) => xs.fromPromise(deps.roomAdapter.getChannel(uniqueId)))
    .compose(flattenConcurrently)
    .compose(toCallbackOrPromise(callback))
}

export function chatUser(
  deps: QiscusDeps,
  userId: string,
  extras?: Record<string, any>,
  callback?: IQCallback2<model.IQChatRoom>
) {
  return xs
    .combine(
      process(userId, isReqString({ userId })),
      process(extras, isOptJson({ extras })),
      process(callback, isOptCallback({ callback }))
    )
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map(([userId, extras]) => xs.fromPromise(deps.roomAdapter.chatUser(userId, extras)))
    .compose(flattenConcurrently)
    .compose(toCallbackOrPromise(callback))
}

export function addParticipants(
  deps: QiscusDeps,
  roomId: number,
  userIds: string[],
  callback?: IQCallback2<model.IQParticipant[]>
) {
  return xs
    .combine(
      process(roomId, isReqNumber({ roomId })),
      process(userIds, isReqArrayString({ userIds })),
      process(callback, isOptCallback({ callback }))
    )
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map(([roomId, userIds]) => xs.fromPromise(deps.roomAdapter.addParticipants(roomId, userIds)))
    .compose(flattenConcurrently)
    .compose(toCallbackOrPromise(callback))
}

export function removeParticipants(
  deps: QiscusDeps,
  roomId: number,
  userIds: string[],
  callback?: IQCallback2<model.IQParticipant[]>
): void | Promise<model.IQParticipant[] | string[]> {
  return xs
    .combine(
      process(roomId, isReqNumber({ roomId })),
      process(userIds, isReqArrayString({ userIds })),
      process(callback, isOptCallback({ callback }))
    )
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map(([roomId, userIds]) => xs.fromPromise(deps.roomAdapter.removeParticipants(roomId, userIds)))
    .compose(flattenConcurrently)
    .compose(toCallbackOrPromise(callback))
}

export function clearMessagesByChatRoomId(
  deps: QiscusDeps,
  roomUniqueIds: string[],
  callback?: IQCallback1
): void | Promise<void> {
  return xs
    .combine(
      process(roomUniqueIds, isReqArrayString({ roomIds: roomUniqueIds })),
      process(callback, isOptCallback({ callback }))
    )
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map(([roomIds]) => xs.fromPromise(deps.roomAdapter.clearRoom(roomIds)))
    .compose(flattenConcurrently)
    .compose(toCallbackOrPromise<void>(callback))
}

export function createGroupChat(
  deps: QiscusDeps,
  name: string,
  userIds: string[],
  avatarUrl?: string,
  extras?: object,
  callback?: IQCallback2<model.IQChatRoom>
): void | Promise<model.IQChatRoom> {
  return xs
    .combine(
      process(name, isReqString({ name })),
      process(userIds, isReqArrayString({ userIds })),
      process(avatarUrl, isOptString({ avatarUrl })),
      process(extras, isOptJson({ extras })),
      process(callback, isOptCallback({ callback }))
    )
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map(([name, userIds, avatarUrl, extras]) =>
      xs.fromPromise(deps.roomAdapter.createGroup(name, userIds, avatarUrl, extras as any))
    )
    .compose(flattenConcurrently)
    .compose(toCallbackOrPromise(callback))
}

export function createChannel(
  deps: QiscusDeps,
  uniqueId: string,
  name?: string,
  avatarUrl?: string,
  extras?: object,
  callback?: IQCallback2<model.IQChatRoom>
): void | Promise<model.IQChatRoom> {
  return xs
    .combine(
      process(uniqueId, isReqString({ uniqueId })),
      process(name, isReqString({ name })),
      process(avatarUrl, isOptString({ avatarUrl })),
      process(extras, isOptJson({ extras })),
      process(callback, isOptCallback({ callback }))
    )
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map(([uniqueId, name, avatarUrl, extras]) =>
      xs.fromPromise(deps.roomAdapter.getChannel(uniqueId, name, avatarUrl, extras as any))
    )
    .compose(flattenConcurrently)
    .compose(toCallbackOrPromise(callback))
}

export function getParticipants(
  deps: QiscusDeps,
  roomUniqueId: string,
  page?: number,
  limit?: number,
  sorting?: 'asc' | 'desc',
  callback?: IQCallback2<model.IQParticipant[]>
): void | Promise<model.IQParticipant[]> {
  return xs
    .combine(
      process(roomUniqueId, isReqString({ roomUniqueId })),
      process(page, isOptNumber({ page })),
      process(limit, isOptNumber({ limit })),
      process(sorting, isOptString({ sorting })),
      process(callback, isOptCallback({ callback }))
    )
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map(([roomId, page, limit, sorting]) =>
      xs.fromPromise(deps.roomAdapter.getParticipantList(roomId, page, limit, sorting))
    )
    .compose(flattenConcurrently)
    .compose(toCallbackOrPromise(callback))
}

export function getChatRooms(
  deps: QiscusDeps,
  ids: number[] | string[],
  page?: number,
  showRemoved?: boolean,
  showParticipant?: boolean,
  callback?: IQCallback2<model.IQChatRoom[]>
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
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map(([_, page, showRemoved, showParticipant]) =>
      xs.fromPromise(deps.roomAdapter.getRoomInfo(roomIds, uniqueIds, page, showRemoved, showParticipant))
    )
    .compose(flattenConcurrently)
    .compose(toCallbackOrPromise(callback))
}

export function getAllChatRooms(
  deps: QiscusDeps,
  showParticipant?: boolean,
  showRemoved?: boolean,
  showEmpty?: boolean,
  page?: number,
  limit?: number,
  callback?: IQCallback2<model.IQChatRoom[]>
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
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map(([showParticipant, showRemoved, showEmpty, page, limit]) =>
      xs.fromPromise(deps.roomAdapter.getRoomList(showParticipant, showRemoved, showEmpty, page, limit))
    )
    .compose(flattenConcurrently)
    .compose(toCallbackOrPromise(callback))
}

export function getChatRoomWithMessages(
  deps: QiscusDeps,
  roomId: number,
  callback?: IQCallback2<[model.IQChatRoom, model.IQMessage[]]>
): void | Promise<[model.IQChatRoom, model.IQMessage[]]> {
  return xs
    .combine(process(roomId, isReqNumber({ roomId })), process(callback, isOptCallback({ callback })))
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map(([roomId]) => xs.fromPromise(deps.roomAdapter.getRoom(roomId)))
    .compose(flattenConcurrently)
    .compose(toCallbackOrPromise(callback) as any)
}

export function getTotalUnreadCount(deps: QiscusDeps, callback?: IQCallback2<number>): void | Promise<number> {
  return xs
    .combine(process(callback, isOptCallback({ callback })))
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map(() => xs.fromPromise(deps.roomAdapter.getUnreadCount()))
    .compose(flattenConcurrently)
    .compose(toCallbackOrPromise(callback))
}

export function getRoomUnreadCount(deps: QiscusDeps, callback?: IQCallback2<number>): void | Promise<number> {
  return xs
    .combine(process(callback, isOptCallback({ callback })))
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map(() => xs.fromPromise(deps.roomAdapter.getRoomUnreadCount()))
    .compose(flattenConcurrently)
    .compose(toCallbackOrPromise(callback))
}
