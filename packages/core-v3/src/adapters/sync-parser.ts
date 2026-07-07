/**
 * Shared sync-event classifier — the single source of truth for parsing the
 * `api/v2/sdk/sync_event` response (Fable review 2026-07-06, step 5). Sync is
 * HTTP-poll (a list of events with `action_topic` + `payload.data`), NOT
 * topic-based, so it has its own classifier distinct from `parseRealtimeEvent`
 * — but the same principle: the classification (filter by `action_topic`,
 * extract `payload.data`, compute `lastId`) lives ONCE here, and each shell
 * shapes the buckets its own way (v2 emits `payload.data` raw; v3 runs
 * `Decoder` + its own fan-out). A new sync event type is added once, here.
 *
 * Fixes a latent divergence: v2 filtered `action_topic === 'delete_message'`
 * while core-v3's sync-event-factory filtered `'deleted_message'` — so one
 * shell missed sync-path deletes depending on which string the backend sends.
 * This classifier accepts BOTH, so both shells are consistent.
 */

// `Id` is generic because v2's sync event ids are numbers while core-v3's are
// strings (`IQAccount['lastSyncEventId']`); both shells share this classifier.
export interface SyncEvent<Id = number> {
  id: Id
  action_topic: string
  payload: { data: any }
  [k: string]: any
}

export interface ClassifiedSyncEvents<Id = number> {
  /** Max event id in the batch (undefined for an empty batch). */
  lastId: Id | undefined
  /** `payload.data` of each `delivered` event (raw; shell decides shaping). */
  messageDelivered: any[]
  /** `payload.data` of each `read` event. */
  messageRead: any[]
  /** `payload.data` of each `delete_message`/`deleted_message` event. */
  messageDeleted: any[]
  /** `payload.data` of each `clear_room` event. */
  roomCleared: any[]
}

export function classifySyncEvents<Id = number>(events: SyncEvent<Id>[]): ClassifiedSyncEvents<Id> {
  const lastId = events
    .map((it) => it.id)
    .sort((a, b) => (a as any) - (b as any))
    .pop()

  const dataFor = (topics: string[]): any[] =>
    events.filter((it) => topics.includes(it.action_topic)).map((it) => it.payload.data)

  return {
    lastId,
    messageDelivered: dataFor(['delivered']),
    messageRead: dataFor(['read']),
    // accept both spellings — the v2/v3 divergence this classifier resolves
    messageDeleted: dataFor(['delete_message', 'deleted_message']),
    roomCleared: dataFor(['clear_room']),
  }
}
