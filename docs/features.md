# Feature comparison: version-2 vs version-3

> Scope: comparison of the **public API surface** of the two SDK versions living in
> this monorepo:
> - **v2** — `packages/version-2` (`qiscus-sdk-core`, class `QiscusSDK`, `src/index.js`)
> - **v3** — `packages/version-3` (`qiscus-sdk-javascript`, class `Qiscus`, `src/index.ts`)
>
> Generated 2026-06-30 from a method-by-method read of both entry classes. This is a
> capability/API map — it does not compare wire protocol or server behavior.

## TL;DR — the two are different paradigms, not drop-in compatible

| Aspect | v2 (`QiscusSDK`) | v3 (`Qiscus`) |
|---|---|---|
| State | **Stateful** — keeps in-memory `rooms`, `selected` active room, `comments`, `uploadedFiles`, `pendingCommentId` | **Stateless** — no in-memory room/comment store; you pass ids in and get data back |
| Realtime/events | **mitt event-emitter + `init()` callbacks** (`loginSuccessCallback`, `newMessagesCallback`, …) | **Explicit `on*(handler)` subscription methods** returning an unsubscribe handle |
| Async style | mixed callbacks/promises + emitted events | **dual promise + optional callback** on nearly every method |
| Data model | exposes **`Comment` & `Room` classes** (rich instances) | plain interfaces **`IQMessage` / `IQChatRoom` / `IQParticipant` / `IQUser` / `IQAccount`** |
| Setup | one `init({ AppId, …, options:{ …Callback } })` | `setup(appId)` / `setupWithCustomServer(...)` (no callbacks in setup) |
| Optimistic UI | built-in (`resendComment`, pending comment, retry-exceed) | **not provided** — caller owns optimistic state |

Most capabilities exist on both sides but under **different names and shapes**. A
handful are **v2-only** (mostly stateful/optimistic-UI helpers and extra auth/event
callbacks) and a handful are **v3-only** (forward pagination, first-class
connection-lifecycle subscriptions, `hasSetupUser`).

Legend: ✅ parity · 🔁 renamed/reshaped · ⚠️ partial / semantic diff · ❌v3 = v2-only (missing in v3) · ❌v2 = v3-only (missing in v2)

---

## Setup & configuration

| Capability | v2 | v3 | Status |
|---|---|---|---|
| Initialize app | `init(config)` (single object, incl. `options.*Callback`) | `setup(appId)` / `setupWithCustomServer(appId, baseUrl, brokerUrl, brokerLbUrl, syncInterval)` | 🔁 |
| Custom HTTP header | `setCustomHeader(headers)` | `setCustomHeader(headers)` | ✅ |
| Sync interval | via `init` (`syncInterval` / `syncOnConnect`) | `setSyncInterval(interval)` | 🔁 |
| Debug / logging | `logging()`, `get logger`, `debugMode` config | `enableDebugMode(enable)` | 🔁 |
| Manual synchronize | `get synchronize` / `get synchronizeEvent` | `synchronize(lastMessageId)` / `synchronizeEvent(lastEventId)` | ✅ |
| Start / stop sync | `startSync()` / `stopSync()` | `startSync()` / `stopSync()` | ✅ |
| Open / close realtime | `openRealtimeConnection()` / `closeRealtimeConnection()` | same | ✅ |
| Disconnect realtime | `disconnect()` | `closeRealtimeConnection()` | 🔁 |
| SDK version string | `this.version` (`WEB_x.y.z`) | — (internal `storage.setVersion`) | ❌v3 |
| Upload URL | `get/set uploadURL` | — | ❌v3 |

## Auth & user

| Capability | v2 | v3 | Status |
|---|---|---|---|
| Login (userId + key) | `setUser(userId, key, username, avatarURL, extras)` | `setUser(userId, userKey, username?, avatarUrl?, extras?)` | ✅ |
| Login (identity token) | `setUserWithIdentityToken(data)` (object) | `setUserWithIdentityToken(token)` (string) | ⚠️ |
| Verify identity token | `verifyIdentityToken(identityToken)` | — (folded into `setUserWithIdentityToken`) | ❌v3 |
| Get JWT nonce | `getNonce()` | `getJWTNonce()` | 🔁 |
| Refresh auth token | `refreshAuthToken()` | — (handled internally via auth-token-refresh adapter) | ❌v3 |
| Update own profile | `updateProfile(user)` | `updateUser(username, avatarUrl, extras?)` | 🔁 |
| Get own profile | `getUserProfile()` | `getUserData()` | 🔁 |
| List users | `getUsers(query, page, limit)` | `getUsers(searchUsername?, page?, limit?)` | ✅ |
| Block / unblock | `blockUser(email)` / `unblockUser(email)` | `blockUser(userId)` / `unblockUser(userId)` | ✅ |
| Blocked users list | `getBlockedUser(page, limit)` | `getBlockedUsers(page?, limit?)` | 🔁 |
| Logout / clear session | `logout()` | `clearUser()` | 🔁 |
| Device token reg/unreg | `registerDeviceToken` / `removeDeviceToken` | `registerDeviceToken` / `removeDeviceToken` | ✅ |
| Publish online presence | `publishOnlinePresence(val)` | `publishOnlinePresence(isOnline)` | ✅ |
| Subscribe presence | `subscribeUserPresence` / `unsubscribeUserPresence` | `subscribeUserOnlinePresence` / `unsubscribeUserOnlinePresence` | 🔁 |
| Batch presence fetch | `getUserPresences(email[])` | — | ❌v3 |
| Has user been set up | — (use `isLogin` / `userData`) | `hasSetupUser()` | ❌v2 |

## Rooms

| Capability | v2 | v3 | Status |
|---|---|---|---|
| Start/open 1-to-1 chat | `chatTarget(userId, options)` | `chatUser(userId, extras?)` | 🔁 |
| Open group room (+ messages) | `chatGroup(id)` / `getRoomById(id)` | `getChatRoomWithMessages(roomId)` → `[room, messages]` | 🔁 |
| Get/create channel | `getOrCreateRoomByChannel` / `getOrCreateRoomByUniqueId` | `getChannel(uniqueId)` / `createChannel(uniqueId, name?, …)` | 🔁 |
| Create group room | `createGroupRoom(name, emails, options)` | `createGroupChat(name, userIds, avatarUrl?, extras?)` | 🔁 |
| Update room | `updateRoom(args)` | `updateChatRoom(roomId, name?, avatarUrl?, extras?)` | 🔁 |
| Add participants | `addParticipantsToGroup(roomId, emails)` | `addParticipants(roomId, userIds)` | 🔁 |
| Remove participants | `removeParticipantsFromGroup(roomId, emails)` / `removeSelectedRoomParticipants(...)` | `removeParticipants(roomId, userIds)` | 🔁 (selected-room variant ❌v3) |
| List participants | `getParticipants(...)` / `getRoomParticipants(uniqueId, offset)` | `getParticipants(roomUniqueId, page?, limit?, sorting?)` | ⚠️ (v2 offset variant ❌v3) |
| Room list | `loadRoomList(params)` | `getAllChatRooms(showParticipant?, showRemoved?, showEmpty?, page?, limit?)` | 🔁 |
| Rooms by ids | `getRoomsInfo(params)` | `getChatRooms(ids, page?, showRemoved?, showParticipant?)` | 🔁 |
| Unread counts | `getTotalUnreadCount()` / `getRoomUnreadCount()` | same | ✅ |
| Clear room messages | `clearRoomMessages(roomIds)` | `clearMessagesByChatRoomId(roomUniqueIds)` | 🔁 |
| Active-room / cache mgmt | `setActiveRoom`, `exitChatRoom`, `clearRoomsCache`, `sortComments` | — (v3 is stateless, no "active room") | ❌v3 |

## Messages

| Capability | v2 | v3 | Status |
|---|---|---|---|
| Send message | `sendComment(...)` | `sendMessage(message)` | 🔁 |
| Optimistic resend / retry | `resendComment`, `_retrySendComment`, `prepareCommentToBeSubmitted` | — (caller owns optimistic state) | ❌v3 |
| Load older history | `loadComments(roomId, opts)` / `loadMore(lastCommentId, opts)` | `getPreviousMessagesById(roomId, limit?, messageId?)` | 🔁 |
| Load newer messages | — | `getNextMessagesById(roomId, limit?, messageId?)` | ❌v2 |
| Delete messages | `deleteComment(roomId, uniqueIds, isForEveryone, isHard)` | `deleteMessages(messageUniqueIds)` | 🔁 |
| Update a message | `updateMessage(message)` | `updateMessage(message)` | ✅ |
| Search messages | `searchMessages(params)` / `searchMessage(...)` | `searchMessage({ query, roomIds, … })` | ✅ |
| File list | `getFileList(...)` | `getFileList({ roomIds?, fileType?, page?, limit? })` | ✅ |
| Mark read / delivered | `readComment` / `receiveComment` (+ throttled `_updateStatus`, `UpdateCommentStatusMode`) | `markAsRead(roomId, messageId)` / `markAsDelivered(roomId, messageId)` | 🔁 (throttle modes ❌v3) |
| Upload file (raw) | `upload(file, callback)` | `upload(file, callback?)` | ✅ |
| Upload + send as message | `uploadFile(roomId, file)` | `sendFileMessage(message, file, callback?)` | 🔁 |
| Upload bookkeeping | `addUploadedFile` / `removeUploadedFile` / `uploadedFiles` | — | ❌v3 |
| Message factory | `generateMessage`, `generateFileAttachmentMessage`, `generateCustomMessage`, `generateReplyMessage`, `_generateUniqueId` | same set | ✅ |
| Thumbnail URL | `getThumbnailURL(fileURL)` | `getThumbnailURL(url)` | ✅ |
| Blurry thumbnail URL | `getBlurryThumbnailURL(fileURL)` | — | ❌v3 |

## Realtime & events — the biggest mismatch

v2 delivers realtime through **`init()` callback options** and an internal **mitt
emitter**; v3 exposes **explicit subscription methods**. The two models don't line
up 1:1.

| Capability | v2 | v3 | Status |
|---|---|---|---|
| Custom event pub/sub | `publishEvent` / `subscribeEvent` / `unsubscribeEvent` | `publishCustomEvent` / `subscribeCustomEvent` / `unsubscribeCustomEvent` | 🔁 |
| Publish typing | `publishTyping(val)` | `publishTyping(roomId, isTyping?)` | 🔁 |
| Subscribe to a room/channel | implicit (via `setActiveRoom`) | `subscribeChatRoom(room)` / `unsubscribeChatRoom(room)` | ❌v2 (explicit) |
| Consumption model | init callbacks + `qiscus::*` mitt events | `on*(handler) → unsubscribe` | 🔁 paradigm |

### v2 callback/event → v3 subscription mapping

| v2 `init` callback / emitted event | v3 subscription | Status |
|---|---|---|
| `newMessagesCallback` / `newmessages` | `onMessageReceived(handler)` | 🔁 |
| `messageUpdatedCallback` | `onMessageUpdated(handler)` | 🔁 |
| `commentReadCallback` / `comment-read` | `onMessageRead(handler)` | 🔁 |
| `commentDeliveredCallback` / `comment-delivered` | `onMessageDelivered(handler)` | 🔁 |
| `commentDeletedCallback` / `comment-deleted` | `onMessageDeleted(handler)` | 🔁 |
| `typingCallback` / `onRoomTypingCallback` / `typing`,`room-typing` | `onUserTyping(handler)` | 🔁 |
| `presenceCallback` / `presence` | `onUserOnlinePresence(handler)` | 🔁 |
| `roomClearedCallback` / `room-cleared` | `onChatRoomCleared(handler)` | 🔁 |
| `onReconnectCallback` | `onReconnecting(handler)` | 🔁 |
| `onReconnectedCallback` | `onConnected(handler)` | ⚠️ |
| (connection drop) | `onDisconnected(handler)` | ❌v2 (first-class in v3) |
| `loginSuccessCallback` / `login-success` | — (the `setUser` promise resolving) | ⚠️ |
| `authTokenRefreshedCallback` / `token-refreshed` | — (no public subscription) | ❌v3 |
| `commentSentCallback` / `comment-sent` | — (the `sendMessage` promise resolving) | ❌v3 |
| `commentRetryExceedCallback` / `comment-retry-exceed` | — (no optimistic retry in v3) | ❌v3 |
| `chatRoomCreatedCallback` / `groupRoomCreatedCallback` | — | ❌v3 |
| `blockUserCallback` / `unblockUserCallback` | — | ❌v3 |
| `participants-added` / `participants-removed` | — | ❌v3 |
| `loginErrorCallback`, `roomChangedCallback`, `updateProfileCallback`, `fileUploadedCallback`, `headerClickedCallback`, `messageInfoCallback`, `commentFormaterCallback`, `prePostCommentCallback` | — | ❌v3 |

> Net: v3 covers the **message/typing/presence/room-cleared/connection** streams
> as first-class subscriptions, but drops the many **lifecycle/UI callbacks** v2
> surfaced (sent/retry/created/blocked/profile/etc.). In v3 those are obtained by
> awaiting the relevant method's promise instead of a callback.

## Hooks / interceptor

| Capability | v2 | v3 | Status |
|---|---|---|---|
| Message interceptors | `get Interceptor` + `intercept(interceptor, callback)` | `get Interceptor` (static + instance) + `intercept(...)` | ✅ |

## Models & misc

| Item | v2 | v3 | Status |
|---|---|---|---|
| Domain models | `Comment`, `Room` classes (instances with status methods) | `IQMessage`, `IQChatRoom`, `IQParticipant`, `IQUser`, `IQAccount` interfaces | ❌ paradigm diff |
| Comment status mode | `static UpdateCommentStatusMode` (disabled/throttled/enabled) | — | ❌v3 |
| `noop()` helper | present | — | ❌v3 |

---

## Summary of gaps

### Present in v2, missing in v3 (❌v3)
- **Auth/user:** `verifyIdentityToken`, `refreshAuthToken`, `getUserPresences`.
- **Stateful room mgmt:** `setActiveRoom`, `exitChatRoom`, `clearRoomsCache`,
  `sortComments`, `removeSelectedRoomParticipants`, `getRoomParticipants` (offset).
- **Optimistic messaging:** `resendComment`, `_retrySendComment`,
  `prepareCommentToBeSubmitted`, pending-comment tracking, `commentRetryExceed`.
- **Read receipts modes:** `UpdateCommentStatusMode` (throttled/disabled) +
  `readComment`/`receiveComment` throttling.
- **Upload bookkeeping:** `uploadFile` (combined), `addUploadedFile`,
  `removeUploadedFile`, `get/set uploadURL`.
- **Events/callbacks:** `authTokenRefreshedCallback`, `commentSentCallback`,
  `loginSuccessCallback` (as a callback), room/group-created, block/unblock,
  participants-added/removed, login-error, profile/file/header/message-info hooks.
- **Misc:** `getBlurryThumbnailURL`, `version` property, `logger`/`logging`,
  exposed `Comment`/`Room` classes, `UpdateCommentStatusMode`, `noop`.

### Present in v3, missing in v2 (❌v2)
- **Forward pagination:** `getNextMessagesById`.
- **Connection lifecycle as subscriptions:** `onConnected`, `onReconnecting`,
  `onDisconnected`.
- **First-class message-status subscriptions:** `onMessageDelivered`,
  `onMessageRead`, `onMessageDeleted` (v2 surfaced these only via callbacks/events).
- **Explicit room subscribe:** `subscribeChatRoom` / `unsubscribeChatRoom`.
- **`hasSetupUser()`**, dedicated `setSyncInterval`, `enableDebugMode`,
  `setupWithCustomServer`, and a uniform **promise+callback** API on every method.

## Caveats
- This compares **public API names/shapes**, not behavior. Methods marked ✅ may
  still differ in argument types (e.g. v2 takes `email`, v3 takes `userId`;
  identity-token login takes an object in v2 vs a string in v3) and in
  return/event timing.
- v2 is **stateful** (maintains rooms/comments/selected room in memory); v3 is
  **stateless**. Any v2 feature that relies on the in-memory store (active room,
  optimistic comment list, upload tracking) has no direct v3 method by design — the
  caller (UI layer) is expected to own that state in v3.

---

# Appendix: version-2 public mutable state & mutation model (deep dive)

> Why this matters: v2's `QiscusSDK` is a plain JS class with **no `private`/`#`
> fields** — every property is public and writable, and several are **live objects
> that keep mutating after you receive them**. v3 (`Qiscus`) deliberately removes all
> of this: its only public reads are the getters `appId`/`token`/`isLogin`/
> `currentUser` (derived from an internal `storage`), and it hands back **plain,
> immutable-by-convention data** instead of live instances. The notes below are the
> concrete v2 behaviors a migration must account for.

## 1. The public state surface (constructor, `index.js:42-109`)

~50 public instance fields, no access control. Grouped:

- **Config (mutable at runtime):** `AppId`, `baseURL`, `mqttURL`, `brokerUrl`,
  `brokerLbUrl`, `syncOnConnect`, `syncInterval`, `sync`, `enableLb`,
  `enableRealtime`, `enableRealtimeCheck`, `enableSync`, `enableSyncEvent`,
  `enableEventReport`, `googleMapKey`, `allowedFileTypes`, `options`,
  `updateCommentStatusMode`, `updateCommentStatusThrottleDelay`, `_customHeader`,
  `_uploadURL` (via `get/set uploadURL`), `_autoRefreshToken`, `_forceEnableSync`.
- **Adapters (assigned during `init`):** `HTTPAdapter`, `realtimeAdapter`,
  `customEventAdapter`, `syncAdapter`, `userAdapter`, `roomAdapter`, `authAdapter`,
  `expiredTokenAdapter`, `_hookAdapter`.
- **Session:** `userData`, `isLogin`, `user_id`, `username`, `email`, `avatar_url`,
  `extras`, `isInit`, `isConfigLoaded`.
- **Live UI state (mutated continuously):** `rooms`, `selected`, `room_name_id_map`,
  `uploadedFiles`, `pendingCommentId`, `last_received_comment_id`,
  `lastReceiveMessages`, `isTypingStatus`, `chatmateStatus`, `isLoading`,
  `isSynced`, plus widget-UI leftovers (`UI`, `mode`, `avatar`, `plugins`, `emoji`,
  `customTemplate`, `templateFunction`, `debugMode`, `debugMQTTMode`).

## 2. Mutation characteristics (the risky parts)

**a. `this.selected` is a live `Room` you also receive.** `setActiveRoom(room)`
(`index.js:997`) just does `this.selected = room`. The room handed in is a `Room`
instance that is also returned to the caller (e.g. `chatTarget` resolves with
`room`, `index.js:1062-1110`) and emitted via `chat-room-created` / `room-changed`.
After that, the SDK keeps **mutating that same object in place**:
- New message → `this.selected.comments.push(new Comment(message))` then
  `sortComments()` sorts the array in place (`index.js:386-394`, sync handler; the
  mqtt path mirrors it). So a consumer holding the room sees its `comments` array
  grow/reorder under it.
- Status updates rewrite a comment by index: `this.selected.comments[index] =
  comment` (`index.js:1532`).
- Participants mutated in place: `this.selected.participants.push(...)`
  (`index.js:822`), and reassigned wholesale on removal (`index.js:833, 1673`).

**b. `Room`/`Comment` models self-mutate.** `Room.receiveComment/receiveComments`
rebuild `this.comments`, `addParticipant` pushes, `setTitle/setSubTitle` write
`custom_title/custom_subtitle` (`lib/Room.js:62-107`). The objects you get are not
snapshots.

**c. Bidirectional mutation — adapters write back into the core.** `MqttAdapter`
receives the **whole core instance** as a constructor arg
(`new MqttAdapter(this.mqttURL, this, this.isLogin, {...})`, `index.js:302`) and
stores `this.core = core`. It then **mutates public core fields**:
- `this.core.mqttURL = url` during LB resolution (`lib/adapters/mqtt.js:180`) — so
  `mqttURL` changes *after* `init`, underneath the caller.
- `this.core.isTypingStatus = '<name> is typing ...'` / `= null`
  (`lib/adapters/mqtt.js:394-396`).
It also *reads* `this.core.selected`, `this.core.selected.id/participants`,
`this.core.isLogin` throughout — i.e. adapter behavior is coupled to live core state.

**d. Config keeps changing after `init`.** `init` writes ~15 config fields
(`index.js:124-166`); `setCustomHeader` rewrites `_customHeader`; `uploadURL` has a
public setter; and as in (c) `mqttURL` is overwritten by the broker-LB logic. There
is no freeze/seal — anything can be reassigned by the SDK, an adapter, or the
consumer at any time.

**e. Vestigial public state.** `this.rooms` is initialized to `[]` and, in
`index.js`, is **only ever `splice`d** (trim, in `clearRoomsCache`,
`index.js:1919/1924`) — it is never `push`ed to by the core. It's a public array the
SDK exposes but does not actually populate; consumers that relied on `qiscus.rooms`
were effectively maintaining it themselves.

## 3. Hotspot variables and who mutates them

| Public var | Mutated by | How |
|---|---|---|
| `selected` | core (10 reassigns) + new-message/status handlers | `= room`; nested `.comments` push/index-set/sort, `.participants` push/reassign |
| `isTypingStatus` | core **and** `MqttAdapter` | string / `null` on typing events |
| `mqttURL` | core (`init`) **and** `MqttAdapter` | overwritten by broker-LB resolution |
| `last_received_comment_id` | core (5 sites, `updateLastReceivedComment`) | bumped as messages arrive |
| `uploadedFiles` | core | `push(new FileUploaded(...))` / `splice` (`index.js:1859/1866`) |
| `userData`, `isLogin`, `user_id` | core login flow | set on `setUser`/identity-token/login-success |
| `pendingCommentId` | core | incremented for optimistic sends |
| `updateCommentStatusMode` | core (`init` + setters) | switches read-receipt throttling |
| adapters (`realtimeAdapter`, …) | `init` / re-`init` | reassigned (can be swapped mid-session) |

## 4. Implications for v3 / migration

- v3 exposes **none** of this: no `selected`, no live `rooms`/`comments`, no public
  config fields, no adapter handles, no model instances. State lives in the internal
  `storage` and is only surfaced through the four read-only getters.
- Anyone porting v2 UI code that **read or wrote** `qiscus.selected`,
  `qiscus.selected.comments`, `qiscus.rooms`, `qiscus.userData`,
  `qiscus.isTypingStatus`, `qiscus.mqttURL`, etc. must move that state into their own
  app layer — in v3 you assemble it from method return values + `on*` subscriptions.
- The v2 pattern of an adapter mutating core fields (`mqttURL`, `isTypingStatus`) has
  **no analog** in v3; typing is delivered only via `onUserTyping(handler)`, and
  broker URLs are resolved internally with nothing observable on the instance.
