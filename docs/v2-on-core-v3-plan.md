# Plan: Re-platform `version-2` on top of `@qiscus/core-v3` (keep v2 public API byte-for-byte)

> Audience: this document is written so a Sonnet sub-agent can execute it without
> re-discovering the architecture. Read it top-to-bottom before touching code.
> Companion doc: [`docs/features.md`](./features.md) — the v2↔v3 feature comparison
> and the deep-dive on v2's public mutable state. **Read that first.**
>
> **⚠ Depends on the decode-module refactor — do that FIRST.** This plan sits on top
> of [`docs/core-v3-decode-module-refactor.md`](./core-v3-decode-module-refactor.md),
> which splits `@qiscus/core-v3` into a **raw / version-agnostic surface** (root
> barrel: `Api`, `Provider`, storage, mqtt/sync, hooks, **raw adapters**, and the
> **shared usecases** with their validation/`bufferUntil` orchestration) plus a
> **`v3/` module** (Decoder + `IQ*`, for shell-v3). After that refactor, **v2 consumes
> the raw surface**: it calls the *same shared usecases* (fed raw adapters, so they
> return raw JSON at runtime) and decodes to its own `Comment`/`Room`. This supersedes
> the earlier "raw-seam via P-2 export" idea: **P-2 is dropped** (raw is now the
> package's native public surface), and **P-1 token-refresh** moves into the shared
> `auth/` surface. Where this doc still says "call `apiAdapter.request(Api.build…)`
> directly", read it as "call the shared raw usecase" unless a method must bypass
> orchestration for byte-for-byte parity (see §6 caveat).

---

## 1. Goal & the hard rule

Today `packages/version-2` (`qiscus-sdk-javascript`, the `QiscusSDK` class) talks to
the Qiscus backend through its **own** stack: `HttpAdapter`, `UserAdapter`,
`RoomAdapter`, `MqttAdapter`, `SyncAdapter`, `AuthAdapter`, `CustomEventAdapter`,
`ExpiredTokenAdapter`, plus the live `Room`/`Comment` model classes.

We want to **swap that internal engine for `@qiscus/core-v3`** (the functional core
extracted from version-3) **without changing anything a consumer can observe.**

### Why "byte-for-byte" matters here

`version-2` was historically shipped *inside* a Vue UI. Vue's reactivity tracked the
SDK's **public fields directly**, and a lot of code (both the old UI and current
customer integrations) **reads and mutates those fields in place** — e.g.
`qiscus.selected.comments.push(...)`, `qiscus.rooms`, `qiscus.isLogin`,
`qiscus.userData`, `qiscus.mqttURL`, `qiscus.isTypingStatus`. See the
"version-2 public mutable state & mutation model" appendix in `docs/features.md`
for the full inventory (~50 public fields + the live `selected` room).

**Therefore the contract we must preserve is not just the methods — it is the entire
observable surface:**

1. **Every public method** — same name, same arity, same argument order, same return
   type/shape, same thrown errors, same callback-vs-promise behavior.
2. **Every public field** — same name, same type, and **it must keep being mutated at
   the same moments** (so Vue reactivity and customer code that reads them keeps
   working). Example: after a new realtime message arrives for the active room,
   `this.selected.comments` must gain a `Comment` instance and be re-sorted, exactly
   like today.
3. **Every event** — the `mitt` emitter (`qiscus.events.on('newmessages', ...)`,
   `'presence'`, `'comment-deleted'`, `'room-cleared'`, `'typing'`, `'room-typing'`)
   must fire with the **same payload shapes**.
4. **Every model shape** — methods that return `Room`/`Comment` instances must keep
   returning objects with the same fields (`comment_before_id`→`before_id`,
   `unique_temp_id`, `room_name`→`name`, etc. — see `lib/Comment.js`, `lib/Room.js`).
5. **The `QiscusSDK` default export, the `QiscusSDK` UMD global, and statics**
   (`QiscusSDK.UpdateCommentStatusMode`) stay identical.

If any of those change, a Vue integration breaks silently. That is the failure mode
this plan exists to avoid.

---

## 2. Constraints (non-negotiable)

- Work **only** in the worktree
  `sdk-js/.claude/worktrees/monorepo` (branch `monorepo`). **Do not push.**
- **Consume `@qiscus/core-v3`; do not modify its logic on your own initiative.**
  The default is one-way: version-2 calls core-v3, core-v3 stays as-is.
  - **Exception (gated):** if a capability v2 needs genuinely belongs in core-v3 —
    i.e. duplicating it into the v2 shell would overload the shell or fork logic
    that *should* be shared by both versions — you **may propose adding it to
    core-v3**. But that proposal is a **discussion gate, not a green light**: a
    Sonnet executor must **STOP and escalate to Opus + the user** with (a) the exact
    missing capability, (b) why it belongs in core-v3 rather than the v2 shell, and
    (c) the proposed API/signature. **No core-v3 logic changes until Opus + the user
    approve.** Until then, treat the gap as `keep-in-shell` and keep moving on other
    methods.
  - Bug-for-bug parity caveat: even when extending core-v3 is approved, the v2
    public surface must not change — the new core-v3 function exists to *serve* the
    v2 shell, which still adapts the result back to v2's exact shape/mutations.
- **Do not touch** `version-3/src` shell or `sample-js` or the main `sdk-js`
  checkout. (`core-v3/src` is touchable **only** via the gated exception above.)
- Commit only when the user asks. Commit trailer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- This is a **mechanical re-platforming, not a redesign.** Do not "improve" the v2
  API, rename fields, or drop "weird" behavior. Weird behavior *is* the spec.

---

## 3. The shape of the problem (why this is non-trivial)

v2 and core-v3 are paradigm-mismatched. The plan's whole job is the **translation
layer** that hides the mismatch:

| Concern | version-2 (must keep) | core-v3 (the new engine) |
|---|---|---|
| State | Stateful: `selected`, `rooms`, `userData`, ~50 fields | Stateless functions over `storage` + adapters |
| Models | Live `Room`/`Comment` classes built from **raw snake_case API JSON** | Plain `IQChatRoom`/`IQMessage`/`IQUser` (decoded, camelCase) |
| Realtime | `MqttAdapter` emits events → mutates `core` + `mitt` events + callbacks via `options.*` | `getRealtimeAdapter` + `on*(handler)` subscription streams |
| Sync | `SyncAdapter` polling loop feeding the same event bus | core-v3 `synchronize`/`synchronizeEvent` usecases |
| Auth refresh | `ExpiredTokenAdapter` / `_autoRefreshToken` | core-v3 storage token + hook flow |
| Delivery | callback **and** mutate `this.selected` in place | promise **or** explicit subscription |

Two mismatches dominate the work:

- **Model translation → solved with raw passthrough (do NOT remap IQ→raw).** v2's
  `Comment`/`Room` constructors consume **raw API JSON** (`comment_before_id`,
  `unique_temp_id`, `room_name`, `room_total_participants`, `unix_nano_timestamp`, …).
  core-v3's usecases return `IQMessage`/`IQChatRoom`, which are a **lossy, curated
  subset** of that raw JSON — so reconstructing raw *from* IQ is both wasteful and
  cannot be faithful (dropped fields are unrecoverable). **Instead, take the raw JSON
  at the seam where core-v3 already has it**, before it decodes to IQ:
  - After the decode-module refactor, decode lives only in the `v3/` module; the
    **shared usecases return raw** when fed the **raw adapters** (see
    `core-v3-decode-module-refactor.md` §2 — decode is entirely in the adapters, so the
    same usecase yields IQ for v3 and raw for v2 depending on which adapters are in
    `deps`).
  - So for **every model-returning read**, the v2 shell calls the **shared usecase**
    (e.g. `Core.chatUser(deps, id)`), receives the raw `resp` at runtime, and feeds
    `resp.results.room` / `resp.results.comments` **straight into `new Room()` /
    `new Comment()`**. v2 thereby **reuses the shared orchestration** (validation,
    `bufferUntil(login)`) instead of re-assembling the request itself. The raw is the
    *same backend JSON v2 always consumed*, so `compat/to-v2.js` shrinks to a
    **near-identity normalizer**, not a lossy reconstructor.
  - **Reuse v2's `Comment`/`Room` classes unchanged.** Only the per-model decode stays
    version-specific (which is *why* the round-trip mapping disappears).
- **Realtime/event bridging.** v2's `init()` wires `MqttAdapter` + `SyncAdapter`
  event handlers that (a) mutate `this.selected.comments`, (b) emit `mitt` events,
  (c) invoke `options.*Callback`. We must reproduce **all three side-effects** by
  subscribing to core-v3's `on*` streams instead.

---

## 4. Target architecture: `QiscusSDK` as a compatibility shell

```
packages/version-2/src/
  index.js                # QiscusSDK: SAME public surface; internals call core-v3
  compat/                 # NEW — the translation layer (the only "new" code)
    deps.js               #   builds a QiscusDeps wired with core-v3 RAW adapters
    to-v2.js              #   near-identity: raw comment→Comment input, raw room→Room input, raw user→v2 user
    to-v3.js              #   v2 args/Comment→usecase params (for sendMessage etc.)
    realtime-bridge.js    #   subscribe core-v3 RAW on* streams → mutate selected + emit mitt + options.*
  lib/
    Comment.js Room.js    # UNCHANGED — still the public model classes
    utils.js util.js ...  # keep helpers still referenced by the shell
    adapters/             # DELETE once every consumer is migrated (see phasing)
```

**Principle:** `index.js` keeps **all state** (it is the stateful shell, same role as
version-3's `Qiscus` shell — see `version-3/src/index.ts`). It **delegates backend
work** to `core-v3` via the `compat` layer, then **re-applies the exact v2
side-effects** (mutations + events + model wrapping) on the way out.

**Delegation (after the decode-module refactor):** every method calls a **shared
core-v3 usecase** with a `deps` wired to **raw adapters**, so the usecase resolves with
**raw JSON** at runtime. Two flavors:
- **Model-returning reads** (`Room`/`Comment`): `Core.fn(deps, …)` → raw → build
  `new Room()`/`new Comment()` via `compat/to-v2.js` → apply v2 mutations/events.
- **Actions / void / primitives / auth / realtime:** `Core.fn(deps, …)` → (light
  translate if it returns a primitive/user) → apply v2 mutations/events.

**Parity caveat (bypass):** if a shared usecase's orchestration (validation errors,
`bufferUntil(login)` timing) would change a method's *observable* v2 behavior, that
method may bypass the usecase and call the raw adapter / `apiAdapter.request(Api.build…)`
directly to preserve byte-for-byte semantics. This is the exception, decided per method
in Phase 0/1 — not the default.

`compat/deps.js` builds the `QiscusDeps` bundle core-v3 expects:

```js
// compat/deps.js  (illustrative)
import * as Core from '@qiscus/core-v3'
export function makeDeps(self) {
  const storage = Core.storageFactory()
  // seed storage from v2 config fields so core-v3 sees the same server/app config
  storage.setBaseUrl(self.baseURL)
  storage.setAppId(self.AppId)
  storage.setBrokerUrl(self.mqttURL)
  // ...sync interval, custom header (getCustomHeader: () => self._customHeader), etc.
  const apiAdapter      = Core.makeApiRequest(storage)
  const hookAdapter     = self._hookAdapter // v2 already uses core-v3's hook factory
  // ▼ RAW adapters (from the shared surface) — return raw JSON, no Decoder.
  //   These satisfy QiscusDeps structurally at runtime; v2 is JS so the IQ typing
  //   the usecases declare is irrelevant here (see refactor plan §6).
  const userAdapter     = Core.getUserAdapterRaw(storage, apiAdapter)
  const realtimeAdapter = Core.getRealtimeAdapterRaw(storage, apiAdapter)
  const loggerAdapter   = Core.getLogger(storage)
  const roomAdapter     = Core.getRoomAdapterRaw(storage, apiAdapter)
  const messageAdapter  = Core.getMessageAdapterRaw(storage, apiAdapter)
  return { storage, apiAdapter, hookAdapter, userAdapter,
           realtimeAdapter, loggerAdapter, roomAdapter, messageAdapter }
}
```

> **Config sync is bidirectional and must stay live.** v2 mutates `this.baseURL`,
> `this.mqttURL`, etc. *after* `init()`. Two options: (a) rebuild `deps` lazily, or
> (b) make `compat/deps.js` read getters that point back at `self` (so storage
> reflects current field values). Prefer (b): wire core-v3 storage setters from
> `self` whenever the corresponding v2 field changes, OR seed storage at `init()` and
> document that post-init mutation of those fields is a known v2 quirk (check whether
> any consumer relies on it — `init()` already reads config once). **Decide this in
> Phase 0 by reading how `storage` is consumed inside core-v3 adapters.**

---

## 5. What stays in `index.js` (state & identity — never moves)

These are **state/identity, not logic** — they remain on the shell, exactly as today:

- The constructor's ~50 public fields (lines 42–109). Keep all of them, same
  defaults. They are the public contract.
- `this.events = mitt()` and the whole event bus.
- `this.selected` (live active `Room`), `this.rooms`, `this.room_name_id_map`,
  `this.userData`, `this.last_received_comment_id`, `this.pendingCommentId`,
  `this.uploadedFiles`, `this.isLogin`, `this.isLoading`, `this.isInit`,
  `this.isTypingStatus`, config flags, `this.UI`, `this.options`, etc.
- Getters/setters: `uploadURL`/`_uploadURL`.
- Statics: `static UpdateCommentStatusMode`.
- The **selected-room state machine**: `setActiveRoom`, `chatTarget`, `chatGroup`,
  `exitChatRoom`, `sortComments`, `_callNewMessagesCallback`,
  `updateLastReceivedComment`. These manage v2-only convenience state that core-v3
  has no concept of. They stay, but the **data they store** now comes from core-v3
  usecase results (translated by `compat/to-v2.js`).
- `setEventListeners()` / the `options.*Callback` plumbing — stays; it is fed by the
  realtime bridge.

> Rule of thumb mirrored from the version-3 extraction: **state & identity stay on
> the class; backend logic goes through core-v3.** The difference from v3 is that v2
> *also* keeps a thick stateful convenience layer (selected room, mitt bus) which is
> itself part of the public contract.

---

## 6. What gets re-platformed (the method-by-method map)

Each v2 method keeps its signature and side-effects; its **body** calls a **shared
core-v3 usecase** (`deps` wired with raw adapters → returns raw at runtime), then:
- **Model-returning reads:** raw → `new Room()`/`new Comment()` via `to-v2.js` → apply
  v2 mutations/events → return.
- **Actions/void/primitive/auth/realtime:** → (light translate if it returns a
  user/count) → apply v2 mutations/events → return.

Legend: **R**=returns a model, wrap raw→`Room`/`Comment`, **U**=action/void/primitive,
**T**=translation (near-identity raw normalizer for R; small raw→v2 for the few U
returns like a user object), **M**=public mutation to preserve, **E**=event/callback to
preserve. All rows go through the shared usecase unless the §4 parity-bypass applies.
The "core-v3" column names the usecase to call.

### 6.1 Setup / lifecycle
| v2 method | core-v3 | Notes |
|---|---|---|
| `init(config)` | `Core.setup`/`setupWithCustomServer` + build `deps` + `realtime-bridge.subscribe()` | **T,M**: still fetch `api/v2/sdk/config` semantics (the `setterHelper`/`mqttWssCheck` config negotiation at lines 205–296). Keep config mutation. Still set `this.HTTPAdapter`/`this.realtimeAdapter`/`this.syncAdapter`/`this.customEventAdapter` field references (consumers read them) — point them at core-v3-backed shims or keep thin wrappers. **This is the riskiest method; do it last (Phase 4).** |
| `setCustomHeader` | `Core.setCustomHeader` | **M**: keep `this._customHeader`. |
| `disconnect` / `exitChatRoom` | `Core.closeRealtimeConnection` + clear `selected` | **M**. |
| `logging`/`logger` | `Core.getLogger` / keep as-is | trivial. |

### 6.2 Auth / user
| v2 method | core-v3 | Notes |
|---|---|---|
| `setUser(userId,key,username,avatarURL,extras)` | `Core.setUser` | **T,M,E**: on success set `this.userData`, `this.isLogin=true`, `this.user_id`; emit `'login-success'`/equivalent v2 event; connect realtime. Map `IQAccount`→v2 `userData` shape. |
| `setUserWithIdentityToken(data)` | `Core.setUserWithIdentityToken` | **T,M,E**. |
| `verifyIdentityToken` / `getNonce` | `Core.getJWTNonce` + verify | **T**. |
| `updateProfile(user)` | `Core.updateUser` | **T,M**: update `this.userData`. |
| `getNonce` | `Core.getJWTNonce` | **T**. |
| `getUserProfile`/`getUserData` | `Core.getUserData` | **T,M**. |
| `blockUser`/`unblockUser`/`getBlockedUser` | `Core.blockUser`/`unblockUser`/`getBlockedUsers` | **T**: map `IQUser`→v2 user. |
| `getUsers` | `Core.getUsers` | **T**. |
| `getUserPresences`/`subscribeUserPresence`/`unsubscribeUserPresence` | `Core.subscribeUserOnlinePresence`/`unsubscribe…` + `Core.getUsers`? | **T,E**: re-emit `'presence'`. |
| `refreshAuthToken`/`_autoRefreshToken`/`logout` | **Proposal P-1** (§13) | core-v3 has **no** token-refresh path today → blocked on P-1 landing. The expiry-timer scheduler stays in the shell; `Core.refreshToken`/`Core.logout` do the network call. |

### 6.3 Rooms
> **All rows that return a `Room`/`Comment` are R:** call the shared usecase (raw
> adapters → raw `resp`), then build the model from `resp.results.*`. Participant/count
> returns are U.

| v2 method | core-v3 usecase | Notes |
|---|---|---|
| `chatTarget(userId, options)` | `Core.chatUser(deps, userId, extras)` | **R,M**: build `Room` from `resp.results.room`(+`comments`), set as `this.selected` (calls `setActiveRoom`), update `rooms`/`room_name_id_map`. See worked example in §14. |
| `chatGroup(id)` | `Core.getChatRoomWithMessages`? / `Core.chatUser` group path | **T,M**. |
| `getRoomById(id)` | `Core.getChatRoomWithMessages(id)` | **T,M**: returns `[IQChatRoom, IQMessage[]]` → build `Room` with `comments`. |
| `getOrCreateRoomByUniqueId` | `Core.getChannel`/`createChannel` | **T**. |
| `getOrCreateRoomByChannel(channel,name,avatar)` | `Core.getChannel`/`createChannel` | **T**. |
| `createGroupRoom(name,emails,options)` | `Core.createGroupChat` | **T**. |
| `updateRoom(args)` | `Core.updateChatRoom` | **T**. |
| `addParticipantsToGroup` | `Core.addParticipants` | **T**: map `IQParticipant[]`. |
| `removeParticipantsFromGroup` / `removeSelectedRoomParticipants` | `Core.removeParticipants` | **T,M**: the `removeSelected…` variant also mutates `this.selected.participants` (index.js:1647) — keep. |
| `getParticipants`/`getRoomParticipants` | `Core.getParticipants` | **T**: note v2 has two arity variants (page/limit vs offset). |
| `getRoomsInfo(params)` | `Core.getChatRooms`/`getAllChatRooms` | **T**. |
| `getTotalUnreadCount` | `Core.getTotalUnreadCount` | direct. |
| `getRoomUnreadCount` | `Core.getRoomUnreadCount` | direct. |
| `clearRoomMessages(roomIds)` | `Core.clearMessagesByChatRoomId` | **T,E**. |
| `clearRoomsCache`/`clearRoomMessages` | local state + `Core.*` | **M**: reset `this.rooms`/`selected`. |

### 6.4 Messages
> Same rule as §6.3: message-list reads are **R** — build `Comment` from
> `resp.results.comments[i]`. Status/void actions are **U**.

| v2 method | core-v3 usecase | Notes |
|---|---|---|
| `sendComment` / `prepareCommentToBeSubmitted` / `resendComment` | `Core.sendMessage(deps, msg)` | **R,M,E**: v2 builds a pending `Comment`, pushes to `selected.comments` (optimistic), reconciles on success. Preserve optimistic-push + `pendingCommentId` + `_pendingComments` retry. Build the usecase input from the v2 comment (`compat/to-v3.js`); wrap the raw `resp.results.comment`→`Comment`. |
| `loadComments(roomId,options)` | `Core.getPreviousMessagesById(deps, …)` | **R,M**: populate `selected.comments` from raw. |
| `loadMore(lastCommentId,options)` | `Core.getPreviousMessagesById(deps, …)` | **R,M**: prepend older (raw). |
| `deleteComment(roomId,uniqueIds,forEveryone,isHard)` | `Core.deleteMessages` | **T,M,E**: remove from `selected.comments`, emit `'comment-deleted'`. |
| `updateCommentStatus`/`readComment`/`receiveComment`/`_updateStatus`/`_setRead`/`_setDelivered` | `Core.markAsRead`/`markAsDelivered` | **T,M**: these mutate `selected.comments[i].status` in place — keep exactly. |
| `searchMessages` (if present) | `Core.searchMessage` | **T**. |
| `getThumbnailURL`/`getBlurryThumbnailURL` | `Core.getThumbnailURL` (+ v2's blur variant stays local) | trivial. |
| `upload(file,cb)` | `Core.upload` | **T,E**: keep progress callback shape + `this.uploadedFiles`. |
| `uploadFile(roomId,file)` | `Core.upload` + `Core.sendFileMessage` | **T,M,E**. |
| `addUploadedFile`/`removeUploadedFile` | local | **M**: `this.uploadedFiles`. |
| `_generateUniqueId`/`generateMessage`/`generateFileAttachmentMessage`/`generateCustomMessage`/`generateReplyMessage` | `Core._generateUniqueId`/`Core.generate*` | **T**: core-v3 returns `IQMessage`; v2 returns its own payload shape — translate or keep v2's generators if shapes differ (low risk to keep v2's, since they're pure). **Prefer keeping v2's generators** unless they must match `sendMessage`'s expected input. |

### 6.5 Realtime / custom events / typing / presence
| v2 method | core-v3 | Notes |
|---|---|---|
| `publishTyping(val)` | `Core.publishTyping` | **M**: v2 also flips `this.isTypingStatus` (mutated by MqttAdapter today). Keep. |
| `publishOnlinePresence(val)` | `Core.publishOnlinePresence` | direct. |
| `publishEvent`/`subscribeEvent`/`unsubscribeEvent` | `Core.publishCustomEvent`/`subscribeCustomEvent`/`unsubscribeCustomEvent` | **T,E**. |
| `subscribeUserPresence`/`unsubscribeUserPresence` | `Core.subscribeUserOnlinePresence`/`unsubscribe…` | **E**. |
| `onReconnectMqtt` | realtime bridge reconnect | **E**: `options.onReconnectCallback`. |

### 6.6 Hooks
| v2 method | core-v3 | Notes |
|---|---|---|
| `intercept(interceptor, callback)` | `self._hookAdapter.intercept` (already core-v3's `hookAdapterFactory`) | v2 already imports `hookAdapterFactory`/`Hooks` from `./lib/adapters/hook` — **switch that import to `@qiscus/core-v3`** so both versions share one hook implementation. Verify `Hooks` enum values match. |

> The `MESSAGE_BEFORE_RECEIVED` hook is triggered in `init()`'s realtime handlers
> (lines 329, 381). The realtime bridge must keep triggering it before emitting
> `'newmessages'`.

---

## 7. The realtime bridge (the second hard part)

`init()` today wires three side-effects per realtime/sync event. Reproduce all three
in `compat/realtime-bridge.js`, driven by core-v3 `on*` subscriptions:

```js
// compat/realtime-bridge.js  (illustrative)
export function subscribeRealtime(self, deps) {
  const subs = []
  subs.push(Core.onMessageReceived(deps, /*stream*/, async (msg) => {
    const triggered = await self._hookAdapter.trigger(Core.Hooks.MESSAGE_BEFORE_RECEIVED, msg)
    const raw = toV2RawComment(triggered)           // T — see "realtime raw" note below
    if (self.selected != null && raw.room_id === self.selected.id) { // M
      const i = self.selected.comments.findIndex(c => c.id === raw.id || c.unique_id === raw.unique_temp_id)
      if (i === -1) { self.selected.comments.push(new Comment(raw)); self.sortComments() }
    }
    self.events.emit('newmessages', [raw])          // E
  }))
  subs.push(Core.onMessageDelivered(deps, /*…*/, m => self._setDelivered(...)))  // M
  subs.push(Core.onMessageRead(deps,      /*…*/, m => self._setRead(...)))       // M
  subs.push(Core.onMessageDeleted(deps,   /*…*/, d => self.events.emit('comment-deleted', d)))
  subs.push(Core.onRoomCleared(deps,      /*…*/, d => self.events.emit('room-cleared', d)))
  // typing / room-typing / presence → emit the SAME mitt payloads as index.js:344–367
  // reconnect → self.options.onReconnectCallback?.() ; update last_received_comment_id
  self._realtimeSubs = subs
}
```

**Critical:** match the **exact mitt payload shapes** from `init()` (lines 333–367),
including the `'typing'` `{message, username, room_id}` remap and the `'room-typing'`
dual-emit + `options.onRoomTypingCallback`.

**Realtime raw — split happens HERE, together with this bridge (deferred from the core
refactor).** Scope decision (2026-07-02, option A): the core-v3 decode-module refactor
did the HTTP raw split (Phases A+B) but **deferred the realtime-stream split** to this
v2 realtime work, since it's deep surgery into `mqtt.ts`/`sync.ts` whose only consumer is
this bridge. So **as part of building `compat/realtime-bridge.js`, also split the core-v3
realtime path**: make `mqtt.ts`/`sync.ts` expose a **raw payload stream** (shared) in
addition to the existing `Decoder.message`-mapped stream (which v3 keeps using). v2's
bridge subscribes to the **raw** stream, so `onMessageReceived` hands v2 raw JSON — feed
it straight to `new Comment()`, no `IQMessage→raw` remap. `MESSAGE_BEFORE_RECEIVED` still
fires before the emit; the `selected` mutation + `'newmessages'` payload stay identical.
v3's decoded realtime streams must remain byte-for-byte unchanged (guarded by the 74
core-v3 tests). Note: the unified reconnect policy (§4a of the refactor plan) lands
separately/earlier and is independent of this split.

**Sync vs MQTT:** v2 ran *both* `MqttAdapter` and a `SyncAdapter` HTTP-polling
fallback feeding the same bus. core-v3 already has a `synchronize` usecase. Decide in
Phase 0 whether core-v3's realtime adapter already includes the sync-fallback (so we
drop v2's `SyncAdapter`) or whether we keep driving `Core.synchronize` on an interval
from the shell. **Do not lose the offline-sync behavior** — it is observable
(messages still arrive when MQTT is down).

---

## 8. Known feature gaps to resolve BEFORE coding (Phase 0 spike)

From `docs/features.md`, v2 has surface with no obvious 1:1 v3 usecase. For each,
confirm the core-v3 path **before** writing the method. When there is no 1:1 path,
classify it (this is the output of Phase 0) into one of three buckets:

- **`keep-in-shell`** — a v2-only convenience (selected-room state, optimistic-send,
  `room_name_id_map`, blur thumbnail, status throttling). Implement it in the v2
  shell on top of core-v3 primitives. Default bucket; no escalation needed.
- **`propose-core-v3`** — logic that *should* be shared by both versions or would
  bloat/duplicate the shell if kept local. Per §2's gated exception: **STOP, write
  the proposal (capability + why-core-v3 + signature), escalate to Opus + the user.**
  Do not implement the core-v3 change until approved; meanwhile proceed on other
  methods.
- **`BLOCKER`** — v2 behavior with no core-v3 primitive *and* not reasonable to build
  in the shell. STOP and escalate.

For each item below, record the bucket in `docs/v2-core-v3-gaps.md`. The buckets
below are **pre-classified from an actual code scan of core-v3** — Phase 0 only
*validates* them, it does not re-discover from scratch:

- **Offline HTTP sync loop** — **`covered-by-core-v3`.** Verified: core-v3 already has
  `getSyncAdapter`/`synchronizeFactory` (`adapters/sync.ts`) with `shouldSync`,
  per-connection-state interval (`getSyncInterval` vs `getSyncIntervalWhenConnected`),
  and `getForceDisableSync`, merged into the realtime streams
  (`adapters/realtime.ts`: `xs.merge(fromSync(sync.on…), fromSync(mqtt.on…))`), plus
  `startSync`/`stopSync`/`synchronize`/`setSyncInterval` usecases. **Drop v2's
  `SyncAdapter`; drive sync via core-v3.** Phase 0 only confirms the polling cadence &
  `last_message_id` advance match v2's observable behavior.
- **Auth auto-refresh** (`_autoRefreshToken`, `ExpiredTokenAdapter`) —
  **`propose-core-v3` (APPROVED to propose; final API pending Opus + user sign-off).**
  Verified: **core-v3 has no token-refresh path at all** (zero matches for
  `refreshToken`/`auto_refresh`/`onTokenExpired`/`401`-handling across the package).
  This is almost certainly a feature that was **forgotten during the v3 rewrite**, not
  a deliberate omission. It is transport/auth infrastructure that **v3 itself will
  need**, so it belongs in core-v3, not duplicated into the v2 shell. See the
  **Proposal P-1** appendix below for the sketch. Executor must still land the core-v3
  change as its **own reviewed step** before wiring `refreshAuthToken` in v2.
- **Optimistic send + retry** (`_pendingComments`, `_retrySendComment`,
  `resendComment`) — **`keep-in-shell`.** core-v3 `sendMessage` is fire-and-resolve;
  the optimistic push/reconcile/retry is v2 shell behavior kept on top of core-v3.
- **`withConfig` / `api/v2/sdk/config` negotiation** — the `setterHelper`/`mqttWssCheck`
  block (lines 205–296). Phase 0 checks whether core-v3's `setup` performs the same
  negotiation; if not (**likely `keep-in-shell`**), keep this block in the v2 shell and
  only push resolved values into core-v3 storage.
- **`getBlurryThumbnailURL`**, **`UpdateCommentStatusMode` throttling**,
  **`room_name_id_map`** — **`keep-in-shell`** (v2-only conveniences).

Output of Phase 0: a short `docs/v2-core-v3-gaps.md` listing each gap as
`covered-by-core-v3` / `keep-in-shell` / `propose-core-v3` (escalated) / `BLOCKER`.

---

## 9. Phasing (each phase independently shippable & reversible)

> Per repo workflow: **Opus plans (this doc); Sonnet sub-agents execute.** Phases are
> sequential because they share `index.js` and the `compat/` contract. Within a phase,
> only parallelize across **disjoint files** (see notes). Keep both versions building
> (`pnpm -r run build`) after every phase.

**Phase 0 — Spike & contracts (1 Sonnet, sequential).**
Add `@qiscus/core-v3: "workspace:*"` to `version-2/package.json`. Stand up
`compat/deps.js` and verify a `QiscusDeps` built from v2 config can perform **one**
read call through core-v3 (e.g. `Core.getUsers`) against the existing test mocks.
Write `compat/to-v2.js` skeletons (`toV2RawComment`, `toV2RawRoom`, `toV2User`) with a
field-by-field mapping derived from `lib/Comment.js`/`lib/Room.js`. Produce
`docs/v2-core-v3-gaps.md` (§8). **No public method rewired yet.** Switch the `hook`
import to `@qiscus/core-v3` and verify `Hooks` enum parity.

**Phase 1 — Stateless read methods (1 Sonnet).**
Rewire the pure request/response methods that **don't touch `selected` or realtime**:
`getUsers`, `getBlockedUser`, `blockUser`, `unblockUser`, `getUserPresences`,
`getParticipants`/`getRoomParticipants`, `getRoomsInfo`, `getTotalUnreadCount`,
`getRoomUnreadCount`, `getNonce`, `getUserProfile`. Each: `Core.*` → `to-v2` →
return. Add parity assertions (shape equality vs old impl) where mocks allow.

**Phase 2 — Room/selected lifecycle (1 Sonnet).**
Rewire `chatTarget`, `chatGroup`, `getRoomById`, `getOrCreateRoomBy*`,
`createGroupRoom`, `updateRoom`, participant add/remove, `clearRoomMessages`,
`clearRoomsCache`. Keep `setActiveRoom`/`exitChatRoom`/`sortComments` as the
state machine; only change the **data source** to core-v3 + `to-v2`. Preserve every
`this.selected`/`this.rooms`/`this.room_name_id_map` mutation.

**Phase 3 — Messages (1 Sonnet).**
Rewire `loadComments`, `loadMore`, send/resend/prepare, delete, status
(`readComment`/`receiveComment`/`_setRead`/`_setDelivered`/`_updateStatus`),
upload/`uploadFile`, generators. Preserve optimistic-send + `_pendingComments` retry +
`selected.comments` mutations + status-throttle behavior.

**Phase 4 — Realtime, sync & `init()` (1 Sonnet, last & riskiest).**
Implement `compat/realtime-bridge.js`; replace the `MqttAdapter`/`SyncAdapter`/
`CustomEventAdapter` wiring in `init()` with core-v3 `getRealtimeAdapter` +
`on*` subscriptions + (if needed) a `Core.synchronize` interval. Keep
`this.realtimeAdapter`/`this.HTTPAdapter`/`this.syncAdapter`/`this.customEventAdapter`
field references pointing at core-v3-backed objects (consumers and the bridge read
them). Rewire `publishTyping`/`publishOnlinePresence`/`publish|subscribe|unsubscribeEvent`/
`subscribeUserPresence`. Trigger `MESSAGE_BEFORE_RECEIVED` before emit. Preserve all
mitt payloads & `options.*Callback`.

**Phase 5 — Cleanup (1 Sonnet, only after 1–4 verified).**
Delete now-dead `lib/adapters/*` (http, user, room, mqtt, sync, auth, expired-token,
custom-event) and dead helpers — **only those with zero remaining references.** Keep
`Comment.js`, `Room.js`, and any util still used. Re-run full build + tests.

---

## 10. Verification (run after every phase)

1. `pnpm install` at root (links `@qiscus/core-v3`).
2. `pnpm -r run build` exits 0; `version-2` lib/dist and `version-3` dist both
   regenerate with non-zero size.
3. `version-2` existing test suite (if any) passes; add parity tests per phase.
4. **Public-surface diff (the key gate):** snapshot the shape of `new QiscusSDK()` —
   list own + prototype method names and constructor field names — **before** Phase 1
   and after each phase; the set must be unchanged (only internals differ). Smoke:
   `node -e "const Q=require('./packages/version-2/dist/...'); const q=new Q.default(); console.log(Object.getOwnPropertyNames(q).sort().join(','))"`
   and compare to a baseline captured at Phase 0.
5. Event-payload parity: unit-test the realtime bridge emits the same `mitt` payloads
   as the old `init()` handlers for each event type.
6. `git status` clean after asked-for commits; nothing pushed.

---

## 11. Risks & watch-list

- **Model mapping drift** — *greatly reduced* by raw-passthrough (§3): raw-read mode
  feeds `Comment`/`Room` the same backend JSON they always used, so `compat/to-v2.js`
  is a near-identity normalizer, not a lossy IQ→raw reconstructor. Still unit-test the
  normalizers field-by-field against real API JSON fixtures (reuse v2 fixtures /
  `mocks/`). The residual mapping risk concentrates in the **realtime message** path
  (§7 "realtime raw").
- **Lost mutation timing** — a method that returns the right value but stops mutating
  `this.selected`/`this.rooms` will silently break Vue reactivity. The §10.4 diff
  catches *missing fields*, not *missing mutations* — so **each phase must keep the
  exact mutation lines** and the realtime-bridge unit tests must assert them.
- **Config negotiation** — if core-v3's `setup` doesn't replicate `withConfig`, keep
  v2's block and only forward resolved values to storage; don't drop it.
- **Sync fallback** — offline HTTP sync is already in core-v3 (`adapters/sync.ts`);
  the risk is *behavioral drift* (cadence, `last_message_id` advance), not absence.
- **core-v3 storage liveness** — post-`init()` mutation of `baseURL`/`mqttURL` must
  reach core-v3 storage; decide getter-backed vs reseed in Phase 0.
- **Hook enum parity** — switching `Hooks` source must not change string values.
- **Scope creep** — resist "fixing" v2 quirks. Quirks are the spec.

## 12. Out of scope

- No public API/behavior changes, no field renames, no dependency upgrades beyond
  adding `@qiscus/core-v3`.
- The `version-3` **shell** stays byte-for-byte. `@qiscus/core-v3` itself IS
  restructured — but by the separate [`core-v3-decode-module-refactor.md`](./core-v3-decode-module-refactor.md),
  which lands first. This v2 plan then only **consumes** the resulting raw surface; the
  one remaining gated logic addition is Proposal P-1 (token refresh) in §13. (P-2 was
  dropped — absorbed by the refactor.)
- `sample-js` untouched (its `link:` path is a separate follow-up).
- No npm publish; no push.

---

## 13. Appendix — core-v3 change proposals (gated)

### P-2: ~~barrel re-exports for raw-passthrough~~ — DROPPED (absorbed by the refactor)

Superseded. The raw surface is no longer a "seam to export" — after
`core-v3-decode-module-refactor.md`, the **root barrel of `@qiscus/core-v3` IS the raw
/ version-agnostic public surface** (raw adapters, `Api`, `Provider`, storage, shared
usecases). v2 consumes that directly; there is nothing extra to expose. `Decoder` +
`IQ*` live in the `v3/` module. No separate P-2 change is needed.

### P-1: token auto-refresh in core-v3

**Status:** approved to propose (user, 2026-07-01). Final API + implementation still
need Opus + user sign-off and must land as their **own reviewed commit** before v2's
`refreshAuthToken`/`logout` are wired to it. **Rationale:** core-v3 currently has *no*
token-refresh path; this was very likely forgotten in the v3 rewrite. It is auth
infrastructure both versions need. **Home:** the **shared `auth/` surface** of
`@qiscus/core-v3` (created by the decode-module refactor), so v2 **and** v3 consume the
same refresh/logout usecases.

**What v2 does today** (`lib/adapters/expired-token.js`, gated by the
`auto_refresh_token` config flag → `this._autoRefreshToken`):
- On login, given a `refresh_token` + `token_expires_at`, schedule a `setTimeout` that
  fires at expiry.
- On fire (only if still authenticated): `POST api/v2/sdk/refresh_user_token`
  `{ user_id, refresh_token }` → `{ token, refresh_token, token_expires_at }`; update
  the stored access token, keep the new refresh token, re-arm the timer, and invoke an
  `onTokenRefreshed(token, refreshToken, expiredAt, oldToken)` callback.
- `refreshAuthToken()` — manual trigger of the same flow.
- `logout()` — `POST api/v2/sdk/logout` `{ user_id, token }`.

**Proposed core-v3 shape** (to confirm with Opus + user — do **not** implement yet):
- New adapter method(s) on the user/auth adapter, e.g.
  `userAdapter.refreshToken(refreshToken): Promise<{ token; refreshToken; expiresAt }>`
  and `userAdapter.logout(): Promise<void>` (verify `logout` doesn't already exist).
- A usecase pair `refreshToken(deps, callback?)` and `logout(deps, callback?)`, plus
  storage fields for `refreshToken`/`tokenExpiresAt` and an opt-in
  `auto_refresh_token` flag surfaced through `setup`'s config negotiation.
- The **auto-refresh scheduler** (the `setTimeout` timer) is stateful/lifecycle: keep
  it in the **v2 shell** (and later v3 shell), driven by the core-v3 usecase — i.e.
  core-v3 provides the *refresh call + token update*, the shell owns *when* to call it.
  This keeps core-v3 free of hidden timers while still centralizing the auth logic.

**v2 wiring after P-1 lands:** `refreshAuthToken()` → `Core.refreshToken(deps)`;
the `disconnect`/logout path → `Core.logout(deps)`; the expiry timer stays a shell
concern reading `token_expires_at` from storage. The `onTokenRefreshed` callback and
`auto_refresh_token` gating remain observable v2 behavior and must be preserved.

---

## 14. Worked example — `chatTarget` (template for R-mode methods)

Shows the whole pattern end-to-end: the shell keeps its exact behavior; only the fetch
line changes to a shared raw usecase, and raw feeds v2's own `Room`/`Comment`.

**Original v2** (`index.js`) fetches via `this.roomAdapter.getOrCreateRoom(...)`, whose
old adapter massaged the raw response (`room.avatar = room.avatar_url`,
`room.comments = results.comments.reverse()`, `room.name = rival.username`) before
`new Room(resp)`.

**`compat/to-v2.js`** — the near-identity normalizer (the massaging that used to live in
v2's adapter, now applied to core-v3's raw `resp`):
```js
export function rawRoomToV2(resp, targetEmail) {
  const room = resp.results.room
  room.avatar = room.avatar_url
  room.comments = resp.results.comments.reverse()
  const rival = room.participants?.find((p) => p.email === targetEmail)
  room.name = rival ? rival.username : 'Room name'
  return room // shape `new Room()` already expects (raw snake_case)
}
```

**`index.js` `chatTarget`** — diff from today is the **one fetch line**; everything else
(mutations `isLoading`/`isTypingStatus`, hook trigger, `setActiveRoom`, `readComment`,
`chat-room-created` emit, `initialMessage` branch, error handling) is byte-for-byte:
```js
import * as Core from '@qiscus/core-v3'
import { rawRoomToV2 } from './compat/to-v2'
// Hooks now from @qiscus/core-v3 (§6.6)

chatTarget(userId, options = {}) {
  if (this.userData.length != null) return false
  const initialMessage = options ? options.message : null

  this.isLoading = true          // ← public mutation: preserved
  this.isTypingStatus = ''       // ← public mutation: preserved

  // ▼▼▼ the only changed line: shared raw usecase instead of v2's own adapter ▼▼▼
  return Core.chatUser(this.deps, userId, options)   // deps has RAW adapters → raw resp
  //   (was: this.roomAdapter.getOrCreateRoom(userId, options, distinctId))
  // ▲▲▲──────────────────────────────────────────────────────────────────────▲▲▲
    .then(async (resp) => {
      const room = new Room(rawRoomToV2(resp, userId))   // v2's own model, unchanged

      this.updateLastReceivedComment(room.last_comment_id)
      this.isLoading = false

      const mapIntercept = (it) =>
        this._hookAdapter.trigger(Core.Hooks.MESSAGE_BEFORE_RECEIVED, it)
      room.comments = await Promise.all(room.comments.map(mapIntercept))

      this.setActiveRoom(room)                            // sets this.selected + subscribes
      const lastComment = room.comments[room.comments.length - 1]
      if (lastComment) this.readComment(room.id, lastComment.id)
      this.events.emit('chat-room-created', { room })     // mitt event: preserved

      if (!initialMessage) return room
      return this.sendComment(room.id, initialMessage)
        .then(() => room)
        .catch((err) => { console.error('Error when submit comment', err) })
    })
    .catch((err) => {
      console.error('Error when creating room', err)
      this.isLoading = false
      return Promise.reject(err)
    })
}
```

**Parity checks for Phase 1/2** (per §4 bypass caveat): confirm `Core.chatUser`'s
request body matches v2's old `get_or_create_room_with_target` call — v2 sent
`emails: <single string>` and only included `options` when present, and supported a
`distinctId` param. If `Core.chatUser`'s validation/`bufferUntil` or body shape diverges
observably, either extend the usecase input or (exception) bypass to the raw adapter for
this method. Everything else stays as above.
