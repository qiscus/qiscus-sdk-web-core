import * as Core from '@qiscus/core-v3'
import { makeV2Requester } from './requester'

/**
 * compat/deps.js
 *
 * Builds a core-v3 `QiscusDeps`-shaped bundle (see
 * packages/core-v3/src/usecases/types.ts) wired to v2's own transport
 * (`self.HTTPAdapter`, via `makeV2Requester`) and RAW adapters (raw JSON
 * responses, no `Decoder`/`IQ*` mapping — see docs/v2-on-core-v3-plan.md §3,
 * §4). `self` is the live `QiscusSDK` instance; this is a best-effort spike
 * (Phase 0) — it is NOT wired into `QiscusSDK`'s behavior yet.
 *
 * `storage` getters/setters are seeded once here from `self`'s config
 * fields. The MUTABLE ones that a few methods read as VALUES (not just headers)
 * — `token` (updateMessage body) and `currentUser` (updateUser id) — are
 * re-synced live on every access by the `deps` getter in `../index.js`, so a
 * post-init token refresh or re-login is reflected without rebuilding `deps`.
 * (mqttURL liveness is moot: v2 realtime uses its own `MqttAdapter`, not this
 * bundle.)
 *
 * @param {import('../index').default} self
 * @returns {Core.QiscusDeps}
 */
export function makeDeps(self) {
  const storage = Core.storageFactory()

  storage.setBaseUrl(self.baseURL)
  storage.setAppId(self.AppId)
  storage.setBrokerUrl(self.mqttURL)
  if (typeof storage.setCustomHeaders === 'function') {
    storage.setCustomHeaders(self._customHeader || {})
  }
  if (self.user_id != null && typeof storage.setCurrentUser === 'function') {
    storage.setCurrentUser(self.userData)
  }
  if (self.HTTPAdapter && self.HTTPAdapter.token != null) {
    storage.setToken(self.HTTPAdapter.token)
  }

  const apiAdapter = makeV2Requester(self.HTTPAdapter)

  const userAdapter = Core.getUserAdapterRaw(storage, apiAdapter)
  const roomAdapter = Core.getRoomAdapterRaw(storage, apiAdapter)
  const messageAdapter = Core.getMessageAdapterRaw(storage, apiAdapter)
  const loggerAdapter = Core.getLogger(storage)

  return {
    storage,
    apiAdapter,
    hookAdapter: self._hookAdapter,
    userAdapter,
    // TODO Phase 4b: realtime is out of scope for this Phase 0 spike (the
    // decoded `getRealtimeAdapter` doesn't match the raw-passthrough model
    // v2 needs — see docs/v2-on-core-v3-plan.md §7 "realtime raw" split,
    // which is deferred to Phase 4a/4b). Omitted here on purpose.
    loggerAdapter,
    roomAdapter,
    messageAdapter,
  }
}
