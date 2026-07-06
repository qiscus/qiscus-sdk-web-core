import mitt from 'mitt'
import { parseRealtimeEvent } from '@qiscus/core-v3'

/**
 * compat/realtime-bridge.js — Phase 4b (docs/v2-on-core-v3-plan.md §7; Fable
 * review 2026-07-06, single-source architecture).
 *
 * v2's per-shell realtime adapter. The topic-matching + payload deserialization
 * now live ONCE in core-v3's `parseRealtimeEvent` (shared source); this module
 * is the thin v2 half that maps a `CanonicalEvent` onto v2's exact raw mitt
 * emit shapes (pinned by `phase4.mqtt-characterization.test.js`). It replaces
 * the earlier stepping-stone that reused v2's own `MqttAdapter` handlers — that
 * kept parsing in v2 (two places); this keeps only the v2-specific OUTPUT
 * shaping here, so a new realtime feature is added once in the shared parser and
 * surfaced via this adapter.
 *
 * Driven by core-v3's raw `onMessage(topic, payload)` firehose. Connection +
 * subscribe/publish facade + `init()` wiring are the next 4b step.
 */

/**
 * Maps one `CanonicalEvent` to v2's mitt emit(s), reproducing `MqttAdapter`'s
 * handlers byte-for-byte (incl. the `typing` self-filter + `isTypingStatus`
 * side effect). `core` is the live `QiscusSDK` instance.
 */
export function adaptCanonicalToV2(event, emit, core) {
  switch (event.kind) {
    // v2 emits `new-message` (raw) for BOTH direct and channel messages.
    case 'message':
    case 'channel-message':
      emit('new-message', event.rawComment)
      return

    // v2 branches on key presence (NOT action_topic): one emit per deleted
    // message (array uniqueIds, string room_id) and one per deleted room
    // (full room object).
    case 'notification':
      event.deletedMessages.forEach((m) =>
        emit('comment-deleted', {
          roomId: m.room_id,
          commentUniqueIds: m.message_unique_ids,
          isForEveryone: true,
          isHard: true,
        })
      )
      event.deletedRooms.forEach((room) => emit('room-cleared', room))
      return

    case 'typing': {
      // self-typing is filtered out
      if (event.userId === core.user_id) return
      emit('typing', { message: event.payload, userId: event.userId, roomId: event.roomId })
      // isTypingStatus side effect (unchanged from MqttAdapter.typingHandler)
      if (core.selected == null) return
      if (event.payload === '1' && event.roomId === core.selected.id) {
        const actor = core.selected.participants.find((it) => it.email === event.userId)
        if (actor == null) return
        core.isTypingStatus = `${actor.username} is typing ...`
      } else {
        core.isTypingStatus = null
      }
      return
    }

    case 'room-typing':
      emit('room-typing', { ...event.parsed, room_id: event.roomId })
      return

    case 'delivered':
      emit('message-delivered', {
        commentId: Number(event.messageId),
        commentUniqueId: event.messageUniqueId,
        userId: event.userId,
      })
      return

    case 'read':
      emit('message-read', {
        commentId: Number(event.messageId),
        commentUniqueId: event.messageUniqueId,
        userId: event.userId,
      })
      return

    case 'presence':
      emit('presence', { message: event.payload, userId: event.userId })
      return

    case 'message-updated':
      emit('message:updated', event.rawComment)
      return

    case 'custom-event':
      // Custom events flow through the single source too: emit on the adapter's
      // emitter so `custom-event.js` subscribes here (`mqttAdapter.on`) instead
      // of tapping the raw mqtt client directly (which also lost its listener on
      // reconnect via `removeAllListeners`). `payload` is already parsed.
      emit('custom-event', { roomId: event.roomId, payload: event.payload })
      return

    default:
      return
  }
}

/**
 * Builds the firehose->shared-parse->v2-adapt router.
 *
 * @param {import('../index').default} core - the live `QiscusSDK` instance.
 * @returns {{ route(topic: string, payload: string): void, on: Function, off: Function, emitter: import('mitt').Emitter }}
 */
export function makeRealtimeParser(core) {
  const emitter = mitt()
  const emit = (...args) => emitter.emit(...args)
  return {
    /**
     * Route one raw firehose message (from core-v3's `onMessage`) through the
     * shared parser + v2 adapter, emitting the identical v2 mitt event(s).
     * A malformed JSON payload throws out of `parseRealtimeEvent`, same as v2's
     * un-try/caught `JSON.parse` in `MqttAdapter` today.
     */
    route(topic, payload) {
      const event = parseRealtimeEvent(topic, payload)
      if (event != null) adaptCanonicalToV2(event, emit, core)
    },
    on: (...args) => emitter.on(...args),
    off: (...args) => emitter.off(...args),
    emitter,
  }
}
