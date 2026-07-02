import axios, { AxiosResponse } from 'axios'
import xs from 'xstream'
import flattenConcurrently from 'xstream/extra/flattenConcurrently'
import { IQCallback1, IQCallback2, IQProgressListener, UploadResult } from '../defs'
import { Hooks } from '../hook'
import * as model from '../v3/model'
import * as Provider from '../provider'
import {
  bufferUntil,
  process,
  toCallbackOrPromise,
} from '../utils/stream'
import {
  isOptArrayString,
  isOptCallback,
  isOptNumber,
  isOptString,
  isReqArrayNumber,
  isReqArrayString,
  isReqJson,
  isReqNumber,
  isReqString,
} from '../utils/param-utils'
import { QiscusDeps } from './types'
import { generateFileAttachmentMessage } from './message-factory'

export function updateMessage(deps: QiscusDeps, message: model.IQMessage, callback?: IQCallback1) {
  return xs
    .combine(process(message, isReqJson({ message })), process(callback, isOptCallback({ callback })))
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map(([message]) => xs.fromPromise(deps.messageAdapter.updateMessage(message)))
    .compose(flattenConcurrently)
    .mapTo(undefined as void)
    .compose(toCallbackOrPromise<void>(callback))
}

export function sendMessage(deps: QiscusDeps, message: model.IQMessage, callback?: IQCallback2<model.IQMessage>) {
  const roomId = message.chatRoomId
  return xs
    .combine(
      process(roomId, isReqNumber({ roomId })),
      process(message, isReqJson({ message })),
      process(callback, isOptCallback({ callback }))
    )
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map(([roomId, message]) =>
      xs.fromPromise(
        Promise.all([roomId, deps.hookAdapter.trigger(Hooks.MESSAGE_BEFORE_SENT, message) as Promise<typeof message>])
      )
    )
    .compose(flattenConcurrently)
    .map(([roomId, message]) => xs.fromPromise(deps.messageAdapter.sendMessage(roomId, message)))
    .compose(flattenConcurrently)
    .compose(toCallbackOrPromise(callback))
}

export function markAsDelivered(
  deps: QiscusDeps,
  roomId: number,
  messageId: number,
  callback?: IQCallback2<void>
): void | Promise<void> {
  return xs
    .combine(
      process(roomId, isReqNumber({ roomId })),
      process(messageId, isReqNumber({ messageId })),
      process(callback, isOptCallback({ callback }))
    )
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map(([roomId, messageId]) => xs.fromPromise(deps.messageAdapter.markAsDelivered(roomId, messageId)))
    .compose(flattenConcurrently)
    .compose(toCallbackOrPromise(callback))
}

export function markAsRead(
  deps: QiscusDeps,
  roomId: number,
  messageId: number,
  callback?: IQCallback2<void>
): void | Promise<void> {
  return xs
    .combine(
      process(roomId, isReqNumber({ roomId })),
      process(messageId, isReqNumber({ messageId })),
      process(callback, isOptCallback({ callback }))
    )
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map(([roomId, messageId]) => xs.fromPromise(deps.messageAdapter.markAsRead(roomId, messageId)))
    .compose(flattenConcurrently)
    .compose(toCallbackOrPromise(callback))
}

export function deleteMessages(
  deps: QiscusDeps,
  messageUniqueIds: string[],
  callback?: IQCallback2<model.IQMessage[]>
) {
  return xs
    .combine(
      process(messageUniqueIds, isReqArrayString({ messageUniqueIds })),
      process(callback, isOptCallback({ callback }))
    )
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map(([messageUniqueIds]) => xs.fromPromise(deps.messageAdapter.deleteMessage(messageUniqueIds)))
    .compose(flattenConcurrently)
    .compose(toCallbackOrPromise(callback))
}

export function getPreviousMessagesById(
  deps: QiscusDeps,
  roomId: number,
  limit?: number,
  messageId?: number,
  callback?: IQCallback2<model.IQMessage[]>
) {
  return xs
    .combine(
      process(roomId, isReqNumber({ roomId })),
      process(limit, isOptNumber({ limit })),
      process(messageId, isOptNumber({ messageId })),
      process(callback, isOptCallback({ callback }))
    )
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map(([roomId, limit, messageId]) =>
      xs.fromPromise(deps.messageAdapter.getMessages(roomId, messageId, limit, false))
    )
    .compose(flattenConcurrently)
    .compose(toCallbackOrPromise(callback))
}

export function getNextMessagesById(
  deps: QiscusDeps,
  roomId: number,
  limit?: number,
  messageId?: number,
  callback?: IQCallback2<model.IQMessage[]>
): void | Promise<model.IQMessage[]> {
  return xs
    .combine(
      process(roomId, isReqNumber({ roomId })),
      process(limit, isOptNumber({ limit })),
      process(messageId, isOptNumber({ messageId })),
      process(callback, isOptCallback({ callback }))
    )
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map(([roomId, limit, messageId]) =>
      xs.fromPromise(deps.messageAdapter.getMessages(roomId, messageId, limit, true))
    )
    .compose(flattenConcurrently)
    .compose(toCallbackOrPromise(callback))
}

export function searchMessage(
  deps: QiscusDeps,
  {
    query,
    roomIds = [],
    userId,
    type,
    roomType,
    page,
    limit,
    callback,
  }: {
    query: string
    roomIds: number[]
    userId?: string
    type?: string
    roomType?: string
    page?: number
    limit?: number
    callback?: (messages?: model.IQMessage[], error?: Error) => void
  }
) {
  return xs
    .combine(
      process(query, isReqString({ query })),
      process(
        roomIds,
        isReqArrayString({
          roomIds,
        })
      ),
      process(userId, isOptString({ userId })),
      process(type, isOptString({ type })),
      process(roomType, isOptString({ roomType })),
      process(page, isOptNumber({ page })),
      process(limit, isOptNumber({ limit })),
      process(callback, isOptCallback({ callback }))
    )
    .map(([query, roomIds, userId, type, roomType, page, limit]) => {
      return xs.fromPromise(
        deps.messageAdapter.searchMessages({
          query,
          roomIds,
          userId,
          type,
          roomType,
          page,
          limit,
        })
      )
    })
    .compose(flattenConcurrently)
    .compose(toCallbackOrPromise(callback))
}

export function getFileList(
  deps: QiscusDeps,
  {
    roomIds = [],
    fileType,
    page,
    limit,
    userId,
    includeExtensions,
    excludeExtensions,
    callback,
  }: {
    roomIds?: number[]
    fileType?: string
    page?: number
    limit?: number
    userId?: string
    includeExtensions?: string[]
    excludeExtensions?: string[]
    callback?: (messages?: model.IQMessage[], error?: Error) => void
  }
): void | Promise<model.IQMessage[]> {
  return xs
    .combine(
      process(roomIds, isReqArrayNumber({ roomIds })),
      process(
        fileType,
        isOptString({
          fileType,
        })
      ),
      process(page, isOptNumber({ page })),
      process(limit, isOptNumber({ limit })),
      process(userId, isOptString({ userId })),
      process(includeExtensions, isOptArrayString({ includeExtensions })),
      process(excludeExtensions, isOptArrayString({ excludeExtensions })),
      process(callback, isOptCallback({ callback }))
    )
    .map(([roomIds, fileType, page, limit, userId, includeExtensions, excludeExtensions]) => {
      return xs.fromPromise(
        deps.messageAdapter.getFileList({
          roomIds,
          fileType,
          page,
          limit,
          userId,
          includeExtensions,
          excludeExtensions,
        })
      )
    })
    .compose(flattenConcurrently)
    .compose(toCallbackOrPromise(callback))
}

export function upload(deps: QiscusDeps, file: File, callback?: IQProgressListener): void {
  const data = new FormData()
  data.append('file', file)
  data.append('token', deps.storage.getToken())

  axios({
    ...Provider.withHeaders(deps.storage),
    baseURL: deps.storage.getBaseUrl(),
    url: deps.storage.getUploadUrl(),
    method: 'post',
    data: data,
    onUploadProgress(event) {
      const loaded = event.loaded
      const total = event.total ?? file.size
      const percentage = ((loaded / total) * 100).toFixed(2)
      callback?.(undefined, Number(percentage))
    },
  })
    .then((resp: AxiosResponse<UploadResult>) => {
      const url = resp.data.results.file.url
      callback?.(undefined, undefined, url)
    })
    .catch((error) => callback?.(error))
}

export function sendFileMessage(
  deps: QiscusDeps,
  message: model.IQMessage,
  file: File,
  callback?: IQProgressListener<model.IQMessage>
): void {
  upload(deps, file, (error, progress, url) => {
    if (error) return callback?.(error)
    if (progress) callback?.(undefined, progress)
    if (url) {
      const _message = generateFileAttachmentMessage(deps, {
        roomId: message.chatRoomId,
        caption: message.payload?.['caption'] as string,
        url,
        text: message.text,
        extras: message.extras ?? {},
        filename: file.name,
        size: file.size,
      })

      sendMessage(deps, _message, (msg) => {
        callback?.(undefined, undefined, msg)
      })
    }
  })
}

export function getThumbnailURL(url: string) {
  return url.replace('/upload/', '/upload/w_30,c_scale/')
}
