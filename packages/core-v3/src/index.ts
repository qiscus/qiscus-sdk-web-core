import xs from 'xstream'
import { toCallbackOrPromise } from './utils/stream'
import type { IQCallback2 } from './defs'
import type { QiscusDeps } from './usecases/types'

// Factories
export { storageFactory } from './storage'
export { makeApiRequest } from './api'
export { hookAdapterFactory, Hooks } from './hook'
export { default as getUserAdapter } from './adapters/user'
export { default as getRealtimeAdapter } from './adapters/realtime'
export { getLogger } from './adapters/logger'
export { getRoomAdapter } from './adapters/room'
export { getMessageAdapter } from './adapters/message'

// Model types
export type { IQUser, IQAccount, IQParticipant, IQMessage, IQChatRoom } from './v3/model'

// Callback / subscription types from defs
export type { IQCallback1, IQCallback2, IQProgressListener, Subscription, Callback } from './defs'

// QiscusDeps contract
export type { QiscusDeps } from './usecases/types'

// Usecases
export * from './usecases/setup'
export * from './usecases/user'
export * from './usecases/room'
export * from './usecases/message'
export * from './usecases/realtime'
export * from './usecases/message-factory'

// hasSetupUser — simple state-read helper that doesn't belong to any sub-domain
export function hasSetupUser(deps: QiscusDeps, callback?: IQCallback2<boolean>): void | Promise<boolean> {
  return xs
    .of(deps.storage.getCurrentUser())
    .map((user) => user != null)
    .compose(toCallbackOrPromise(callback))
}
