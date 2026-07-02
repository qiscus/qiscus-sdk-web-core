# Plan: Carve a `v3/` decode module out of `@qiscus/core-v3`

> Audience: Sonnet executor. Read top-to-bottom. Companion docs:
> [`docs/v2-on-core-v3-plan.md`](./v2-on-core-v3-plan.md) (the v2 re-platforming that
> sits on top of this) and [`docs/features.md`](./features.md).
> **This refactor lands FIRST**, before the v2 work.

---

## 1. Goal

`@qiscus/core-v3` today mixes two concerns:

- **version-agnostic core** — transport (`api.ts`), request-builders (`Api.*`),
  `provider.ts`, `storage.ts`, `hook.ts`, `encoder.ts`, `utils/`, the realtime/sync/
  mqtt plumbing, and the **usecase orchestration** (param validation pipelines,
  `bufferUntil(login)`, xstream flow, `toCallbackOrPromise`).
- **v3-specific shaping** — `decoder.ts` + `model.ts` (the `IQ*` interfaces). This is
  *how v3 presents data*; it is **not** shared with v2 (v2 has its own `Comment`/`Room`).

We are keeping **one package** (`@qiscus/core-v3`, no npm split), but reorganizing it
internally so the v3-specific shaping lives in a dedicated **`src/v3/` module**, and
the rest becomes a clean **raw / version-agnostic** surface that **both** shells build
on. This is the enabler for `sdk-js` v2↔v3 bidirectional feature parity: a new backend
feature is written **once** in the shared core, then each shell adds a thin
decode + public method.

Naming decided with user: the module is **`v3`** (it is specifically for shell-v3).

---

## 2. The key structural fact (why this is low-churn)

**Decode is entirely inside the adapters, never in the usecases.** Verified:

- Adapters do `Decoder.x(await api.request(Api.buildX(...)))` and return `IQ*`.
  E.g. `adapters/user.ts` → `Decoder.account` / `Decoder.user` / `Decoder.appConfig`;
  `adapters/room.ts` → `Decoder.room` / `Decoder.participant`;
  `adapters/message.ts` → `Decoder.message`; the mqtt/sync adapters decode realtime
  payloads inside `adapters/realtime.ts`'s merged streams.
- Usecases (`usecases/*.ts`) are **decode-free orchestration**: they only build the
  xstream validation pipeline and call `deps.<adapter>.<method>(...)`, passing through
  whatever the adapter returns. Example (`usecases/room.ts::getChannel`):
  ```ts
  export function getChannel(deps, uniqueId, callback) {
    return xs.combine(process(uniqueId, isReqString({ uniqueId })), …)
      .map(([uniqueId]) => xs.fromPromise(deps.roomAdapter.getChannel(uniqueId)))
      .compose(flattenConcurrently)
      .compose(toCallbackOrPromise(callback))
  }
  ```
- Adapters are **dependency-injected** via `QiscusDeps` (`usecases/types.ts`), typed as
  `ReturnType<typeof getRoomAdapter>` etc.

**Consequence:** the seam is the **adapter boundary**. If we split each adapter into a
*raw* variant (fetch, no decode) and a *v3* variant (raw + decode → IQ), then the
**same HTTP usecases** serve both shells:
- shell-v3 injects **v3 (decoding) adapters** → usecases return `IQ*` (types hold).
- shell-v2 injects **raw adapters** → usecases return raw JSON at runtime.

⚠ **This holds only for usecases that pass the result through untouched** — verified
true for the HTTP usecases, **false for the realtime usecases** (they read decoded
fields). Realtime is shared at the raw-stream level instead. **See §5.**

v2's `index.js` is **JavaScript**, so the fact that the shared usecases are *typed* to
return `IQ*` doesn't obstruct v2 — at runtime v2 receives raw and decodes to
`Comment`/`Room` itself. (See §6 for the typing note.)

---

## 3. Target layout

```
packages/core-v3/src/
  # ─────────── version-agnostic / RAW surface (shared by v2 & v3) ───────────
  api.ts                 # transport (apiAdapter.request) + Api.* request-builders
  provider.ts storage.ts hook.ts encoder.ts
  utils/                 # stream, param-utils, try-catch, …
  defs.ts                # IQCallback*, Subscription, Callback, IQProgressListener
  adapters/
    request/… (mqtt.ts sync.ts realtime.ts logger.ts)  # transport-y adapters
    user.raw.ts room.raw.ts message.raw.ts             # NEW: fetch-only, return raw
  usecases/              # UNCHANGED orchestration (validation, bufferUntil, streams)
    types.ts             # QiscusDeps (see §6 for the typing shape)
    setup.ts user.ts room.ts message.ts realtime.ts message-factory.ts
  auth/                  # (future) P-1 token-refresh lands here — shared
  index.ts               # barrel: RAW/shared surface → consumed by shell-v2

  # ─────────── v3-specific module (shell-v3 only) ───────────
  v3/
    decoder.ts model.ts  # MOVED here: Decoder.* + IQ* interfaces
    adapters.ts          # NEW: v3 decoding adapters = raw adapter + Decoder → IQ
    deps.ts              # buildV3Deps(): QiscusDeps wired with v3 decoding adapters
    index.ts             # barrel: IQ surface + usecases re-export → consumed by shell-v3
```

- **shell-v3** (`version-3/src/index.ts`): change its imports from `@qiscus/core-v3` to
  `@qiscus/core-v3/v3` (or a `Core.v3.*` namespace) and build deps via `v3/deps.ts`.
  It stays a **dumb** shell — still gets `IQ*`, still one-line delegations.
- **shell-v2** (`version-2/src/index.js`): consumes the root barrel (raw usecases +
  `Api`/`Provider`/adapters), builds deps with raw adapters, decodes to `Comment`/`Room`.

---

## 4. How each adapter splits (the mechanical core of the work)

For every adapter method that currently decodes, factor the fetch out from the decode.

**Before** (`adapters/room.ts`):
```ts
export const getRoomAdapter = (s, api) => ({
  async getChannel(uniqueId) {
    const resp = await api.request(Api.getOrCreateRoomWithUniqueId({ …Provider…, uniqueId }))
    return Decoder.room({ ...resp.results.room, is_removed: false, last_comment: … })
  },
  …
})
```

**After — raw adapter** (`adapters/room.raw.ts`, shared, returns raw):
```ts
export const getRoomAdapterRaw = (s, api) => ({
  async getChannel(uniqueId) {
    return api.request(Api.getOrCreateRoomWithUniqueId({ ...Provider.withBaseUrl(s), ...Provider.withCredentials(s), uniqueId }))
  }, // returns the full raw response (resp) — callers pick resp.results.*
  …
})
```

**After — v3 decoding adapter** (`v3/adapters.ts`, returns IQ):
```ts
import { getRoomAdapterRaw } from '../adapters/room.raw'
import * as Decoder from './decoder'
export const getRoomAdapter = (s, api) => {
  const raw = getRoomAdapterRaw(s, api)
  return {
    async getChannel(uniqueId) {
      const resp = await raw.getChannel(uniqueId)
      return Decoder.room({ ...resp.results.room, is_removed: false, last_comment: … })
    },
    …
  }
}
```

Notes:
- **Keep any pre-decode massaging that the current adapter does** (e.g. `chatUser`
  computing `last_comment` from `resp.results.comments`, `createGroup` `.pop()`, the
  `is_removed: false` spreads) **in the v3 decoding adapter**, since that shaping is
  part of producing the IQ. The **raw adapter returns the untouched `resp`** so v2 can
  do its own shaping (v2's old adapters did their own, e.g. `room.comments.reverse()`).
- **Realtime** (`adapters/realtime.ts` + `mqtt.ts`/`sync.ts`): the payload decode
  (`Decoder.message`) currently happens inside the merged streams. Split the same way —
  a raw stream emitting the raw payload (shared), and a v3 stream that maps
  `Decoder.message` over it (`v3/`). v2's realtime bridge subscribes to the **raw**
  stream (it wants raw for `Comment`). This mirrors the HTTP split and removes the
  "realtime raw" caveat from the v2 plan (§7 there).
- `encoder.ts` (outgoing message encode) is **version-agnostic** → stays in the shared
  surface (both shells send the same wire format).

---

## 4a. Unified MQTT reconnect policy (shared adapter — applies to BOTH v2 & v3)

Decision (user, 2026-07-02): the shared core-v3 mqtt adapter
(`adapters/mqtt.ts` → moves to the raw/shared surface) gets **one canonical reconnect
policy** that both shells inherit. This standardizes today's divergence (v2 debounces
1000ms + has a re-entrancy guard; v3 debounces 300ms + no guard) and **adds backoff**,
which neither version has today.

**Target behavior:**
1. **Library-level reconnect:** set `reconnectPeriod: 1000` **explicitly** in the
   `connect()` options (don't rely on the mqtt-lib default / the commented-out line in
   v2). → retries the *same* broker URL every **1 s**.
2. **LB-reconnect debounce = 1000 ms.** On `close`, the handler that re-fetches a fresh
   broker node from the load balancer (`getMqttNode` → `wss://url:wss_port/mqtt`) and
   reconnects is debounced **1 s** (raise v3 from 300 ms to match v2).
3. **Re-entrancy guard.** Port v2's `willConnectToRealtime` flag into the adapter: while
   an LB-reconnect cycle is in flight, **skip** starting another (v2 `mqtt.js:146,159,173`).
   v3 currently lacks this and can overlap reconnects.
4. **Exponential backoff on persistent failure (NEW).** Track **consecutive failed
   reconnect attempts**. The delay before each LB-reconnect grows:
   `delay = min(base * 2^failures, cap)` with `base = 1000 ms`, recommended
   `cap = 30000 ms` (30 s) — **tunable**. **Reset `failures` to 0 (delay back to 1 s) on a
   successful `connect`.** Purpose: if the broker is down, stop hammering every 1 s and
   back off (1s → 2s → 4s → … → 30s) until it recovers.

**Implementation caveat (for the executor):** the library's fixed 1 s `reconnectPeriod`
and our backoff'd LB-reconnect must not double-hammer a dead broker. Govern reconnection
through the LB handler: when entering backoff, end the current client (`mqtt.end(true)`)
so the library stops its own 1 s retry, and schedule the next attempt ourselves after the
computed backoff delay; on a healthy connection, the plain 1 s library reconnect handles
transient blips. Keep gating conditions (v2: `enableLb && isLogin && shouldConnect`;
v3: `brokerLbEnabled && user≠null && shouldConnect`) — unify them into one predicate.

**Parity notes:** this is a **shared behavior change touching v3's realtime** (approved as
part of "samakan kedua versi"). It also interacts with the `this.mqttURL` mirroring
decision (Issue #1.1): when the LB handler switches broker URL, write the resolved URL to
storage so v2 can mirror it to its public `this.mqttURL` field. Land all of §4a together
in **Phase C**.

---

## 5. Usecases: HTTP shared (untouched); realtime split

**Two classes of usecase — verified by scanning `usecases/*.ts`:**

- **HTTP request/response usecases (room / message / user / setup) — SHARED, untouched.**
  They validate args then call `deps.<adapter>.<method>(args)` and **pass the result
  straight through** `flattenConcurrently → toCallbackOrPromise` **without reading any
  field of it**. So the same usecase yields IQ (v3 decoding adapters) or raw (v2 raw
  adapters) purely by which adapters are in `deps`. Do **not** move their validation/
  `bufferUntil`/stream logic — it is the shared orchestration (the DRY win). These live
  on the shared/raw surface.

- **Realtime usecases (`makeOnMessageReceived$` etc. in `usecases/realtime.ts`) — STAY
  in the `v3/` module; v2 does NOT reuse them.** ⚠ These are **not** pure pass-through:
  they read **decoded (IQ camelCase) fields** off the streamed message. Verified:
  - `realtime.ts:36` auto-delivery — `if (storage.getCurrentUser()?.id !== message.sender.id) markAsDelivered(message.chatRoomId, message.id)` reads `message.sender.id` / `.chatRoomId` / `.id`.
  - `realtime.ts:218` — `isChatRoom(data)` type-guard + `data.id`.
  Feeding these a **raw** payload (fields `email`/`room_id`) would break them. Therefore
  realtime is shared **only at the raw-stream level** (§4): the raw payload stream is on
  the shared surface; the v3 realtime usecases (which decode + read IQ fields) stay in
  `v3/`. **v2 subscribes to the raw stream and implements its own realtime semantics in
  `compat/realtime-bridge.js`** (delivery receipts, `selected` mutation, mitt events) —
  exactly what v2's `init()` does today. v2 gets no auto-delivery-from-usecase; it keeps
  its own `_setDelivered`/`_setRead`. This matches the v2 plan §7.

**Rule of thumb:** share a usecase across shells **only if it never inspects the shape of
the adapter/stream result.** HTTP usecases qualify; realtime usecases do not.

---

## 6. Typing strategy for `QiscusDeps` (the one fiddly bit)

`QiscusDeps` is currently typed to the **decoding** adapters (`ReturnType<typeof
getRoomAdapter>` → `IQ*`). Keep it that way: it keeps shell-v3 + the usecases fully
type-checked against `IQ*`.

- **shell-v3 (TS):** builds `deps` via `v3/deps.ts` using the decoding adapters →
  matches `QiscusDeps` exactly. No change to type-safety.
- **shell-v2 (JS):** builds `deps` with the **raw** adapters. Because `index.js` is
  JavaScript, the structural mismatch (raw adapter returns `resp`, the type says `IQ*`)
  is invisible at runtime and uncaught by tsc — v2 just reads raw fields. Acceptable
  and intentional: v2 prioritizes runtime parity, not shared types.
- **Optional (only if desired later):** make the usecases generic over adapter return
  types so both raw and IQ are honestly typed. **Not required for this refactor** —
  don't do it now; it adds TS churn for no runtime benefit.

Do **not** weaken v3's types to accommodate v2. v2's JS-ness is the escape hatch.

---

## 7. Barrels / entrypoints

- `core-v3/src/index.ts` (root barrel) — export the **raw/shared** surface: raw
  usecases (the same `usecases/*` functions), `Api` (namespace), `Provider`,
  `storageFactory`, `makeApiRequest`, the transport adapters + **raw** adapters,
  `hookAdapterFactory`/`Hooks`, `defs` callback types, `QiscusDeps`. This is what
  shell-v2 imports.
- `core-v3/src/v3/index.ts` — export the **v3** surface: `IQ*` model types, `Decoder`
  (internal-ish, optional to export), the `v3/deps.ts` builder, and re-export the
  usecases (typed → IQ when fed v3 deps). This is what shell-v3 imports.
- Wire the subpath in `core-v3/package.json` `exports`:
  ```jsonc
  "exports": {
    ".":    { "types": "./dist-types/index.d.ts",    "default": "./src/index.ts" },
    "./v3": { "types": "./dist-types/v3/index.d.ts",  "default": "./src/v3/index.ts" }
  }
  ```
  (Source-only, same pattern already in use.)

---

## 8. Execution phasing (Sonnet subagents; work in the `monorepo` worktree)

Sequential — each phase shares the package's typecheck/`.tsbuildinfo` and the barrel
contract, so they are **not** independent enough to parallelize. Keep both versions
building (`pnpm -r run build`) and core-v3 tests green after every phase.

**Phase A — Move v3 shaping into `v3/`.**
`git mv` `decoder.ts` + `model.ts` → `v3/`. Fix imports across the package. Create
`v3/index.ts` re-exporting `IQ*` + usecases. Add the `./v3` subpath export. Verify
`pnpm --filter @qiscus/core-v3 typecheck` + tests still pass, and `version-3` still
builds (update its import to `@qiscus/core-v3/v3`).

**Phase B — Split the HTTP adapters.**
For `user` / `room` / `message`: extract `*.raw.ts` (fetch-only, return raw) and make
the existing decoding adapter a thin wrapper over the raw one (moved to `v3/adapters.ts`).
Keep pre-decode massaging on the v3 side. `QiscusDeps` unchanged. Verify tests
(the existing adapter tests assert IQ → they now exercise the v3 wrapper; keep them
under `v3/` or point them at the wrapper).

**Phase C — Unified reconnect policy (§4a) ONLY. Raw-stream split DEFERRED.**
> Scope decision (user, 2026-07-02, option A): Phase C now implements **only** the
> unified MQTT reconnect policy §4a. The **raw realtime-stream split is DEFERRED** to
> the v2 realtime-bridge work (`v2-on-core-v3-plan.md` §7 / v2 Phase 4), because that
> split is deep surgery into `mqtt.ts`/`sync.ts` whose *only* consumer is v2's future
> bridge — doing it speculatively now front-loads the highest risk with no consumer to
> validate against. v3's decoded realtime streams stay exactly as they are. The
> decode-module refactor is therefore considered **complete for the HTTP path (Phases
> A+B)**; realtime raw-split is co-designed/co-tested with the v2 bridge later.

Implement §4a in `adapters/mqtt.ts`: set `reconnectPeriod: 1000` in the connect opts;
raise the LB-reconnect from a fixed 300 ms `debounce` to a **backoff-scheduled**
reconnect — add a `willConnectToRealtime` re-entrancy guard and a `reconnectFailures`
counter; delay before each LB-reconnect = `min(1000 * 2**failures, 30000)`; reset
`failures` to 0 on the `connect` event; on a successful LB node switch, persist the URL
via `storage.setBrokerUrl(url)` (for v2's `this.mqttURL` mirroring, Issue #1.1). Keep the
existing gating + topic-resubscribe. Re-run the 74 core-v3 tests (mqtt.ts is currently
untested, so also review the diff carefully); this changes v3 realtime timing, so verify
no test depends on the old 300 ms.

**Phase D — Barrels + deps builders.**
Finalize root barrel (raw surface) and `v3/deps.ts` (`buildV3Deps`). Point
`version-3/src/index.ts` at `@qiscus/core-v3/v3`. Confirm shell-v3 stays dumb.

**Phase E — Verify (Opus).** See §9.

> P-1 (token auto-refresh) is **not** part of this refactor. When it lands it goes into
> the shared `auth/` surface (benefits both shells). Track it in the v2 plan §13.

---

## 9. Verification

1. `pnpm install`; `pnpm -r run build` exits 0 — `version-3` dist (mjs/umd/cjs) +
   `types/index.d.ts` regenerate with non-zero size; `version-2` still builds; core-v3
   `dist-types` (incl. `dist-types/v3/index.d.ts`) emits.
2. `pnpm --filter @qiscus/core-v3 test` — the moved/split suite passes (74 pass /
   1 skip / 1 todo baseline). Decode tests now live under/against `v3/`.
3. **v3 byte-for-byte gate:** shell-v3 public API + behavior unchanged. Smoke:
   `node -e "const Q=require('./packages/version-3/dist/qiscus-sdk-javascript.umd.js'); const q=new (Q.default||Q)(); console.log(typeof q.setUser, typeof q.sendMessage, typeof q.onMessageReceived)"`
   → `function function function`. The 74 core-v3 tests are the real guard.
4. **Raw surface smoke:** from the root barrel, a raw adapter/usecase returns
   un-decoded JSON (e.g. `resp.results.room` present, not an `IQChatRoom`).
5. `git status` clean after asked-for commits; nothing pushed.

---

## 10. Risks / watch-list

- **Test relocation.** The existing adapter tests assert `IQ*`; after the split they
  must target the v3 decoding wrapper (move them under `v3/` or re-point imports).
  Don't delete decode coverage.
- **Realtime split subtlety.** Getting the raw vs decoded stream boundary right in
  `adapters/realtime.ts` (merged mqtt+sync) is the trickiest bit; do Phase C carefully
  and keep v3's decoded-stream behavior identical.
- **Import churn.** Moving `decoder.ts`/`model.ts` touches many imports — mechanical,
  but run tsc frequently.
- **Don't move orchestration.** Validation/`bufferUntil`/stream stays in `usecases/`.
  If tempted to duplicate it for v2, stop — that defeats the refactor.
- **Naming.** The package stays `@qiscus/core-v3` for now even though its root surface
  is version-agnostic; a future rename to `@qiscus/core` is out of scope.

## 11. Out of scope
- No behavior/API change to shell-v3; no npm package split; no publish; no push.
- P-1 token-refresh (separate; lands in `auth/`).
- Generic-typing the usecases over adapter return types (optional, later).
