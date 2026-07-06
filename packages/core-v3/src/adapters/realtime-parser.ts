/**
 * Shared realtime event parser — the single source of truth for MQTT topic
 * classification + payload deserialization + topic-field capture (Fable review
 * 2026-07-06, docs/v2-on-core-v3-plan.md §7).
 *
 * v2 and v3 agree on WHAT bytes arrived and how to split them (topic
 * classification, `JSON.parse`/`split(':')`, which topic segments hold the
 * ids); they disagree ONLY on the final output object handed to the app. So
 * this function stops exactly before that divergence: it returns a
 * `CanonicalEvent` carrying the DESERIALIZED payload + topic captures as RAW
 * STRINGS (no numeric coercion) + the raw payload string retained where a shell
 * needs it (presence). Each shell then adapts a `CanonicalEvent` to its own
 * shape — v2 to its raw mitt events, v3 through `Decoder` to `IQ*` — so a new
 * realtime feature is added ONCE here (one classify clause + one parse branch)
 * and both shells surface it via their thin adapters.
 *
 * Matcher note (highest-care item): topics ending in `/c` are classified by
 * SEGMENT COUNT (`x/c` = direct message, `x/y/c` = channel message), NOT by
 * copying either shell's `/c` regex — v2's `/^(.+)\/c$/` is greedy (swallows
 * `a/b/c`, making its channel handler dead code) while v3's `/^([\w]+)\/c/`
 * won't match a slash. Both shells emit their "new message" event for either
 * form today, so the segment split preserves both while giving a clean seam.
 */

export type DeletedMessage = {
  room_id: string
  message_unique_ids: string[]
  [k: string]: any
}

export type CanonicalEvent =
  // `{token}/c`
  | { kind: 'message'; rawComment: any }
  // `{appId}/{uniqueId}/c`
  | { kind: 'channel-message'; rawComment: any; channelUniqueId: string }
  // `{token}/n`
  | { kind: 'notification'; actionTopic?: string; deletedMessages: DeletedMessage[]; deletedRooms: any[] }
  // `r/{roomId}/{roomId}/{userId}/t`
  | { kind: 'typing'; roomId: string; userId: string; payload: string }
  // `r/{roomId}/typing`
  | { kind: 'room-typing'; roomId: string; parsed: any }
  // `r/{roomId}/{roomId}/{userId}/d`
  | { kind: 'delivered'; roomId: string; userId: string; messageId: string; messageUniqueId: string }
  // `r/{roomId}/{roomId}/{userId}/r`
  | { kind: 'read'; roomId: string; userId: string; messageId: string; messageUniqueId: string }
  // `u/{userId}/s`
  | { kind: 'presence'; userId: string; payload: string }
  // `{token}/update`
  | { kind: 'message-updated'; rawComment: any }
  // `r/{roomId}/{roomId}/e`
  | { kind: 'custom-event'; roomId: string; payload: any }

/**
 * Classify + deserialize one inbound MQTT message into a `CanonicalEvent`, or
 * `null` for a topic no shell handles. Throws only if a JSON payload for a
 * message-shaped topic is malformed — same failure surface v2's handlers have
 * today (they call `JSON.parse` with no catch); each shell's adapter decides
 * whether to wrap it (v3 does `tryCatch`).
 */
export function parseRealtimeEvent(topic: string, payload: string): CanonicalEvent | null {
  const seg = topic.split('/')
  const last = seg[seg.length - 1]

  // region room-scoped (`r/...`)
  if (seg[0] === 'r') {
    // r/{roomId}/typing  — v2-only route today; part of the single source now
    if (seg.length === 3 && last === 'typing') {
      return { kind: 'room-typing', roomId: seg[1], parsed: JSON.parse(payload) }
    }
    // r/{roomId}/{roomId}/e  — custom event
    if (seg.length === 4 && last === 'e') {
      return { kind: 'custom-event', roomId: seg[1], payload: JSON.parse(payload) }
    }
    // r/{roomId}/{roomId}/{userId}/{t|d|r}  — userId may contain '/', so it is
    // everything between the 3rd segment and the trailing suffix (matches v2's
    // `.+` / v3's `[\S]+` userId capture).
    if (seg.length >= 5 && (last === 't' || last === 'd' || last === 'r')) {
      const roomId = seg[1]
      const userId = seg.slice(3, -1).join('/')
      if (last === 't') return { kind: 'typing', roomId, userId, payload }
      const parts = payload.split(':')
      const messageId = parts[0]
      const messageUniqueId = parts[1]
      return last === 'd'
        ? { kind: 'delivered', roomId, userId, messageId, messageUniqueId }
        : { kind: 'read', roomId, userId, messageId, messageUniqueId }
    }
    return null
  }
  // endregion

  // u/{userId}/s  — presence (raw payload retained for v2's `"1:ts"` string)
  if (seg[0] === 'u' && seg.length === 3 && last === 's') {
    return { kind: 'presence', userId: seg[1], payload }
  }

  // {token}/n  — notification (expose the delete arrays + action_topic intact)
  if (seg.length === 2 && last === 'n') {
    const parsed = JSON.parse(payload)
    const data = parsed?.payload?.data ?? {}
    return {
      kind: 'notification',
      actionTopic: parsed?.action_topic,
      deletedMessages: data.deleted_messages ?? [],
      deletedRooms: data.deleted_rooms ?? [],
    }
  }

  // {token}/update  — edited message
  if (seg.length === 2 && last === 'update') {
    return { kind: 'message-updated', rawComment: JSON.parse(payload) }
  }

  // .../c  — message (2 segments = direct, >2 = channel)
  if (last === 'c') {
    const rawComment = JSON.parse(payload)
    if (seg.length === 2) return { kind: 'message', rawComment }
    return { kind: 'channel-message', rawComment, channelUniqueId: seg[1] }
  }

  return null
}
