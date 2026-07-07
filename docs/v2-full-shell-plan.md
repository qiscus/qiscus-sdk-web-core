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
- **P2 — Keep-in-shell HTTP methods → core-v3** (needs the §5 confirmations): add missing
  primitives to core-v3, then re-platform `deleteComment`/`clearRoomMessages`/`upload`/
  `getUserPresences`/`searchMessages`/`getNonce`/`verifyIdentityToken` onto them.
- **P3 — Realtime connection → core-v3**: v2 facade delegates to `getMqttAdapter` (+ heartbeat
  flag OFF); replace `SyncAdapter` polling with core-v3 sync (keep v2's fallback policy);
  delete v2 `MqttAdapter`/`SyncAdapter` connection code.
- **P4 — Model-agnostic usecases + orchestration move**: refactor core-v3 usecases to inject
  model-construction + state-mutation; move v2's optimistic-send + chatTarget/getRoomById
  flows into shared usecases; v2 methods become 1-line delegations.
- **P5 — Shell reduction + cleanup**: v2 `index.js` reduced to state + model construction +
  delegations; remove `_legacy*`; delete now-dead `lib/adapters/*` (http/user/room/mqtt/sync/
  auth/expired-token) that finally have zero references; keep `Comment.js`/`Room.js`.

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
