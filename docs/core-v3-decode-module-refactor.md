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
**exact same usecases** serve both shells:
- shell-v3 injects **v3 (decoding) adapters** → usecases return `IQ*` (types hold).
- shell-v2 injects **raw adapters** → usecases return raw JSON at runtime.

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

## 5. Usecases: untouched

`usecases/*.ts` **do not change**. They already call `deps.<adapter>.<method>` and pass
through the result. The only thing that differs between shells is *which* adapters are
in `deps` (raw vs decoding). Do **not** move validation/`bufferUntil`/stream logic; it
is shared orchestration and must stay in one place so both shells inherit it. This is
the whole point — the DRY win the user asked for.

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

**Phase C — Split the realtime streams.**
Separate raw payload streams (shared) from `Decoder.message`-mapped streams (`v3/`).
shell-v3's realtime usecases consume the decoded streams (unchanged behavior). Expose
the raw streams on the root barrel for v2's bridge.

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
