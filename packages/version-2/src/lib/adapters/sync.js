import mitt from 'mitt'
import { getSyncAdapter as CoreGetSyncAdapter, storageFactory } from '@qiscus/core-v3'

/**
 * Sync-loop unification (docs/v2-full-shell-plan.md "Sync poll loop"): v2's
 * `SyncAdapter` used to own its own HTTP-poll generators
 * (`synchronizeFactory`/`synchronizeEventFactory`, deleted here). Now it
 * DELEGATES the poll loop + gating entirely to core-v3's `getSyncAdapter`
 * (`@qiscus/core-v3`), which already owns: the interval producer, the
 * MQTT-connected/disconnected interval switch, the enable/force-disable
 * gates, and the sync/sync_event HTTP calls. This facade's only job is to
 * (a) build a storage facade that maps core-v3's gate/interval getters onto
 * v2's live option getters, and (b) re-shape core-v3's RAW firehose
 * (`onRawMessages`/`onRawEvents`/`onSynchronized`) back into v2's exact mitt
 * event names/payloads/ordering/guards, so `index.js`'s `.on(...)` handlers
 * (unchanged) keep observing the same behavior as before.
 *
 * Public interface (`on`/`off`/`interval`/`enabled`/`synchronize`/
 * `synchronizeEvent`) and every emitted event shape are preserved
 * byte-for-byte; see `compat/sync-delegation.test.js`.
 */
export default function SyncAdapter(
  getDeps,
  {
    syncInterval,
    getShouldSync,
    syncOnConnect,
    lastCommentId,
    statusLogin,
    enableSync,
    enableSyncEvent,
    isMqttConnected,
    // Test seam: inject a fake `getSyncAdapter` so the facade (guard/order/
    // event-shape behavior) can be characterized without a real HTTP poll
    // loop. Defaults to core-v3's real `getSyncAdapter`.
    _getSyncAdapter,
  }
) {
  const emitter = mitt()

  // v2-local guard vars, INDEPENDENT of core-v3's own storage cursor: core-v3
  // advances its storage cursor on its DECODED emit, which fires BEFORE the
  // raw firehose used below — so the storage cursor can't be reused as v2's
  // "already emitted?" guard. Keep dedicated guard vars instead.
  let emittedMsgId = -1
  // `emittedEventId` backs the storage facade's getLastEventId/setLastEventId
  // (core-v3's OWN cursor, which it reads to compute the next poll's id and
  // writes via its DECODED 'last-event-id.new' handler — BEFORE the raw
  // firehose fires). `lastEmittedEventId` is a SEPARATE var used only for
  // v2's own "already emitted?" guard below: if it shared `emittedEventId`,
  // core's decoded handler would advance it to the new id first, making the
  // raw-firehose guard compare the id to itself (always false) and v2 would
  // never emit. Keep them distinct.
  let emittedEventId = 0
  let lastEmittedEventId = 0

  const storage = storageFactory()

  // Auth gate: v2's login status. The id value itself is irrelevant to
  // core-v3's sync adapter (only null vs non-null matters for `shouldSync`).
  storage.getCurrentUser = () => (statusLogin() ? { id: 'v2' } : null)

  // `getShouldSync` already ANDs in `_forceEnableSync && isLogin &&
  // !realtimeAdapter.connected` — mapping its negation onto
  // `getForceDisableSync` reproduces v2's exact "should we sync at all"
  // decision as the SINGLE source of the gate. Do NOT also pass
  // `syncOnlyWhenDisconnected` to `getSyncAdapter` below — that would
  // double-apply the mqtt-disconnected condition already folded into
  // `getShouldSync`.
  storage.getForceDisableSync = () => getShouldSync() !== true
  storage.getIsSyncEnabled = () => enableSync()
  storage.getIsSyncEventEnabled = () => enableSyncEvent()

  storage.getSyncInterval = () => syncInterval()
  storage.getSyncIntervalWhenConnected = () => syncOnConnect()

  // Message poll cursor = v2's live `last_received_comment_id`; core-v3's
  // `setLastMessageId` is a no-op here because `index.js`'s
  // `last-message-id.new` handler owns that field (assigns it back onto
  // `this.last_received_comment_id`).
  storage.getLastMessageId = () => lastCommentId()
  storage.setLastMessageId = () => {}

  // Event cursor is v2-owned here (no equivalent live field on the shell).
  storage.getLastEventId = () => emittedEventId
  storage.setLastEventId = (id) => {
    emittedEventId = id
  }

  const core = (_getSyncAdapter || CoreGetSyncAdapter)({
    s: storage,
    api: getDeps().apiAdapter,
    isMqttConnected,
    logger: () => {},
  })

  core.onRawMessages(({ lastMessageId, comments }) => {
    if (lastMessageId > emittedMsgId) {
      comments
        .slice()
        .sort((a, b) => a.id - b.id)
        .forEach((c) => emitter.emit('message.new', c))
      emitter.emit('last-message-id.new', lastMessageId)
      emittedMsgId = lastMessageId
    }
  })

  core.onSynchronized(() => emitter.emit('synchronize', Date.now()))

  core.onRawEvents(({ lastId, delivered, read, deleted, cleared }) => {
    if (lastId > lastEmittedEventId) {
      emitter.emit('last-event-id.new', lastId)
      delivered.forEach((it) => emitter.emit('message.delivered', it))
      deleted.forEach((it) => emitter.emit('message.deleted', it))
      read.forEach((it) => emitter.emit('message.read', it))
      cleared.forEach((it) => emitter.emit('room.cleared', it))
      lastEmittedEventId = lastId
    }
  })

  return {
    get on() {
      return emitter.on
    },
    get off() {
      return emitter.off
    },
    get interval() {
      if (statusLogin()) {
        if (getShouldSync()) return syncInterval()
        return syncOnConnect()
      }
      return 0
    },
    get enabled() {
      return enableSync()
    },
    async synchronize() {
      core.synchronize(lastCommentId())
    },
    async synchronizeEvent() {
      core.synchronizeEvent(lastEmittedEventId)
    },
  }
}
