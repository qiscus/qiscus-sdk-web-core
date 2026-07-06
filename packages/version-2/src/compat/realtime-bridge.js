import mitt from 'mitt'
import { match, when } from '../lib/match'
import MqttAdapter from '../lib/adapters/mqtt'

/**
 * compat/realtime-bridge.js — Phase 4b (docs/v2-on-core-v3-plan.md §7; Fable
 * review 2026-07-06).
 *
 * The parity-critical parse/emit core of v2's realtime bridge. It REUSES v2's
 * own `MqttAdapter` matcher + parse/emit handlers verbatim (their exact mitt
 * emit shapes are pinned by `phase4.mqtt-characterization.test.js`), but is
 * driven by core-v3's raw `onMessage(topic, payload)` firehose (Phase 4a)
 * instead of v2's own `mqtt` client. Because the handler code is v2's own, the
 * emitted events (`new-message`, `comment-deleted`, `room-cleared`,
 * `room-typing`, `typing` + `isTypingStatus` side effect, `message-delivered`,
 * `message-read`, `presence`, `message:updated`) are byte-for-byte identical to
 * what today's `MqttAdapter` produces.
 *
 * This module is the parse/emit layer ONLY. Wiring the connection +
 * subscribe/publish facade to core-v3's mqtt adapter, and swapping `init()` to
 * construct the bridge instead of `new MqttAdapter(...)`, is the next 4b step.
 */

/**
 * Builds the firehose->v2-parse->emit router.
 *
 * @param {import('../index').default} core - the live `QiscusSDK` instance
 *   (handlers read `core.user_id`/`core.selected` and set `core.isTypingStatus`,
 *   exactly as `MqttAdapter` does).
 * @returns {{ route(topic: string, payload: string): void, on: Function, off: Function, emitter: import('mitt').Emitter }}
 */
export function makeRealtimeParser(core) {
  // `Object.create` gives the prototype's handler methods + `reXxx` regex
  // getters WITHOUT running `MqttAdapter`'s constructor (which opens a real mqtt
  // connection). We set only the instance fields the handlers touch.
  const shell = Object.create(MqttAdapter.prototype)
  shell.emitter = mitt()
  shell.core = core

  // Same matcher wiring (and thus same first-match precedence) as
  // `MqttAdapter`'s constructor, reusing v2's handler methods unchanged.
  shell.matcher = match({
    [when(shell.reNewMessage)]: (topic) => shell.newMessageHandler.bind(shell, topic),
    [when(shell.reNotification)]: (topic) => shell.notificationHandler.bind(shell, topic),
    [when(shell.reTyping)]: (topic) => shell.typingHandler.bind(shell, topic),
    [when(shell.reRoomTyping)]: (topic) => shell.roomTypingHandler.bind(shell, topic),
    [when(shell.reDelivery)]: (topic) => shell.deliveryReceiptHandler.bind(shell, topic),
    [when(shell.reRead)]: (topic) => shell.readReceiptHandler.bind(shell, topic),
    [when(shell.reOnlineStatus)]: (topic) => shell.onlinePresenceHandler.bind(shell, topic),
    [when(shell.reChannelMessage)]: (topic) => shell.channelMessageHandler.bind(shell, topic),
    [when(shell.reMessageUpdated)]: (topic) => shell.messageUpdatedHandler.bind(shell, topic),
    // Catch-all — same as MqttAdapter's `logger('topic not handled', ...)`,
    // which is a no-op unless debug MQTT logging is on.
    [when()]: () => () => {},
  })

  return {
    /**
     * Route one raw firehose message (from core-v3's `onMessage`) through v2's
     * matcher + handlers, emitting the identical v2 mitt event(s).
     */
    route(topic, payload) {
      const func = shell.matcher(topic)
      if (func != null) func(payload)
    },
    on: (...args) => shell.emitter.on(...args),
    off: (...args) => shell.emitter.off(...args),
    emitter: shell.emitter,
  }
}
