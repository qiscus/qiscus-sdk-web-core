import xs from 'xstream'
import { toCallbackOrPromise } from './utils/stream'
import type { IQCallback2 } from './defs'
import type { QiscusDeps } from './usecases/types'

// Factories
export { storageFactory } from './storage'
export { makeApiRequest } from './api'
// P5 (docs/v2-full-shell-plan.md): re-export the `Api` request-descriptor
// namespace and the `Provider` header/baseUrl/credentials helpers so v2 can
// build descriptors for edge/deprecated endpoints via `deps.apiAdapter.request(...)`
// without needing bespoke raw-adapter methods for every rarely-used call.
export * as Api from './api'
export * as Provider from './provider'
export { hookAdapterFactory, Hooks } from './hook'
export { default as getUserAdapter } from './adapters/user'
export { default as getRealtimeAdapter } from './adapters/realtime'
export { getLogger } from './adapters/logger'
export { getRoomAdapter } from './adapters/room'
export { getMessageAdapter } from './adapters/message'
export { default as getUserAdapterRaw } from './adapters/user.raw'
export { getRoomAdapterRaw } from './adapters/room.raw'
export { getMessageAdapterRaw } from './adapters/message.raw'
export { getUploadAdapter } from './adapters/upload'
export type { UploadResponse, UploadProgress, UploadAdapter } from './adapters/upload'
// P3c (docs/v2-full-shell-plan.md): re-export core-v3's mqtt adapter so v2's
// `MqttAdapter` facade (packages/version-2/src/lib/adapters/mqtt.js) can
// delegate its connection + topic + buffering logic to it instead of owning
// a parallel implementation.
export { default as getMqttAdapter } from './adapters/mqtt'
export type { MqttAdapter } from './adapters/mqtt'
export { parseRealtimeEvent } from './adapters/realtime-parser'
export type { CanonicalEvent, DeletedMessage } from './adapters/realtime-parser'
export { classifySyncEvents } from './adapters/sync-parser'
export type { SyncEvent, ClassifiedSyncEvents } from './adapters/sync-parser'

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
