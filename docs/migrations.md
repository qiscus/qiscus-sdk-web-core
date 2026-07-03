# Migration / handoff — sdk-js rework (for a fresh agent session)

> Purpose: hand this work to another agent/session with zero context loss. Read this
> file first, then the three plan docs it points to. Everything below is the current
> state as of **2026-07-01**.

---

## 0. TL;DR — where we are & the next action

- We are converting `sdk-js` into a **pnpm monorepo** where **v2** (`packages/version-2`,
  `qiscus-sdk-javascript` / `QiscusSDK`) and **v3** (`packages/version-3` + the extracted
  logic package `packages/core-v3` = `@qiscus/core-v3`) live side-by-side and are
  **both actively maintained with bidirectional feature parity**.
- v3 logic has already been extracted into `@qiscus/core-v3` (the `Qiscus` class is now a
  "dumb shell"). Build + 74 core-v3 tests green.
- **Planning committed** (`f1af198`, NOT pushed). Three plans exist (see §3).
- **Refactor progress (committed, NOT pushed):**
  - `5580f05` — **Phase A** done: decode/model moved into `v3/` module, `./v3` subpath
    export, shell re-pointed. Green.
  - `c9c107c` — **Phase B** done: HTTP adapters split into `*.raw.ts` (fetch-only, raw)
    + decoding adapters delegating to them; raw factories exported from root barrel.
    Green (build 0, 74 tests).
  - `bddf594` — **Phase C** done: unified MQTT reconnect policy §4a (reconnectPeriod 1s,
    guard, exponential backoff, persist broker URL). Realtime raw-stream split DEFERRED to
    v2 Phase 4a. core-v3 refactor **complete for the HTTP path**.
  - `40d08c8` — Fable architecture review folded into `v2-on-core-v3-plan.md`.
- **v2 re-platform progress (committed, NOT pushed):**
  - `1ef478a` — **Phase 0a**: `compat/requester.js` (superagent-backed ApiRequester over
    v2's HttpAdapter) + `compat/deps.js` + Hooks import switched to `@qiscus/core-v3`.
    Wiring proof 5/5, build green. Nothing rewired yet.
  - **Phase 0b** (`2639cbd`): `compat/to-v2.js` (raw→Comment/Room/User normalizers),
    `compat/parity.js` + self-tests (failure-path harness, 10/10), and DRAFT
    `docs/v2-core-v3-gaps.md`.
  - **Phase 1** (this commit): re-platformed user-domain **read** methods onto core-v3's
    raw user adapter via `this.deps` (`getUsers`, `getBlockedUser`, `blockUser`,
    `unblockUser`, `getUserProfile`). Each keeps a verbatim `_legacy<Method>` copy; new
    `compat/phase1.parity.test.js` diffs real legacy-vs-new resolve/reject across
    200/400/403/500 (5/5) — full compat suite 20/20, `build:lib` green. Pre-existing v2
    `test/**` failures (3: mqtt-stub `.subscribe`, HTML-escape) are unrelated (identical
    on clean HEAD).
    - **`getNonce` DEFERRED** (not in this commit): it bypasses `HttpAdapter` (raw
      superagent + pre-auth `qiscus_sdk_*` lowercase headers, no token); routing it
      through the shim changes its header set on a pre-auth flow → own careful step later.
    - **Two parity divergences ACCEPTED (reviewed w/ Fable, A/A):** (1) POST Content-Type
      urlencoded→JSON — v3 already POSTs JSON to these exact endpoints in prod, so
      backend-proven (watch body value *types*, but Phase 1 bodies are string-only);
      (2) envelope-status (HTTP-200-but-`body.status≠200`) rejects with reconstructed
      `{status, body}` vs old whole-`res` — common HTTP-error path is byte-identical.
      Both documented in `compat/requester.js`.
  - **Phase 2a** (this commit): re-platformed the room **isolated-transform** methods onto
    core-v3's raw ROOM adapter via `this.deps.roomAdapter` (`updateRoom`,
    `addParticipantsToGroup`, `removeParticipantsFromGroup`, `getTotalUnreadCount`,
    `getRoomUnreadCount`). Same `_legacy*` + parity-test pattern; `compat/phase2.parity.test.js`
    5/5 (compat suite 25/25, `build:lib` green). All endpoints/methods verified identical;
    `Api.updateRoom`'s encoder is byte-identical wire (`{id, room_name, avatar_url,
    options: JSON.stringify}`).
    - **`clearRoomMessages` DEFERRED (shim defect found):** `Api.clearRooms` carries
      `room_channel_ids` as **query params** (`useParams`), but `makeV2Requester`'s
      `delete` branch forwards only `api.body` (and appends `queryString` only for `get`) —
      so the ids would be silently dropped. Fix `makeV2Requester` (append
      `queryString(api.params)` for `delete`, or send params-as-body) before re-platforming
      it. Same gap will bite other param-carrying DELETE/GET-ish endpoints (e.g.
      `deleteComment`).
    - **Phase 2b (room CONSTRUCTION) still open:** `chatTarget`/`getRoomById`/
      `getOrCreateRoomByUniqueId`/`chatGroup`/`createGroupRoom` — these need `rawRoomToV2`
      reconstruction (old room adapter massages: `avatar` alias, `comments.reverse()`,
      rival/`room_name` naming) + preserving side effects (`setActiveRoom`/`readComment`/
      `subscribeChannel`/`MESSAGE_BEFORE_RECEIVED` hooks/events). Anchor parity at the
      `rawRoomToV2`-output level vs the old adapter's massaged output.
      - **`rawRoomToV2` naming divergence to FIX first (found during Phase 2a analysis):**
        (a) no-rival fallback — old `getOrCreateRoom` uses the literal `'Room name'`, but
        `rawRoomToV2` falls back to `room.room_name || 'Room name'`; (b) the uniqueId path —
        old `getOrCreateRoomByUniqueId` ALWAYS sets `name = room_name` (no rival lookup), but
        `rawRoomToV2` only sets `name` when `targetEmail` is given. Add a `useRoomName`/
        per-path opt (or split helpers) + a `to-v2` unit test diffing `rawRoomToV2` output
        against a replica of each old adapter path before wiring the shell methods.
      - `getRoomById` is the easy one in 2b — old `roomAdapter.getRoomById` already returned
        raw `res.body`, and the shell method already does its own `results.room`/
        `comments.reverse()`/`new Room(...)`, so it's a near-clean data-source swap to
        `deps.roomAdapter.getRoom(id)` (no `rawRoomToV2` needed there).
- **Phase 0 findings to fold into the plan (from Phase 0b + Opus):**
  - **`mqttURL` liveness CONFIRMED (Issue #1.1):** core-v3 `mqtt.ts` `conneck()` reads
    `storage.getBrokerUrl()` **fresh** each connect (mqtt.ts:296), and LB-reconnect
    persists via `setBrokerUrl` (Phase C). → make v2's `this.mqttURL` a **getter/setter
    backed by storage** → bidirectionally live. Caveat: constructor-time fallback needed
    (storage not ready yet). Implement in Phase 4b.
  - **Gaps draft correction:** `Core.setupWithCustomServer` **already replicates** v2's
    `setterHelper`/`mqttWssCheck` `api/v2/sdk/config` negotiation (contradicts plan §8's
    "likely keep-in-shell" guess for Issue #2) — CONFIRM before init() work.
  - **`getUserPresences`** has no core-v3 primitive → `keep-in-shell` (new).
- **Next action:** **Phase 2b** — room CONSTRUCTION methods (`chatTarget`, `getRoomById`,
  `getOrCreateRoomByUniqueId`, `chatGroup`, `createGroupRoom`) via `this.deps.roomAdapter` +
  `compat/to-v2.js` `rawRoomToV2` (verify `rawRoomToV2` replicates the old room adapter's
  massaging), keeping side effects intact; anchor parity at the `rawRoomToV2`-output level.
  Then the `makeV2Requester` delete-params fix + `clearRoomMessages`, then Phase 3
  (messages). Also still open: deferred `getNonce`, reviewing `docs/v2-core-v3-gaps.md`.

---

## 1. Environment & hard constraints (do not violate)

- **Work ONLY in the worktree:** `/Users/afief/code/qiscus/sdk-js/.claude/worktrees/monorepo`
  (branch **`monorepo`**). The main `sdk-js` checkout is on another branch — do not touch it.
- **Do NOT push.** **Only commit when the user explicitly asks.**
- Commit trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Match the
  repo's plain imperative commit style. Never `--no-verify`.
- **Do NOT touch** `sample-js`, the `version-3` shell's public API, or `version-2` source
  *until* we reach the execution phases (planning/analysis only so far).
- `@qiscus/core-v3` is **private, source-only, never published to npm**.
- Language: user communicates in **Indonesian** (technical terms in English). Mirror that.

---

## 2. What already exists (done before this planning)

- Monorepo scaffolding: `pnpm-workspace.yaml`, root `package.json`, both packages build
  via `pnpm -r run build`.
- `packages/version-2` — the untouched legacy `QiscusSDK` (2390-line `src/index.js` +
  `lib/` with `Comment`/`Room` models and its own adapters: http, user, room, mqtt, sync,
  auth, expired-token, custom-event, hook).
- `packages/version-3` — the dumb `Qiscus` shell (`src/index.ts`, ~705 lines) delegating
  to `@qiscus/core-v3`.
- `packages/core-v3` — the extracted functional core: `api.ts` (transport + `Api.*`
  request-builders), `provider.ts`, `storage.ts`, `hook.ts`, `encoder.ts`, `decoder.ts`
  (raw→`IQ*`), `model.ts` (`IQ*`), `adapters/` (user, room, message, mqtt, sync,
  realtime, logger), `usecases/` (orchestration), `utils/`, `defs.ts`, `mocks/`.
  Barrel `src/index.ts` exports factories, usecases, `Hooks`, model types, `QiscusDeps`.

---

## 3. The plan docs (read in this order)

All in `docs/` (committed at `f1af198`):

1. **`features.md`** — v2↔v3 feature-parity comparison + deep-dive appendix on v2's ~50
   **public mutable fields** (the live `selected` room, `rooms`, `userData`, `mqttURL`,
   `isTypingStatus`, …). These are the byte-for-byte contract v2 must preserve (they were
   read/mutated directly by an old Vue UI + current customer integrations).

2. **`core-v3-decode-module-refactor.md`** — **lands FIRST.** Reorganize `@qiscus/core-v3`
   *internally* (one package, no npm split) into:
   - a **raw / version-agnostic surface** (root barrel): transport, `Api.*`, storage,
     mqtt/sync, hooks, **raw adapters** (fetch-only), and the **shared HTTP usecases**
     (validation + `bufferUntil` orchestration) that now return **raw** when fed raw
     adapters; plus (future) an `auth/` folder for token-refresh.
   - a **`v3/` module** (name decided by user): `decoder.ts` + `model.ts` (`IQ*`) +
     **decoding adapters** (raw adapter + `Decoder` → IQ) + `deps.ts` builder + the
     **realtime usecases** (they read IQ fields — see §4). Consumed by shell-v3.
   Key seam fact: **decode lives entirely in the adapters, not the usecases**, and
   adapters are DI'd via `QiscusDeps` — so the *same HTTP usecase* yields IQ (v3 adapters)
   or raw (v2 adapters). shell-v3 imports `@qiscus/core-v3/v3` (subpath export), stays
   dumb. Phases A–E inside.

3. **`v2-on-core-v3-plan.md`** — **sits on top of #2.** Re-platform v2 so `QiscusSDK`
   becomes a **compatibility shell**: same public API/fields/events/models byte-for-byte,
   but internals call the **shared raw usecases** and decode raw→`Comment`/`Room` via a
   new `compat/` layer (`deps.js`, `to-v2.js`, `to-v3.js`, `realtime-bridge.js`). Contains
   the method-by-method map, the realtime bridge design, phasing (Phase 0–5), a worked
   example (§14, `chatTarget`), and **Proposal P-1** (token auto-refresh, missing in v3,
   to land in the shared `auth/`).

---

## 4. Key architectural decisions (settled — don't relitigate)

- **Single package, internal `v3/` module** (NOT a separate `@qiscus/core` npm package).
  Decided because both versions are source-only/private and a module boundary is enough.
- **Shared vs version-specific split:** transport + `Api.*` + storage + mqtt/sync + hooks
  + HTTP usecase orchestration = **shared/raw**. `Decoder` + `IQ*` + decoding adapters +
  realtime usecases = **`v3/`**. v2 keeps its own `Comment`/`Room` decode.
- **Load-bearing rule (VERIFIED):** a usecase can be shared across shells **only if it
  never inspects the shape of the adapter/stream result.**
  - **HTTP usecases** (room/message/user/setup) = pure pass-through → **shared**. ✔
  - **Realtime usecases** (`makeOnMessageReceived$` etc.) read **decoded IQ fields** —
    e.g. `usecases/realtime.ts:36` does `message.sender.id` / `.chatRoomId` / `.id` for
    auto-delivery, and `:218` uses `isChatRoom(data)`/`data.id`. → **NOT shared;** they
    stay in `v3/`. **v2 subscribes to the raw MQTT/sync stream and implements its own
    realtime semantics** in `compat/realtime-bridge.js` (delivery receipts, `selected`
    mutation, mitt events) — matching what v2's `init()` does today.
- **v2 is JavaScript**, so `QiscusDeps` staying typed to IQ adapters doesn't block v2
  injecting raw adapters at runtime. Don't weaken v3's types for v2.
- **P-2 (barrel raw export) was DROPPED** — absorbed by the refactor (raw is the native
  root surface now). **P-1 (token refresh)** stays, lands in shared `auth/`.

---

## 5. Open questions / discussion state (RESUME HERE)

We were working through "major issues to discuss before execution". Status:

### Issue #1 — Realtime connection parity (v2 MqttAdapter vs core-v3 mqtt.ts) — ANALYZED
Side-by-side done (`version-2/src/lib/adapters/mqtt.js` vs `core-v3/src/adapters/mqtt.ts`).
**Verdict: v3 has the same core mechanism** (LB node resolution via `Api.getMqttNode` →
`wss://url:wss_port/mqtt`, reconnect-on-close, client-id `appId_userId_ts`, last-will
`u/{id}/s`, resubscribe topics, identical topic protocol). Behavioral **deltas found**:
| Aspect | v2 | v3 | Note |
|---|---|---|---|
| Reconnect debounce | 1000ms | 300ms | minor |
| Re-entrancy guard | `willConnectToRealtime` | none | minor |
| LB GET headers | none | sends credentials | minor |
| Presence heartbeat | none (manual) | **auto every 3500ms** (`mqtt.ts:199`) | ⚠ behavior change |
| Resolved broker URL | writes **public `this.mqttURL`** (`mqtt.js:176-181`) | local `cacheUrl`, not persisted (`mqtt.ts:122,229`) | ⚠ **byte-for-byte break** |
| will qos | unset | qos:1 | minor |

**TWO OPEN QUESTIONS — RESOLVED (user answered 2026-07-01):**
1. **`this.mqttURL` mirroring:** ✅ **DECIDED = option b.** v3's mqtt adapter **writes the
   resolved broker URL into storage**, and v2 mirrors `storage → this.mqttURL`. (Small,
   gated v3 change; also benefits v3.) Lands in Phase C / v2 work, not Phase A.
2. **Presence heartbeat:** ✅ **DECIDED = keep v2 as-is.** v2 does NOT inherit v3's auto
   presence heartbeat (3.5s); v2 stays identical to today (manual only). v3 keeps its
   auto-heartbeat unchanged.
3. **Unified reconnect policy (user, 2026-07-02):** ✅ **DECIDED — standardize the shared
   core-v3 mqtt adapter for BOTH versions:** (a) library `reconnectPeriod` = **1000 ms**
   (explicit); (b) LB-reconnect debounce = **1000 ms** (align v3 up from 300 ms to match
   v2); (c) **add v2's `willConnectToRealtime` re-entrancy guard** to core-v3; (d) **NEW:
   exponential backoff** — if reconnects keep failing (e.g. broker down), increment the
   retry delay instead of hammering at 1 s, reset on successful connect. Full spec in
   `core-v3-decode-module-refactor.md` §4a. Lands with the realtime work (Phase C).

### Fable architecture review (2026-07-02) — folded into `v2-on-core-v3-plan.md`
A second-opinion review (model: Fable) surfaced findings now written into the v2 plan
(§4a, §7, §8.0, §9 Phase 4a/4b, §11, §13). Headlines:
- **Biggest gap = TRANSPORT/error-path parity** (v2 superagent vs core-v3 axios): error
  shapes, full-`res` rejections, `bufferUntil` buffering, 403-retry, headers — invisible
  to the shape-diff gate. **Fix = inject a superagent-backed `ApiRequester` over v2's
  `HttpAdapter`** (`v2-on-core-v3-plan.md` §4a) → error/retry/header parity for free while
  still reusing `Api.*` + raw adapters. Pushes v2 toward raw-adapter-direct calls over
  usecases for error-sensitive methods.
- **Phase 0 grew** (§8.0): custom-requester decision, **failure-path parity harness**
  (200/400/403/500 fixtures — now a deliverable), header parity, `mqttURL` field→storage
  liveness, P-1 scope note.
- **Phase 4 split** into 4a (core-v3 raw-stream split) + 4b (v2 bridge + `init()`).
- **Don't rush deleting v2 `SyncAdapter`** — keep through Phase 4, delete Phase 5 only
  after cadence parity proven.
- Add **incoming-typing `isTypingStatus` mutation** to the bridge (§7).

### Remaining major issues
- **#2 `init()` / config negotiation ownership.** Keep v2's `init()` config block in the
  shell, feed resolved values into core-v3 storage; ensure core-v3 `setup` doesn't
  double-fetch/conflict. (Confirm Phase 0.)
- **#3 v2 test coverage — ANSWERED (Fable):** `version-2/test/` ≈ **158 lines** total →
  effectively no parity anchor. The failure-path parity harness is now a **Phase 0
  deliverable** (§8.0.2).
- **#4 wire-format parity — PARTIALLY ANSWERED (Fable):** `Api.postComment` body keys
  match v2; the real wire issue is **transport** (headers + error shapes), not the
  encoder — see §4a.
- **#5 Operational (defer).** Update `sample-js`'s `link:` from `../sdk-js` to
  `../sdk-js/packages/version-2`; decide when `monorepo` merges to `master`.

---

## 6. Working rules (from the user's global instructions)

- **Opus plans, Sonnet executes.** The main (Opus/Fable) agent explores, decides, writes
  plans, and verifies. Implementation is delegated to **`Agent` calls with
  `model: "sonnet"`** — up to 3 in parallel **only** when truly independent (disjoint
  files, no build-order dependency); otherwise sequential. Each subagent prompt must be
  self-contained (point to the plan file + exact files/sections + restate hard rules +
  ask for files changed + commit SHAs + deviations). Opus then runs final verification.
- **Commit cadence:** when commits are being made, commit each verified-green change
  immediately with a 1–2 sentence message; don't bundle 1000-LOC end-of-session commits.
  But the "only commit when asked" guard still applies.
- For the decode-module refactor, phases are **sequential** (they share the package
  typecheck/`.tsbuildinfo` and barrel contract) — not parallel.

---

## 7. Verification commands

- Build all: `pnpm -r run build` (from worktree root) — must exit 0; v2 lib/dist + v3
  dist (mjs/umd/cjs) + `types/index.d.ts` regenerate non-empty; core-v3 emits
  `dist-types` (incl. `dist-types/v3/index.d.ts` after refactor).
- core-v3 tests: `pnpm --filter @qiscus/core-v3 test` (baseline 74 pass / 1 skip / 1 todo).
- v3 public-shape smoke: `node -e "const Q=require('./packages/version-3/dist/qiscus-sdk-javascript.umd.js'); const q=new (Q.default||Q)(); console.log(typeof q.setUser, typeof q.sendMessage, typeof q.onMessageReceived)"` → `function function function`.
- v2 public-surface baseline (capture before changing v2, diff after each phase):
  `node -e "const Q=require('./packages/version-2/dist/...'); const q=new Q.default(); console.log(Object.getOwnPropertyNames(q).sort().join(','))"`.

---

## 8. Key files to know

- v2 shell: `packages/version-2/src/index.js` (constructor fields :42-109; `init` :124;
  `chatTarget` :1062; `setActiveRoom` :997; new-message mutation :385-394).
- v2 models: `packages/version-2/src/lib/Comment.js`, `.../Room.js` (raw snake_case in).
- v2 mqtt: `packages/version-2/src/lib/adapters/mqtt.js` (LB/reconnect/`mqttURL` mutation).
- v2 token refresh: `packages/version-2/src/lib/adapters/expired-token.js`.
- core-v3 transport/builders: `packages/core-v3/src/api.ts` (`Api.*`, `getMqttNode` :577).
- core-v3 adapters: `packages/core-v3/src/adapters/{room,message,user,mqtt,realtime,sync}.ts`
  (decode via `Decoder.*` inside these — the refactor seam).
- core-v3 usecases: `packages/core-v3/src/usecases/*.ts` (HTTP = pass-through; `realtime.ts`
  reads IQ fields).
- core-v3 decode/model: `packages/core-v3/src/decoder.ts`, `model.ts` (→ move to `v3/`).
- core-v3 storage: `packages/core-v3/src/storage.ts` (broker-url/lb/enabled getters :35-73).

---

## 9. Misc context

- A memory was saved (project fact): `sdk-js-v2-v3-parity` — both versions actively
  maintained, bidirectional parity → shared-core architecture. Index in the session's
  `MEMORY.md`.
- A Claude skill was created: `~/.claude/skills/time-tracker-note/SKILL.md` — invoked via
  `/time-tracker-note`, appends detailed `[START]/[STOP]` work-log entries to
  `~/time-tracker.txt` (C-Level-readable detail field). Not related to the code work.
- Nothing has been pushed. The only commit made this effort is `f1af198` (docs).
