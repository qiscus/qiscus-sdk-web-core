# Plan: make v2 a thin shell — move ALL logic (incl. transport & realtime connection) into core-v3

**Status:** CONFIRMED (2026-07-07). User approved adding all 3 missing features to core-v3
(**upload**, **getUserPresences**, **deleteMessages flags**) and starting with **P1a**
(HttpAdapter error-shape characterization tests). Supersedes the "transport-per-shell" boundary
adopted in §4a of `v2-on-core-v3-plan.md` and the "keep v2 realtime native" stance — the
user's goal is **single source of truth for ALL logic**, with `version-2`'s `index.js`
reduced to a state-only shell like `version-3`'s `index.ts`.

## 1. Goal & hard constraints

- **v2 `index.js` becomes a state-only shell** mirroring `version-3/src/index.ts`: holds the
  mutable state + adapters, constructs its own `Comment`/`Room` models, and **delegates every
  public method to core-v3** — no transport, no HTTP/MQTT/sync logic, no business
  orchestration left in the shell.
- **All logic lives once in `@qiscus/core-v3`.** A new feature is written once; both shells
  get it. Features v3 lacks are added to core-v3 (after the confirmation in §5).
- **PRESERVE v2's public mutable variables + their mutations** byte-for-byte (Vue UI reads and
  writes `qiscus.selected`, `qiscus.rooms`, `qiscus.mqttURL`, `qiscus.isLogin`, `qiscus.userData`,
  `qiscus.isTypingStatus`, `qiscus.isLoading`, `qiscus.options`, …). The shell keeps owning
  this state; core-v3 mutates it via dependency injection (like v3's `deps`).
- **PRESERVE v2's public behavior byte-for-byte** — including the superagent error shape
  (`err.response.body`, whole-`res` rejections), the 403 refresh-retry, exact headers, mitt
  event payloads, and the `Comment`/`Room` model shapes.

The tension: constraints 2 (single source) and 4 (byte-parity) collide hardest at the
**transport error shape** and the **realtime connection behavior**. This plan resolves that by
moving the LOGIC to core-v3 while reproducing v2's exact observable shapes through **thin
per-shell adapters** — the same pattern that worked for realtime parsing (§ realtime, done).

## 2. What is still v2-owned logic today (the delete list)

After the HTTP + realtime-parsing re-platform, these still live in v2 and must move:

1. **HTTP transport** — `lib/adapters/http.js` (`HttpAdapter`, superagent): GET/POST/PUT/PATCH/
   DELETE, `setupHeaders` (QISCUS-SDK-*), `_retryHelper` (403 "token expired" refresh-retry).
   Today every re-platformed method routes here via `compat/requester.js` (`makeV2Requester`).
   core-v3 has its own axios transport (`makeApiRequest`) — so transport logic is DUPLICATED.
2. **Realtime connection** — `lib/adapters/mqtt.js` `MqttAdapter` (connect, LB-reconnect §4a,
   subscribe/publish buffers, ~20 facade methods), `lib/adapters/sync.js` `SyncAdapter`
   (HTTP-poll loop). Parsing already moved to core-v3 (`parseRealtimeEvent`,
   `classifySyncEvents`); the CONNECTION + polling loop + facade did not.
3. **Keep-in-shell HTTP methods** (still on `userAdapter`/`HTTPAdapter`): `deleteComment`,
   `clearRoomMessages`, `searchMessages`, `getUserPresences`, `upload`/`uploadFile`/
   `sendFileMessage`, `getNonce`, `verifyIdentityToken`.
4. **Business orchestration in the shell** — the code AROUND the raw-adapter calls that the
   re-platform left in place: optimistic-send (`_pendingComments` retry, `markAsSent`),
   `chatTarget`/`getRoomById` hook+`setActiveRoom`+`readComment`+`subscribeChannel` flows, the
   `setActiveRoom`/`exitChatRoom`/`sortComments` state machine, `isTypingStatus` mutation.
5. **`_legacy*` copies** (29) — dead parity-reference bodies (removed at the end).
6. **Auth/misc** — `lib/adapters/auth.js`, `expired-token.js`.

Legitimately STAYS in the shell (this is what makes it a "shell", not "empty"): the mutable
state fields, the `Comment`/`Room` model classes + their construction from raw (v2's output
contract, the analogue of v3's `IQ`/`Decoder`), the mitt event emitter, the singleton, and
the one-line public-method delegations.

## 3. Target architecture

Mirror v3's shell. Core-v3's usecases must become **model-agnostic** so BOTH shells share them:

```
core-v3 (single source of ALL logic)
  transport: makeApiRequest (axios)  ── the only HTTP client
  Api.* request builders + raw adapters (return RAW json)     [done]
  realtime: parseRealtimeEvent / classifySyncEvents / getMqttAdapter (connection)
  usecases (model-agnostic): take a `deps` bundle, return RAW / call injected
     side-effect callbacks (construct-model, mutate-state, emit) — NEVER build IQ or Comment
        │                                   │
   version-3 shell                     version-2 shell
   deps: v3 storage + adapters         deps: v2 state + adapters + v2 error-adapter
   thin adapter: raw -> Decoder -> IQ  thin adapter: raw -> new Comment()/new Room()
   holds IQ-shaped state               holds v2 mutable vars (selected/rooms/…) — PRESERVED
   1-line delegations                  1-line delegations
```

Two thin per-shell adapters absorb the byte-parity-critical differences:

- **Transport error-shape adapter (v2):** core-v3 axios rejects with `err.response.data`;
  v2's contract is superagent's `err.response.body` (+ whole-`res` rejections, `.status`,
  `.text`). A small v2 wrapper over `makeApiRequest` reproduces the superagent-shaped error
  (and moves the 403 refresh-retry + QISCUS-SDK-* headers into core-v3 as configurable
  transport behavior). Then `HttpAdapter` is deleted. **This is the #1 risk — pin it with
  error-shape characterization tests first (like we did for MQTT emit shapes).**
- **Realtime connection (v2):** use core-v3 `getMqttAdapter` for the connection + a
  capability flag to disable the 3.5s presence heartbeat for v2 (Fable). The v2 facade (~20
  subscribe/publish methods) becomes thin delegations to it. Then v2's `MqttAdapter`
  connection is deleted (its parsing already left).

Model-agnostic usecases: the current core-v3 usecases (`usecases/*.ts`) return `IQ` and use
xstream. They get refactored so the decode/model-construction and state-mutation are injected
(v3 injects `Decoder`+IQ-state; v2 injects `new Comment/Room`+its mutable-var mutations). This
is the largest single piece and is what lets orchestration (optimistic-send, chatTarget flow)
live once.

## 4. Phasing (each phase: green build + parity tests + nothing pushed)

- **P1 — Transport unification — DONE (`50ad9b4` P1a, `beaad9f` P1b, `aca5413` P1c).**
  - P1a ✅: `http-adapter.characterization.test.js` pins HttpAdapter's superagent contract
    (resolve `res.body`/`.status`, reject `err.status`/`err.response.{status,body}`, headers,
    403-retry) against a real local server (6 tests).
  - P1b ✅: `compat/axios-requester.js` `makeV2AxiosRequester` over core-v3's shared
    `makeApiRequest` (axios) reproduces that contract (adds QISCUS-SDK-PLATFORM, 403
    refresh-retry, axios→superagent error re-shape); proven by `axios-requester.test.js`.
  - P1c ✅: `makeDeps` defaults to the axios requester (seeds `storage.version`, wires
    `refreshToken`→`self.refreshAuthToken`+storage); parity tests inject the legacy
    `makeV2Requester(stub)` to stay network-free; `deps-axios-integration.test.js` proves the
    PRODUCTION axios path end-to-end. compat 69/69. **HttpAdapter NOT yet deleted** — it stays
    as the token store + is used by the keep-in-shell methods; delete after P2 + token
    migration.
- **P2 — Keep-in-shell HTTP methods → core-v3 — DONE (for the approved scope).**
  - Added the 3 approved primitives: `getUserPresences` (`81b0d87`), `deleteMessages` flags
    (`1ba4213`), `upload` (`4edc5c0`, core-v3 `getUploadAdapter` = axios+FormData+progress;
    `deps.uploadAdapter`).
  - Re-platformed: `getUserPresences`, `deleteComment` (+ flags), `clearRoomMessages`
    (`2c3e76e`), `getNonce`/`verifyIdentityToken` (`d93774a`), `upload`/`uploadFile`,
    `register`/`removeDeviceToken` (`88b0936`), `searchMessage` (V2, `/search`) + `getFileList`
    (`5117fa5`). Each with parity/adaptation tests (compat 78). `request` (superagent) import
    dropped from index.js.
  - **Only 3 live HTTP calls remain in the shell** (verified by scan), all by design:
    (a) `init()`'s `config` negotiation → deferred to **P4** (setup/orchestration);
    (b) `searchMessages` (deprecated) — see below; (c) `getRoomParticipants(roomUniqueId,
    offset)` (deprecated; core-v3's `getParticipants` has no `offset`) — stays legacy.
  - **EXCEPTION — `searchMessages` stays on legacy:** it's deprecated AND core-v3's
    `Api.searchMessages` (v1) uses `page` where old v2 sent `last_comment_id` — matching it
    needs a gated fix for a deprecated method (not worth it). Documented.
  - **HttpAdapter still not deletable** — used by the `_legacy*` refs (removed in P5), the 2
    deprecated methods above, `init()`'s config call (P4), and as the token store. Delete
    after P4 + P5 + token migration.
  - **Upload caveat:** the real multipart transfer is browser-runtime (axios+FormData+
    onUploadProgress), unit-tested only at the v2 adaptation level (progress/callback/resolve)
    with an injected stub — verify in a real browser before shipping.
- **P3 — Realtime connection → core-v3 — DONE (MQTT + SyncAdapter, Fable-reviewed).**
  - Fable review surfaced 5 divergences + core-v3 bugs; user decided: reconnect UNIFIES on
    core-v3 backoff; all core-v3 changes approved; build P3a→P3c behind tests, defer soak.
  - **P3a** (`420eace`): `mqtt-facade.characterization.test.js` pins v2's MqttAdapter facade
    (topics, buffering, disconnect, presence/typing payloads, mitt) via an injected `connect`
    seam — the oracle (26 tests).
  - **P3b** (`96e949e`): core-v3 `getMqttAdapter` made delegatable — `enableHeartbeat` opt,
    buffered generic `subscribe/unsubscribe/publish` (domain methods routed through them), 4th
    `r/{id}/typing` topic on subscribeRoom, null-user tolerance at conneck, fixes
    (`_getClientId` return, stacked-interval leak, dropped stale `cacheUrl`), `onMqttClose`/
    `onMqttError`. +7 core-v3 tests. `connect` injection seam (`0ac21c3`).
  - **P3c** (`ef52df9`): v2 `MqttAdapter` rewritten to a thin facade wrapping
    `getMqttAdapter(storageFacade, {enableHeartbeat:false, getClientId, connect})`; storage
    facade bound LIVE to `core.mqttURL`/`user_id`/`userData`/`enableLb`; core events bridged to
    v2's mitt; raw `onMessage` → unchanged `__mqtt_message_handler` (single-source parse). v2's
    own MqttAdapter connection code deleted. compat 104/104, core-v3 97, v2 test 20/1
    (pre-existing), all builds green.
  - **ACCEPTED divergences (need P3d two-client soak to confirm safe):** (1) reconnect cadence
    fixed-1s → exponential backoff 1s→30s + suppress lib-retry (changes `onReconnectCallback`
    timing); (2) LWT `will.payload` `0` (number) → `'0'` (string) + `qos:1` — retained-status
    subscribers parse via `Number()` so `'0'` is safe, but LWT-firing must be verified live;
    (3) `disconnect()` emits N per-topic UNSUBSCRIBE packets instead of 1 array packet (same
    broker effect); (4) LB-node fetch now carries auth headers (`Api.getMqttNode` credentials)
    vs v2's bare superagent GET; (5) mqtt lib `~4.2.6`→`^4.3.8`.
  - **P3d — SOAK (MANDATORY GATE before any release): real broker + TWO clients** — verify LB
    failover + resubscribe after broker kill, presence heartbeat-off honored
    (`publishOnlinePresence(false)` → peer sees offline), LWT on tab-kill, no double-connection
    on reinit, `onReconnectCallback` behavior acceptable. Cannot run in the worktree (no push);
    deferred to the user.
  - **SyncAdapter transport (`2f1bbcd`, `ac0c7d0`):** added `synchronize`/`synchronizeEvent`
    RAW methods to core-v3's message adapter (additive; `Api.synchronizeEvent`'s `lastEventId`
    widened to `string | number` since v2's ids are numeric while v3's are string — v3 still
    passes string, unaffected). Rewrote v2 `lib/adapters/sync.js` to call
    `deps.messageAdapter.synchronize()`/`.synchronizeEvent()` instead of
    `UrlBuilder` + superagent `getHttp().get(url)`; kept the poll loops, fallback interval
    policy, RAW emit shapes, and the pre-existing `getId()` reference quirk in the public
    `synchronizeEvent()` byte-for-byte. `synchronizeFactory`/`synchronizeEventFactory` are now
    exported for unit testing without triggering the infinite poll loop. Wired
    `index.js`'s `SyncAdapter(() => this.deps.messageAdapter, {...})` (was
    `() => this.HTTPAdapter`) — this removes one of the last live `HttpAdapter` users.
    core-v3 99/99 (+2), compat 108/108 (+4), v2 test 20/1 (pre-existing), all builds green.
- **P5 — Shell reduction + cleanup — DONE. `HttpAdapter`/`AuthAdapter` deleted; v2 runtime is
  superagent-free.** Passes:
  - **pass 1** (`b55314b`/`f01b489`/`ba10f10`): exported core-v3 `Api`/`Provider` from the
    barrel; parameterized `Api.getRoomParticipants` (`offset`) + `Api.searchMessages`
    (`lastCommentId`); added baseUrl/broker/version/headers liveness to the `deps` getter;
    re-platformed the last three live non-`_legacy` `HttpAdapter` HTTP users — `init()` config
    (`deps.userAdapter.getAppConfig()`), deprecated `getRoomParticipants`, deprecated
    `searchMessages`.
  - **pass 2** (`66efb9d`/`d7d4244`): deleted all 18 `_legacy*` methods + the 4 phase*
    parity-test files + the old superagent `UserAdapter`/`RoomAdapter` (`lib/adapters/user.js`,
    `room.js`) — after proving every `userAdapter`/`roomAdapter` call site was in a `_legacy*`
    body. compat 108→81.
  - **pass 3** (`e5be5cc`/`ced7cae`): auth cluster — core-v3 `Api.refreshToken`/`Api.logout`
    + raw methods; `ExpiredTokenAdapter` calls `deps.userAdapter.refreshToken()`/`.logout()`
    (takes `getUserAdapter`/`getStorage`, not `httpAdapter`); token now lives in `deps.storage`
    as the single writer (login → `storage.setToken`, `makeDeps` seeds from `userData.token`).
    Request token headers unaffected (already from `storage.getToken()`).
    `compat/auth-transport.test.js` pins it.
  - **pass 4 / final** (`22677ec`/`2a7472d`/`351af62`): re-platformed `login_or_register` onto
    `deps.userAdapter.login()` — characterization test (`login-transport.test.js`) pins the
    exact body first (`{email, password, username, avatar_url, extras: JSON.stringify(extras)}`
    — the shell passes the ALREADY-stringified `extras` straight through, so the only change is
    the accepted urlencoded→JSON Content-Type). **Deleted `lib/adapters/http.js` + `auth.js`**,
    then dropped the last `superagent` import (dead `MqttAdapter.getMqttNode`). core-v3 101,
    compat 79 (0 fail), v2 baseline 20/1 (pre-existing), `build:lib` clean.
  - **What legitimately stays in the shell** (this is the "shell", not "empty"): mutable state
    fields, `Comment`/`Room` construction from raw, the mitt emitter, the singleton, thin
    per-shell adapters (`compat/axios-requester.js`, `mqtt.js`/`sync.js` facades,
    `realtime-bridge`, `expired-token.js`), and the one-line public-method delegations.
- **P4 — Model-agnostic usecases + orchestration move — NOT DONE (deliberately deferred).**
  This would refactor core-v3's WORKING v3 usecases (xstream + IQ + Decoder) to inject
  model-construction + state-mutation, then move v2's optimistic-send + chatTarget/getRoomById
  orchestration into shared usecases. It is the plan's "largest single piece", touches
  production v3 code, and single-sources BUSINESS LOGIC — not transport/realtime (already
  single-sourced). Recommended as its own project. The orchestration currently lives in v2's
  shell methods, which already delegate all HTTP/realtime to core-v3, so this is a refinement,
  not a blocker.

### Release gates (code done + unit-tested here, but NOT verifiable in the worktree — run before shipping)
1. **Live login** against a real Qiscus backend (accepted urlencoded→JSON divergence).
2. **Live auth-refresh** (403 → `refresh_user_token` → retry) + `logout` against a real backend.
3. **Realtime two-client soak** (P3d): broker kill → LB failover + resubscribe; presence
   heartbeat-off honored (`publishOnlinePresence(false)` → peer offline); LWT `'0'`/qos-1 on
   tab-kill; no double-connection on reinit; `onReconnectCallback` cadence acceptable.

### Deferred single-source opportunities (real remaining duplication, well-scoped — NOT the risky P4)
- **Sync poll loop — DONE (`9dc11bc`, `1915026`, `9d29e9d`).** core-v3's `getSyncAdapter`
  (`adapters/sync.ts`) now exposes a RAW firehose (`onRawMessages`/`onRawEvents`, alongside the
  existing decoded emits) plus an opt-in `syncOnlyWhenDisconnected` flag (`9dc11bc`, additive,
  v3 default unchanged), and is re-exported from the core-v3 barrel (`1915026`). v2's
  `lib/adapters/sync.js` was rewritten (`9d29e9d`) to build a core-v3 `getSyncAdapter` off a
  storage facade mapping v2's live option getters (`getShouldSync`, `enableSync`/
  `enableSyncEvent`, `syncInterval`/`syncOnConnect`, `lastCommentId`) onto core-v3's gate/
  interval getters, instead of running its own poll-loop generators
  (`synchronizeFactory`/`synchronizeEventFactory`, deleted). The raw firehose is re-shaped back
  into v2's exact mitt event names/payloads/order/guards (`message.new` sorted ASC then
  `last-message-id.new`; `last-event-id.new` then delivered/deleted/read/cleared), preserving
  v2's public interface and every `index.js` `.on(...)` handler byte-for-byte.
  - **Gating resolution:** did NOT need `syncOnlyWhenDisconnected` — v2's own `getShouldSync`
    already ANDs in `!realtimeAdapter.connected`, so mapping its negation onto core-v3's
    `getForceDisableSync` reproduces v2's exact gate as a single source, without double-applying
    the mqtt-disconnected condition. No v3 behavior change needed.
  - **Guard subtlety:** core-v3 advances its OWN last-event-id cursor on its DECODED emit, which
    fires BEFORE the raw firehose — so v2's "already emitted?" guard uses a separate local var
    (`lastEmittedEventId`), distinct from the storage-cursor var (`emittedEventId`) the facade
    exposes to core-v3, to avoid the guard always comparing an id to itself.
  - Tests: core-v3 106/106 (+1 skip, unaffected), compat 78/78 (`sync-transport.test.js` deleted
    — tested the deleted factories; replaced by `sync-delegation.test.js`), v2 `test/**` 20/1
    (pre-existing fail, unaffected), `build:lib` clean (the sync.js named/default-export warning
    is gone).
- **Expired-token auto-refresh scheduler — SCHEDULER LIFT DONE.** core-v3 now owns the
  timer + lifecycle mechanism (`packages/core-v3/src/adapters/token-refresh.ts`,
  `getTokenRefreshScheduler`, re-exported from the barrel): `setTimeout` at `token_expires_at`,
  the `refresh_token` rotation, the `onTokenRefreshed` callback (still invoked with the OLD
  `expiredAt`, a preserved v2 quirk), and the auth-status guard — reproduced byte-for-byte from
  v2's original `ExpiredTokenAdapter`, including that an already-expired token does NOT trigger
  an immediate refresh (the old JSDoc claiming otherwise was wrong; the code's behavior is what
  moved). v2's `lib/adapters/expired-token.js` `ExpiredTokenAdapter` is now a thin delegator
  over it — identical constructor shape + public methods (`refreshAuthToken()`/`logout()`), so
  `index.js` needed ZERO changes. Tests: core-v3 `adapters/token-refresh.test.ts` (+8, real
  timers per the vitest-0.25.8 constraint), v2 `compat/expired-token.test.js` (+4, mocha/chai).
  All green: core-v3 106→114, compat 78→82, v2 `test/**` 20/1 (pre-existing, unaffected),
  `build:lib` clean, v3 `build` clean.
  - **Version-3 enablement is a SEPARATE follow-up**, not done here. It requires: (a) adding
    `refreshToken`/`tokenExpiresAt` storage fields to core-v3 (currently absent); (b) capturing
    `refresh_token`/`token_expires_at` at login in v3's decoder/account model (currently
    dropped); (c) a v3 shell opt-in that constructs `getTokenRefreshScheduler` and wires
    `onTokenRefreshed` into v3's storage. Also note: v2's `auto_refresh_token` app-config flag
    is currently DEAD (write-only, never read anywhere) — it's a natural gate to wire in when
    v3 opts in, rather than always-on.
  - **Version-3 enablement — DONE.** v3 now opts into the same scheduler, using the SAME rule
    as v2: the scheduler starts iff-and-only-if the login response provided BOTH
    `refresh_token` AND `token_expires_at` — no config-flag gate. The dead `auto_refresh_token`
    app-config flag noted above remains unwired, deliberately (backend field presence is the
    only gate, matching v2). Added: storage fields `refreshToken`/`tokenExpiresAt`
    (`core-v3/src/storage.ts`); `v3/decoder.ts#account` tuple extended from 2 to 4 elements
    (`[IQAccount, token, refresh_token?, token_expires_at?]`, backward compatible with
    prefix-destructuring call sites); `login`/`setUserFromIdentityToken` in
    `adapters/user.ts` persist the two new fields, plus thin `refreshToken`/`logout`
    pass-throughs returning the raw body; `startTokenRefresh`/`stopTokenRefresh` added to
    `adapters/token-refresh.ts` (instance-tracked per `deps.storage` via a `WeakMap`), plus an
    additive `onExpiryUpdated` scheduler callback (v2 never passes it, so v2 is unaffected);
    usecase wiring in `setUser`/`setUserWithIdentityToken`/`clearUser`
    (`usecases/user.ts`) — `clearUser` also stops the scheduler and clears both storage
    fields. On refresh, the token-keyed MQTT user channel is unsubscribed (old token) and
    re-subscribed (new token) so realtime doesn't silently die post-rotation.
    `packages/version-3/src/index.ts` needed ZERO changes — the wiring lives entirely in the
    usecases layer. Tests: core-v3 114→127 (+13: decoder tuple regression, decoded
    `login`/`setUserFromIdentityToken` persistence, `startTokenRefresh`/`stopTokenRefresh`
    enablement/disable/MQTT-resubscribe/no-realtime-adapter cases), v2 compat 82/82 unchanged,
    v2 `test/**` 20/1 unchanged (pre-existing, unrelated). As with the rest of this section,
    live verification against a real backend remains a release gate before shipping.

## 5. Missing v3 features — CONFIRM before implementing (per user)

core-v3 already has Api for: `getNonce`, `verifyIdentityToken`, `search_messages`,
device-token, and the axios transport. Genuinely MISSING (must be added to core-v3 to finish
single-source), pending your confirmation:

1. **`upload` primitive** — multipart file upload + progress events. v2 has it
   (`upload`/`uploadFile`/`sendFileMessage`); core-v3 has NO upload. Biggest addition.
2. **`getUserPresences`** — the `api/v2/sdk/users/status` endpoint (bulk presence). Missing in
   core-v3 Api entirely.
3. **`deleteMessages` flags** — core-v3's `Api.deleteMessages` HARDCODES
   `is_delete_for_everyone: true` / `is_hard_delete: true`; v2's `deleteComment(roomId, ids,
   isForEveryone, isHard)` passes them. Parameterize the encoder (+ send as body, not query —
   see the delete-shim note) so v2 keeps the flags.
4. **Transport error-shape + config** — reproduce superagent's error contract over axios, and
   make the 403-retry + custom headers configurable in core-v3 transport. (Enabler for P1, not
   a "feature" per se, but it's core-v3 work.)
5. **Verify (likely fine, but confirm):** `getNonce`/`verifyIdentityToken` header parity
   (v2 sends lowercase `qiscus_sdk_app_id`/`qiscus_sdk_version`; core-v3 `withHeaders` sends
   its own) and whether v2's `searchMessages` should map to core-v3's existing
   `search_messages` vs `searchMessagesV2`.

## 6. Risks / watch-list

- **Transport error-shape parity (TOP RISK):** superagent vs axios error objects differ
  structurally; some v2 methods reject with the whole `res`. The characterization tests
  (P1a) are the non-negotiable safety net.
- **Realtime connection behavior:** core-v3's 3.5s heartbeat is observable to other clients →
  must be flag-off for v2; LB-reconnect cadence + subscribe/publish buffering must match.
- **Model-agnostic usecase refactor** touches v3's working code — gated by the 74/90 core-v3
  tests; must keep v3 byte-identical.
- **Scope:** this is the largest remaining effort. Recommended order strictly P1→P5, each
  independently shippable, so byte-parity is verified continuously.

## 7. Out of scope
- No change to v2's public API surface, `Comment`/`Room` model shapes, or mutable-var names.
- No npm publish; core-v3 stays private/source-only.
