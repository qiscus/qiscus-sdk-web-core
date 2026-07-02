# v2 ↔ core-v3 gap classification (DRAFT — Phase 0b)

> **STATUS: DRAFT — for Opus + user review.** Produced per
> [`v2-on-core-v3-plan.md`](./v2-on-core-v3-plan.md) §8/§8.0.6, from a code
> read of `packages/core-v3/src/usecases/*.ts`,
> `packages/core-v3/src/adapters/*.raw.ts`, `packages/core-v3/src/index.ts`,
> and `packages/version-2/src/index.js` + `lib/adapters/*.js`. This is
> classification only — **no methods are rewired yet** (Phase 0). Buckets
> follow §8: `covered-by-core-v3` / `keep-in-shell` / `propose-core-v3`
> (gated, needs Opus+user sign-off before any core-v3 change) / `BLOCKER`.

## Findings that update the plan's prior assumptions

Two things surfaced during this pass that the plan (§8) flagged as "likely"
or didn't fully resolve — calling them out for review before Phase 1:

1. **`withConfig` / `api/v2/sdk/config` negotiation is *mostly*
   `covered-by-core-v3`, not `keep-in-shell` as §8 guessed.**
   `Core.setupWithCustomServer` (`usecases/setup.ts:23-116`) already calls
   `deps.userAdapter.getAppConfig()` (same `api/v2/sdk/config` endpoint) and
   applies a `setterHelper`/broker-URL-wss-check pair that is **algorithmically
   identical** to v2's own `setterHelper`/`mqttWssCheck`
   (`index.js:205-225`) — same three-way (`fromUser`/`fromServer`/`default`)
   precedence, same `wss://` check. It negotiates `baseUrl`, `brokerUrl`
   (mqttURL), `brokerLbUrl`, `syncInterval`, `syncOnConnect` (→
   `syncIntervalWhenConnected`), and `isSyncEnabled`/`isSyncEventEnabled`
   (→ v2's `enableSync`/`enableSyncEvent`). **Not** covered: `enableRealtime`,
   `enableRealtimeCheck`, `enableEventReport`, `extras`, and the
   `auto_refresh_token` flag (P-1 territory) — core-v3's `setup` doesn't read
   or store these. Also missing: v2's `withConfig: false` opt-out (core-v3
   always calls `getAppConfig()`). **Recommendation:** call
   `Core.setupWithCustomServer` for the overlapping fields, and separately
   read the remaining raw config fields off the same `getAppConfig()`
   response in the shell (either by calling `deps.userAdapter.getAppConfig()`
   directly a second time, or — better — proposing `setup` return/expose the
   raw config it already fetched, which itself would be a tiny
   `propose-core-v3` candidate). Marked `covered-by-core-v3 (partial)` below.

2. **`getUserPresences(emails[])` (batch presence fetch) has NO core-v3
   primitive at all** — not a usecase, not a raw adapter method, not even an
   `Api.*` builder (`POST users/status` doesn't exist anywhere in
   `core-v3/src`). core-v3 only has the *subscription* model
   (`subscribeUserOnlinePresence`/`onUserOnlinePresence`), which is a
   different capability (push updates, not a one-shot batch read). Since this
   method needs no model translation (no `Room`/`Comment` involved) and
   doesn't block the "core-v3 as engine" goal for anything else, classified
   `keep-in-shell` — implemented by calling `this.HTTPAdapter` directly,
   unchanged from today, rather than through `deps`/core-v3 at all.

---

## Setup / lifecycle

| v2 capability | core-v3 counterpart | Bucket | Note |
|---|---|---|---|
| `init(config)` — `withConfig` / `api/v2/sdk/config` negotiation | `Core.setupWithCustomServer` (`usecases/setup.ts`) | **covered-by-core-v3 (partial)** | See finding #1 above — reuse for the overlapping fields; shell must still negotiate `enableRealtime`/`enableRealtimeCheck`/`enableEventReport`/`extras`/`withConfig` toggle itself. |
| `init(config)` — adapter wiring, `options.*Callback` plumbing, ~50 public field defaults | n/a (state/identity) | **keep-in-shell** | Per plan §5 — state & identity never move to core-v3. |
| `setCustomHeader(headers)` | `Core.setCustomHeader` | **covered-by-core-v3** | Direct match. |
| Sync interval (`init` `syncInterval`/`syncOnConnect`) | `Core.setSyncInterval` | **covered-by-core-v3** | Reshaped (config field → explicit setter), value already covered by finding #1's negotiation. |
| `logging()` / `get logger` / `debugMode` | `Core.getLogger` / `Core.enableDebugMode` | **covered-by-core-v3** | Trivial. |
| `disconnect()` / `exitChatRoom()` | `Core.closeRealtimeConnection` | **keep-in-shell (M)** | Clearing `this.selected` is v2-only state; core-v3 call is the one delegated line. |
| Offline HTTP sync loop (`SyncAdapter`) | `adapters/sync.ts` (`shouldSync`, `getSyncInterval(WhenConnected)`, `getForceDisableSync`) + `startSync`/`stopSync`/`synchronize` usecases | **covered-by-core-v3 (cadence parity not yet verified)** | Per plan §7/§9 Phase 5 — **keep v2's own `SyncAdapter` running through Phase 4**; only delete after core-v3 cadence/`last_message_id` parity is demonstrated against fixtures. Not a blocker, just sequenced last. |
| `this.version` property, `get/set uploadURL` | none | **keep-in-shell** | v2-only public fields; no core-v3 concept. |

## Auth / user

| v2 capability | core-v3 counterpart | Bucket | Note |
|---|---|---|---|
| `setUser(userId,key,username,avatarURL,extras)` | `Core.setUser` | **covered-by-core-v3** | T,M,E: map to `userData`/`isLogin`/`user_id`, emit login event. |
| `setUserWithIdentityToken(data)` | `Core.setUserWithIdentityToken` | **covered-by-core-v3** | Arg shape differs (object vs token string per features.md) — translate in shell. |
| `verifyIdentityToken` / `getNonce` | `Core.getJWTNonce` | **covered-by-core-v3** | Rename. |
| `updateProfile(user)` | `Core.updateUser` | **covered-by-core-v3** | Rename + arg reshape. |
| `getUserProfile()` / `getUserData()` | `Core.getUserData` | **covered-by-core-v3** | |
| `blockUser` / `unblockUser` / `getBlockedUser` | `Core.blockUser` / `Core.unblockUser` / `Core.getBlockedUsers` | **covered-by-core-v3** | Raw adapter shape already matches v2's historical response (`user.raw.ts` `BlockUserResponse`/`BlockedUserListResponse`) — see `compat/to-v2.js` `rawUserToV2`. |
| `getUsers(query,page,limit)` | `Core.getUsers` | **covered-by-core-v3** | |
| `getUserPresences(emails[])` | **none** (no usecase, no raw adapter method, no `Api.*` builder) | **keep-in-shell** | See finding #2 above — call `HTTPAdapter` directly, unchanged; no model translation needed. |
| `subscribeUserPresence` / `unsubscribeUserPresence` | `Core.subscribeUserOnlinePresence` / `unsubscribeUserOnlinePresence` | **covered-by-core-v3 (E)** | Re-emit v2's `'presence'` mitt payload from the `on*` handler. |
| `refreshAuthToken()` / `_autoRefreshToken` scheduler / `logout()` | **none** (zero token-refresh code in core-v3) | **propose-core-v3 — Proposal P-1, already approved to propose (plan §13, user 2026-07-01)** | Final API + implementation still need Opus+user sign-off as its own commit before v2 wiring. Expiry-timer scheduler stays in the shell regardless; core-v3 only gains the refresh/logout network calls. Transport-level 403-retry-once is already handled for free by the superagent requester (`compat/requester.js`), shrinking P-1's remaining scope to the timer + refresh/logout usecases. |
| `getRoomParticipants(uniqueId, offset)` *(deprecated variant)* | `Core.getParticipants(deps, roomUniqueId, page?, limit?, sorting?)` — **no `offset` param** | **keep-in-shell** | Already `console.warn`-deprecated in v2; bypass to raw adapter / approximate offset→page, low priority. |

## Rooms

| v2 capability | core-v3 counterpart | Bucket | Note |
|---|---|---|---|
| `chatTarget(userId, options)` | `Core.chatUser` | **covered-by-core-v3 (R,M)** | Worked example in plan §14; `compat/to-v2.js` `rawRoomToV2` handles the raw→`Room` massaging. |
| `chatGroup(id)` / `getRoomById(id)` | `Core.getChatRoomWithMessages` | **covered-by-core-v3 (T,M)** | Returns `[room, messages]`; recombine into one `Room` via `rawRoomToV2`. |
| `getOrCreateRoomByUniqueId` / `getOrCreateRoomByChannel` | `Core.getChannel` / `Core.createChannel` | **covered-by-core-v3** | |
| `createGroupRoom(name, emails, options)` | `Core.createGroupChat` | **covered-by-core-v3** | |
| `updateRoom(args)` | `Core.updateChatRoom` | **covered-by-core-v3** | |
| `addParticipantsToGroup` | `Core.addParticipants` | **covered-by-core-v3** | |
| `removeParticipantsFromGroup` | `Core.removeParticipants` | **covered-by-core-v3** | |
| `removeSelectedRoomParticipants(...)` | `Core.removeParticipants` + local mutation | **keep-in-shell (M)** | Also mutates `this.selected.participants` in place (`index.js:1647`) — v2-only convenience wrapper. |
| `getParticipants(...)` | `Core.getParticipants` | **covered-by-core-v3** | |
| `getRoomsInfo(params)` / `loadRoomList(params)` | `Core.getChatRooms` / `Core.getAllChatRooms` | **covered-by-core-v3** | |
| `getTotalUnreadCount` / `getRoomUnreadCount` | `Core.getTotalUnreadCount` / `Core.getRoomUnreadCount` | **covered-by-core-v3** | Direct match. |
| `clearRoomMessages(roomIds)` | `Core.clearMessagesByChatRoomId` | **covered-by-core-v3 (T,E)** | |
| `setActiveRoom`, `exitChatRoom`, `clearRoomsCache`, `sortComments`, `room_name_id_map` | none (v3 is stateless, no "active room") | **keep-in-shell** | Core v2 state machine; only the *data source* changes. |

## Messages

| v2 capability | core-v3 counterpart | Bucket | Note |
|---|---|---|---|
| `sendComment` / `resendComment` / `prepareCommentToBeSubmitted` | `Core.sendMessage` | **covered-by-core-v3 (R,M,E) + keep-in-shell for optimism** | Fetch/send delegates to core-v3; optimistic push/`_pendingComments`/retry stays shell-owned (core-v3 is fire-and-resolve, no optimistic model). |
| `loadComments(roomId, opts)` / `loadMore(lastCommentId, opts)` | `Core.getPreviousMessagesById` | **covered-by-core-v3 (R,M)** | |
| `deleteComment(...)` | `Core.deleteMessages` | **covered-by-core-v3 (T,M,E)** | |
| `readComment` / `receiveComment` / `_setRead` / `_setDelivered` | `Core.markAsRead` / `Core.markAsDelivered` | **covered-by-core-v3 (T,M)** | In-place `selected.comments[i].status` mutation stays shell logic. |
| `UpdateCommentStatusMode` (throttled/disabled/enabled) | none | **keep-in-shell** | v2-only throttling policy layered on top of `markAsRead`/`markAsDelivered`. |
| `searchMessages` / `searchMessage` | `Core.searchMessage` | **covered-by-core-v3** | |
| `getThumbnailURL` | `Core.getThumbnailURL` | **covered-by-core-v3** | |
| `getBlurryThumbnailURL` | none | **keep-in-shell** | Pure local helper (blur variant), v2-only. |
| `upload(file, cb)` / `uploadFile(roomId, file)` | `Core.upload` / `Core.sendFileMessage` | **covered-by-core-v3 (T,E)** | Keep v2's progress-callback shape + `this.uploadedFiles` bookkeeping in the shell. |
| `addUploadedFile` / `removeUploadedFile` / `uploadedFiles` | none | **keep-in-shell** | v2-only bookkeeping array. |
| `generateMessage` / `generateFileAttachmentMessage` / `generateCustomMessage` / `generateReplyMessage` / `_generateUniqueId` | `Core.generateMessage`/etc. (`usecases/message-factory.ts`) exist but return `IQMessage` shape | **keep-in-shell** | Plan §6.4: prefer keeping v2's own generators (pure, low risk) since core-v3's return a different (IQ) shape than `sendComment` needs as input. |

## Realtime / custom events / typing / presence

| v2 capability | core-v3 counterpart | Bucket | Note |
|---|---|---|---|
| `publishTyping(val)` | `Core.publishTyping` | **covered-by-core-v3 (M)** | Shell must still flip `this.isTypingStatus` on the *publish* side (today done by `MqttAdapter`). |
| `publishOnlinePresence(val)` | `Core.publishOnlinePresence` | **covered-by-core-v3** | |
| `publishEvent` / `subscribeEvent` / `unsubscribeEvent` | `Core.publishCustomEvent` / `subscribeCustomEvent` / `unsubscribeCustomEvent` | **covered-by-core-v3 (T,E)** | |
| Realtime message/typing/presence/deleted/room-cleared delivery → mitt events + `this.selected` mutation | `Core.onMessageReceived`/`onMessageDelivered`/`onMessageRead`/`onMessageDeleted`/`onRoomCleared`/`onUserTyping`/`onUserOnlinePresence` (all decoded-`IQ*` today) | **covered-by-core-v3, pending Phase 4a build** | Per plan §7 "realtime raw" — the **raw payload stream split** (`mqtt.ts`/`sync.ts` exposing raw alongside the existing `Decoder`-mapped stream) is scoped but **not yet built**; it's explicitly Phase 4a, gated by the 74 core-v3 tests keeping v3's decoded streams byte-identical. Not a blocker, just not-yet-implemented. |
| Incoming-typing `this.isTypingStatus` mutation (`mqtt.js:387-397`) | realtime bridge (to be built in Phase 4b) | **keep-in-shell (M)**, fed by core-v3 stream | Must be reproduced in `compat/realtime-bridge.js`; flagged in plan §11 as a "lost mutation timing" trap. |
| `onReconnectMqtt` / `options.onReconnectCallback` | `Core.onReconnecting` / `Core.onConnected` | **covered-by-core-v3 (E)**, pending Phase 4a/4b | |

## Hooks

| v2 capability | core-v3 counterpart | Bucket | Note |
|---|---|---|---|
| `intercept(interceptor, callback)` / `Hooks.MESSAGE_BEFORE_SENT` / `MESSAGE_BEFORE_RECEIVED` | `Core.hookAdapterFactory` / `Core.Hooks` | **covered-by-core-v3 — DONE** | Already switched in Phase 0a: `index.js:18` imports `{ Hooks, hookAdapterFactory }` from `@qiscus/core-v3`. Enum string values verified unchanged (`message::before-sent` / `message::before-received`). |

---

## Bucket summary

- **`covered-by-core-v3`:** the large majority of methods across all domains — Setup (partial), all of Auth/user except `refreshAuthToken`/`getUserPresences`, all of Rooms, all of Messages except the v2-only optimistic/bookkeeping/throttle helpers, most of Realtime (pending the Phase 4a raw-stream split), Hooks (done).
- **`keep-in-shell`:** state/identity (`selected`, `rooms`, `room_name_id_map`), optimistic send, upload bookkeeping, comment-status throttle modes, blurry thumbnail, message generators, `getUserPresences`, deprecated offset-based `getRoomParticipants`, and the config fields core-v3's `setup` doesn't negotiate (`enableRealtime`, `enableRealtimeCheck`, `enableEventReport`, `extras`, `withConfig` toggle).
- **`propose-core-v3` (gated, escalate before implementing):** only Proposal P-1 (auth token auto-refresh + `logout`), already approved *to propose* per plan §13 — final shape still needs sign-off.
- **`BLOCKER`:** none found in this pass.
