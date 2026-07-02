import xs from 'xstream'
import flattenConcurrently from 'xstream/extra/flattenConcurrently'
import { IQCallback1, IQCallback2 } from '../defs'
import * as model from '../v3/model'
import {
  bufferUntil,
  process,
  tap,
  toCallbackOrPromise,
} from '../utils/stream'
import {
  isOptBoolean,
  isOptCallback,
  isOptJson,
  isOptNumber,
  isOptString,
  isReqString,
} from '../utils/param-utils'
import { QiscusDeps } from './types'
import { publishOnlinePresence } from './realtime'

export function setUser(
  deps: QiscusDeps,
  userId: string,
  userKey: string,
  username?: string,
  avatarUrl?: string,
  extras?: object | null,
  callback?: null | IQCallback2<model.IQAccount>
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
        deps.userAdapter.login(userId, userKey, {
          name: username,
          avatarUrl,
          extras,
        } as { name: string; avatarUrl: string; extras: any })
      )
    )
    .compose(flattenConcurrently)
    .compose(
      tap(() => {
        deps.realtimeAdapter.mqtt.conneck()
        deps.realtimeAdapter.mqtt.subscribeUser(deps.storage.getToken())
      })
    )
    .compose(toCallbackOrPromise(callback))
}

export function blockUser(
  deps: QiscusDeps,
  userId: string,
  callback?: IQCallback2<model.IQUser>
) {
  return xs
    .combine(process(userId, isReqString({ userId })), process(callback, isOptCallback({ callback })))
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map(([userId]) => xs.fromPromise(deps.userAdapter.blockUser(userId)))
    .compose(flattenConcurrently)
    .compose(toCallbackOrPromise(callback))
}

export function clearUser(deps: QiscusDeps, callback?: IQCallback1): void | Promise<void> {
  // this method should clear currentUser and token
  return xs
    .combine(process(callback, isOptCallback({ callback })))
    .map(() =>
      xs.fromPromise(
        Promise.all([
          Promise.resolve(publishOnlinePresence(deps, false)),
          Promise.resolve(deps.userAdapter.clear()),
          Promise.resolve(deps.realtimeAdapter.clear()),
        ])
      )
    )
    .compose(flattenConcurrently)
    .map(() => undefined as void)
    .compose(toCallbackOrPromise<void>(callback))
}

export function unblockUser(
  deps: QiscusDeps,
  userId: string,
  callback?: IQCallback2<model.IQUser>
) {
  return xs
    .combine(process(userId, isReqString({ userId })), process(callback, isOptCallback({ callback })))
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map(([userId]) => xs.fromPromise(deps.userAdapter.unblockUser(userId)))
    .compose(flattenConcurrently)
    .compose(toCallbackOrPromise(callback))
}

export function updateUser(
  deps: QiscusDeps,
  username: string,
  avatarUrl: string,
  extras?: object,
  callback?: IQCallback2<model.IQAccount>
) {
  // this method should update current user
  return xs
    .combine(
      process(username, isOptString({ username })),
      process(avatarUrl, isOptString({ avatarUrl })),
      process(extras, isOptJson({ extras })),
      process(callback, isOptCallback({ callback }))
    )
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map(([username, avatarUrl, extras]) =>
      xs.fromPromise(deps.userAdapter.updateUser(username, avatarUrl, extras as any))
    )
    .compose(flattenConcurrently)
    .compose(
      tap((user: model.IQAccount) => {
        const currentUser = deps.storage.getCurrentUser()
        deps.storage.setCurrentUser({
          ...currentUser,
          ...user,
        })
      })
    )
    .compose(toCallbackOrPromise(callback))
}

export function getBlockedUsers(
  deps: QiscusDeps,
  page?: number,
  limit?: number,
  callback?: IQCallback2<model.IQUser[]>
) {
  return xs
    .combine(
      process(page, isOptNumber({ page })),
      process(limit, isOptNumber({ limit })),
      process(callback, isOptCallback({ callback }))
    )
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map(([page, limit]) => xs.fromPromise(deps.userAdapter.getBlockedUser(page, limit)))
    .compose(flattenConcurrently)
    .compose(toCallbackOrPromise(callback))
}

export function getUsers(
  deps: QiscusDeps,
  searchUsername?: string,
  page?: number,
  limit?: number,
  callback?: IQCallback2<model.IQUser[]>
) {
  return xs
    .combine(
      process(searchUsername, isOptString({ searchUsername })),
      process(page, isOptNumber({ page })),
      process(limit, isOptNumber({ limit })),
      process(callback, isOptCallback({ callback }))
    )
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map(([search, page, limit]) => xs.fromPromise(deps.userAdapter.getUserList(search, page, limit)))
    .compose(flattenConcurrently)
    .compose(toCallbackOrPromise(callback))
}

export function getJWTNonce(deps: QiscusDeps, callback?: IQCallback2<string>): void | Promise<string> {
  return xs
    .combine(process(callback, isOptCallback({ callback })))
    .map(() => xs.fromPromise(deps.userAdapter.getNonce()))
    .compose(flattenConcurrently)
    .map((nonce) => nonce)
    .compose(toCallbackOrPromise(callback))
}

export function getUserData(deps: QiscusDeps, callback?: IQCallback2<model.IQAccount>) {
  return xs
    .combine(process(callback, isOptCallback({ callback })))
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map(() => xs.fromPromise(deps.userAdapter.getUserData()))
    .compose(flattenConcurrently)
    .compose(toCallbackOrPromise(callback))
}

export function registerDeviceToken(
  deps: QiscusDeps,
  token: string,
  isDevelopment: boolean,
  callback?: IQCallback2<boolean>
) {
  return xs
    .combine(
      process(token, isReqString({ token })),
      process(isDevelopment, isOptBoolean({ isDevelopment })),
      process(callback, isOptCallback({ callback }))
    )
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map(([token, isDevelopment]) => xs.fromPromise(deps.userAdapter.registerDeviceToken(token, isDevelopment)))
    .compose(flattenConcurrently)
    .compose(toCallbackOrPromise(callback))
}

export function removeDeviceToken(
  deps: QiscusDeps,
  token: string,
  isDevelopment: boolean,
  callback?: IQCallback2<boolean>
) {
  return xs
    .combine(
      process(token, isReqString({ token })),
      process(isDevelopment, isOptBoolean({ isDevelopment })),
      process(callback, isOptCallback({ callback }))
    )
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map(([token, isDevelopment]) => xs.fromPromise(deps.userAdapter.unregisterDeviceToken(token, isDevelopment)))
    .compose(flattenConcurrently)
    .compose(toCallbackOrPromise(callback))
}

export function setUserWithIdentityToken(
  deps: QiscusDeps,
  token: string,
  callback?: IQCallback2<model.IQAccount>
): void | Promise<model.IQAccount> {
  return xs
    .combine(process(token, isReqString({ token })), process(callback, isOptCallback({ callback })))
    .map(([token]) => xs.fromPromise(deps.userAdapter.setUserFromIdentityToken(token)))
    .compose(flattenConcurrently)
    .compose(
      tap(() => {
        deps.realtimeAdapter.mqtt.conneck()
        deps.realtimeAdapter.mqtt.subscribeUser(deps.storage.getToken())
      })
    )
    .compose(toCallbackOrPromise(callback))
}
