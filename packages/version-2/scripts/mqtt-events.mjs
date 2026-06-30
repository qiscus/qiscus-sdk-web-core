/**
 * scripts/mqtt-events.mjs
 *
 * Shared, dependency-free event catalog for the MQTT broker test harness.
 * Imported by both scripts/mqtt-broker-test.mjs (Node) and
 * scripts/mqtt-broker-test.html (browser). No imports — works in any ESM
 * environment without a build step.
 */

// ─── Regexes ──────────────────────────────────────────────────────────────────
//
// Copied verbatim from src/lib/adapters/mqtt.js re* getters (lines 280-306).
// Do not edit these without updating the SDK source too.
//
// OVERLAP NOTE on /c topics:
//   RE.newMessage     (^(.+)/c$)       matches BOTH `token/c` AND `appId/channelId/c`.
//   RE.channelMessage (^(.+)/(.+)/c$)  matches ONLY 2-segment-prefix/c.
//   Each event is assigned its OWN matchRegex so the overlap is exercised,
//   not hidden — this mirrors the SDK constructor's intent.

export const RE = {
  // L280 — user-channel new message; also broadly matches any single-segment/c
  newMessage:     /^(.+)\/c$/i,
  // L282 — notification / comment-deleted
  notification:   /^(.+)\/n$/i,
  // L286 — per-user typing signal inside a room
  typing:         /^r\/([\d]+)\/([\d]+)\/(.+)\/t$/i,
  // L289 — room-level typing (newer roomTyping event)
  roomTyping:     /^r\/(.+)\/typing$/i,
  // L292 — delivery receipt
  delivery:       /^r\/([\d]+)\/([\d]+)\/(.+)\/d$/i,
  // L295 — read receipt
  read:           /^r\/([\d]+)\/([\d]+)\/(.+)\/r$/i,
  // L298 — user online-presence
  onlineStatus:   /^u\/(.+)\/s$/i,
  // L301 — channel new-message (two-segment prefix before /c — MORE specific than newMessage)
  channelMessage: /^(.+)\/(.+)\/c$/i,
  // L304 — message updated
  messageUpdated: /^(.+)\/update$/i,
}

export const EVENT_COUNT = 9

/**
 * Build the 9-entry event catalog for the given SDK configuration identifiers.
 *
 * Topics and payloads mirror the SDK's real subscribe* / publish* helpers:
 *   subscribeUserChannel  → L483-486 in mqtt.js
 *   subscribeRoom         → L457-463 in mqtt.js
 *   subscribeUserPresence → L516-517 in mqtt.js
 *   subscribeChannel      → L453-454 in mqtt.js
 *   publishPresence       → L505-509 in mqtt.js
 *   publishTyping         → L532-536 in mqtt.js
 *
 * @param {{ appId: string, userId: string, partnerId: string, userToken: string, roomId: string, channelUniqueId: string }} ids
 * @returns {Array<{ name: string, publishTopic: string, payload: string, subscribeTopic: string, matchRegex: RegExp, retain: boolean }>}
 */
export function buildCatalog({ appId, userId, partnerId, userToken, roomId, channelUniqueId }) {
  return [
    {
      // SDK: subscribeUserChannel → `${token}/c`  (L484); handler: newMessageHandler (L311)
      name:           'new-message',
      publishTopic:   `${userToken}/c`,
      payload:        JSON.stringify({ id: 1, message: 'hello', unique_id: 'msg-001' }),
      subscribeTopic: `${userToken}/c`,
      matchRegex:     RE.newMessage,
      retain:         false,
    },
    {
      // SDK: subscribeUserChannel → `${token}/n`  (L485); handler: notificationHandler (L317)
      name:           'notification (comment-deleted)',
      publishTopic:   `${userToken}/n`,
      payload:        JSON.stringify({
        payload: {
          data: {
            deleted_messages: [{ room_id: roomId, message_unique_ids: ['msg-001'] }],
          },
        },
      }),
      subscribeTopic: `${userToken}/n`,
      matchRegex:     RE.notification,
      retain:         false,
    },
    {
      // SDK: subscribeRoom → `r/${roomId}/${roomId}/+/t`  (L461);  handler: typingHandler (L370)
      // publishTyping publishes to `r/${roomId}/${roomId}/${userId}/t`  (L536)
      name:           'typing',
      publishTopic:   `r/${roomId}/${roomId}/${partnerId}/t`,
      payload:        '1',
      subscribeTopic: `r/${roomId}/${roomId}/+/t`,
      matchRegex:     RE.typing,
      retain:         false,
    },
    {
      // SDK: subscribeRoom → `r/${roomId}/typing`  (L458); handler: roomTypingHandler (L343)
      name:           'room-typing',
      publishTopic:   `r/${roomId}/typing`,
      payload:        JSON.stringify({
        room_id:   roomId,
        status:    'typing_on',
        sender_id: partnerId,
        text:      'hello',
      }),
      subscribeTopic: `r/${roomId}/typing`,
      matchRegex:     RE.roomTyping,
      retain:         false,
    },
    {
      // SDK: subscribeRoom → `r/${roomId}/${roomId}/+/d`  (L462); handler: deliveryReceiptHandler (L400)
      name:           'message-delivered',
      publishTopic:   `r/${roomId}/${roomId}/${partnerId}/d`,
      payload:        '123:abc-unique',
      subscribeTopic: `r/${roomId}/${roomId}/+/d`,
      matchRegex:     RE.delivery,
      retain:         false,
    },
    {
      // SDK: subscribeRoom → `r/${roomId}/${roomId}/+/r`  (L463); handler: readReceiptHandler (L416)
      name:           'message-read',
      publishTopic:   `r/${roomId}/${roomId}/${partnerId}/r`,
      payload:        '123:abc-unique',
      subscribeTopic: `r/${roomId}/${roomId}/+/r`,
      matchRegex:     RE.read,
      retain:         false,
    },
    {
      // SDK: subscribeUserPresence → `u/${userId}/s`  (L517); handler: onlinePresenceHandler (L432)
      // publishPresence always uses { retain: true }  (L505-509)
      name:           'presence',
      publishTopic:   `u/${partnerId}/s`,
      payload:        '1',
      subscribeTopic: `u/${partnerId}/s`,
      matchRegex:     RE.onlineStatus,
      retain:         true,   // ← mirrors SDK publishPresence { retain: true }
    },
    {
      // SDK: subscribeChannel → `${appId}/${uniqueId}/c`  (L454); handler: channelMessageHandler (L441)
      // OVERLAP: this topic ALSO matches RE.newMessage. We use RE.channelMessage (more specific)
      // to assert it lands on the channel event, proving the broker delivers 2-segment /c correctly.
      name:           'channel new-message',
      publishTopic:   `${appId}/${channelUniqueId}/c`,
      payload:        JSON.stringify({ id: 2, message: 'channel msg', unique_id: 'cmsg-001' }),
      subscribeTopic: `${appId}/${channelUniqueId}/c`,
      matchRegex:     RE.channelMessage,  // 2-segment prefix required — more specific than RE.newMessage
      retain:         false,
    },
    {
      // SDK: subscribeUserChannel → `${token}/update`  (L486); handler: messageUpdatedHandler (L446)
      name:           'message:updated',
      publishTopic:   `${userToken}/update`,
      payload:        JSON.stringify({ id: 1, message: 'edited text', unique_id: 'msg-001' }),
      subscribeTopic: `${userToken}/update`,
      matchRegex:     RE.messageUpdated,
      retain:         false,
    },
  ]
}
