# HANDOVER — `monorepo` branch (v2 re-platformed onto `@qiscus/core-v3`)

**Last updated:** 2026-08-03 · **Branch:** `monorepo` (100 commits ahead of `master`, base `c59a9687`)
· **Never pushed — local only.**

---

## 1. What this branch is

`sdk-js` restructured into a pnpm workspace where **all SDK logic lives once** in a private
core package, and both public SDKs are thin shells over it:

| Package | npm name | Role |
|---|---|---|
| `packages/core-v3` | `@qiscus/core-v3` | **Private, never published.** Single source of truth: HTTP transport (axios), `Api.*` request builders, raw + decoded adapters, realtime (MQTT + sync poll), token-refresh scheduler, usecases. |
| `packages/version-2` | `qiscus-sdk-core` | Legacy v2 SDK (`QiscusSDK`, used by Vue customers). Thin shell: mutable state, `Comment`/`Room` models, mitt events, delegations. |
| `packages/version-3` | `qiscus-sdk-javascript` | v3 SDK. Thin shell: IQ-shaped state + delegations. |

**The goal driving all of it:** a new feature is written **once** in core-v3 and both shells get
it — no more implementing the same thing twice. Bidirectional: both v2 and v3 are actively
maintained.

**The hard constraint:** v2's public behavior + public mutable variables (`qiscus.selected`,
`qiscus.rooms`, `qiscus.mqttURL`, `qiscus.isLogin`, `qiscus.userData`, …) stay byte-for-byte
compatible, because Vue customers read/write them directly.

---

## 2. Getting started

```fish
cd /Users/afief/code/qiscus/sdk-js   # `monorepo` is checked out here directly (no worktree)
pnpm install                          # workspace root
```

> **History:** this work used to live in a linked worktree (`.claude/worktrees/monorepo`). On
> 2026-08-03 that worktree was removed and `monorepo` is now checked out in the repo root like
> any normal branch. A safety tag **`backup/monorepo-2026-08-03`** marks the state at migration
> time — delete it whenever you want: `git tag -d backup/monorepo-2026-08-03`.
>
> Leftovers from the previously checked-out branch may sit untracked in the repo root
> (`dist/`, `lib/`, `coverage/`); they are stale build output from the old non-workspace layout
> (this branch builds into `packages/*/dist`) and are safe to delete.

### Test / build commands (all must be green before any commit)

```fish
# core-v3 (vitest) — expect: 127 passed | 1 skipped
pnpm --filter @qiscus/core-v3 test

# v2 parity/compat suite — expect: 82 passing, 0 failing
cd packages/version-2; npx mocha --require esbuild-register 'src/compat/*.test.js'

# v2 legacy baseline — expect: 20 passing / 1 FAILING (pre-existing, see §6)
cd packages/version-2; npx mocha --require esbuild-register 'test/**/*test.js'

# builds
pnpm --filter qiscus-sdk-core run build:lib          # v2
pnpm --filter qiscus-sdk-javascript run build        # v3 (vite + tsc)
```

> ⚠️ **The 82-test compat suite is NOT part of `pnpm test`.** v2's `test` script only runs
> `test/**/*test.js`. The entire parity safety net for this migration lives in
> `packages/version-2/src/compat/*.test.js` and must be run explicitly (see above).
> **Worth fixing:** add it to the `test` script so CI/`pnpm test` can't silently skip it.
>
> The core-v3 suite uses **real timers** with small delays (vitest 0.25.8 has no async
> fake-timer helpers), so it takes a while — allow generous timeouts.

---

## 3. Architecture

```
@qiscus/core-v3  ── the only place logic lives
  makeApiRequest (axios)            the only HTTP client
  Api.* builders + raw adapters     return RAW json
  getMqttAdapter                    MQTT connection, LB-reconnect, buffered pub/sub
  getSyncAdapter                    HTTP-poll loop + MQTT-fallback interval
  parseRealtimeEvent / classifySyncEvents   shared parsing (topic -> CanonicalEvent)
  getTokenRefreshScheduler          auto-refresh timer + token rotation
  usecases/*                        v3-shaped orchestration (see §5 on P4)
        │                                         │
   version-3 shell                          version-2 shell
   raw -> Decoder -> IQ                      raw -> new Comment()/new Room()
   IQ-shaped state                           v2 mutable vars (PRESERVED)
```

**The pattern that made byte-parity possible:** where v2 and v3 genuinely differ, a *thin
per-shell adapter* absorbs the difference while the logic stays shared. Examples:

- `compat/axios-requester.js` — reproduces superagent's error shape
  (`err.status`, `err.response.{status,body}`) + 403 refresh-retry over core-v3's axios.
- `compat/realtime-bridge.js` — maps the shared `CanonicalEvent` onto v2's mitt payloads.
- `lib/adapters/mqtt.js` / `sync.js` — v2 facades that keep v2's exact method/event surface
  but delegate connection, topics, buffering, and the poll loop to core-v3.

### What legitimately stays in v2's shell (this is what makes it a *shell*, not *empty*)

`packages/version-2/src/lib/adapters/` still has 5 files — **none of them do HTTP**:

| File | Why it stays |
|---|---|
| `mqtt.js` | v2's realtime facade (public API the UI uses) + event translation. Connection is core-v3's. |
| `sync.js` | v2's gating/emit shapes. Poll loop is core-v3's. |
| `custom-event.js` | v2-specific custom-event helper. |
| `expired-token.js` | Thin delegator to core-v3's scheduler. |
| `hook.js` | v2 interceptor helper. |

---

## 4. What is DONE

Full detail (with commit SHAs per step) is in **`docs/v2-full-shell-plan.md`** — that is the
authoritative log. Summary:

- **P1 — HTTP transport unified.** v2's superagent transport replaced by core-v3's axios, with
  its exact error contract reproduced (pinned by characterization tests first).
- **P2 — All keep-in-shell HTTP methods re-platformed.** Added 3 approved core-v3 primitives:
  `upload` (multipart + progress), `getUserPresences`, parameterized `deleteMessages` flags.
- **P3 — Realtime unified.** MQTT connection/facade → `getMqttAdapter` (Fable-reviewed);
  sync transport **and** poll loop → `getSyncAdapter` (raw firehose `onRawMessages`/`onRawEvents`
  + `syncOnlyWhenDisconnected` gate so v2's "stop syncing while MQTT is up" is preserved).
- **P5 — Shell reduction.** Removed 18 `_legacy*` methods, the phase parity scaffolding, and the
  old superagent `UserAdapter`/`RoomAdapter`. Auth cluster (refresh/logout) + login
  (`login_or_register`) re-platformed. **`HttpAdapter` and `AuthAdapter` deleted — v2's runtime
  is now superagent-free.**
- **Token refresh.** The auto-refresh scheduler (timer, rotation, guard) lifted into core-v3
  (`getTokenRefreshScheduler`); v2's adapter is a thin delegator. **v3 now has auto-refresh too**
  (it previously had none): login persists `refresh_token`/`token_expires_at`, and
  `startTokenRefresh(deps)` arms the scheduler **when both are present** (same rule as v2 — no
  config gate). On refresh, the token-keyed MQTT user channel is re-subscribed with the new
  token; `clearUser` stops the scheduler and clears the stored fields.

**Net result: no real duplication left** between v2 and v3 for transport, realtime, or token
lifecycle.

---

## 5. What is NOT done

### P4 — model-agnostic usecases + orchestration (deliberately deferred)

Refactoring core-v3's usecases so model construction + state mutation are injected, then moving
v2's optimistic-send (`_pendingComments`, `markAsSent`, retry) and `chatTarget`/`setActiveRoom`
flows into shared usecases.

**Why it was deferred (read before picking it up):** this is *not* a dedup. v2's stateful
orchestration has **no equivalent in v3** — v3 uses xstream + IQ streams, v2 mutates
`selected.comments` arrays of `Comment`. So unifying means *changing v3's production behavior* to
adopt v2's model (or vice versa), touching the most complex stateful code, with **no clean parity
oracle** to verify against — unlike P1–P3 which all had characterization tests. High risk, and
the payoff is small because the duplication that actually cost double work (endpoints, transport,
realtime) is already gone.

If it is picked up: do it **characterization-first, one method at a time**, never as a sweep.

### Smaller open items

- **v2's `auto_refresh_token` app-config flag is dead code** — set from config, never read (it
  used to feed the deleted `AuthAdapter`). It's the natural gate to wire if token refresh should
  ever become server-controlled. Left unwired on purpose (wiring it would *change* v2 behavior).
- `searchMessages` and `getRoomParticipants` (both deprecated) build inline `Api.*` descriptors
  rather than having dedicated raw-adapter methods — fine, but slightly inconsistent.

---

## 6. ⚠️ Release gates — MUST verify against a real backend before shipping

Everything below is implemented and unit-tested, but **cannot be verified in this repo** (no
network/broker). Do not ship without checking these by hand:

1. **Login** — the accepted `x-www-form-urlencoded` → JSON Content-Type change on
   `login_or_register`.
2. **Token refresh + logout** — for **v2 and now also v3**: 403 → `refresh_user_token` → retry;
   token rotation; and that realtime keeps working *after* a refresh (the MQTT user channel is
   re-subscribed with the new token — if this breaks, messages silently stop arriving).
3. **Realtime two-client soak** — kill the broker: LB failover + resubscribe; sync poll takes
   over while MQTT is down and backs off when it returns; presence
   (`publishOnlinePresence(false)` → the peer sees offline within ~3.5s); last-will on tab kill;
   no double connection after re-init.
4. **File upload** — the multipart transfer is browser-runtime (axios + `FormData` +
   `onUploadProgress`) and is only unit-tested at the shell-adaptation level with a stub. Test a
   real upload in a browser.

### Accepted behavior divergences (deliberate, documented, v3-proven)

- POST bodies: urlencoded → JSON (all re-platformed POSTs).
- Envelope-status rejections (HTTP 200 but `body.status != 200`) reject with a reconstructed
  `{status, body}` instead of the whole superagent `res`. The common HTTP-error path is identical.
- MQTT reconnect: fixed ~1s retry → **exponential backoff 1s→30s** + suppressed library retry.
  This changes how often `onReconnectCallback` fires during an outage.
- MQTT last-will payload `0` (number) → `'0'` (string), plus `qos: 1`.
- `disconnect()` sends N per-topic UNSUBSCRIBE packets instead of one array packet.
- LB-node fetch now carries auth headers; mqtt lib `~4.2.6` → `^4.3.8`.
- Pre-auth endpoints send `qiscus-sdk-*` (hyphen) headers instead of `qiscus_sdk_*` (underscore).
- Deprecated `searchMessages` omits fields instead of sending explicit `null`;
  `getRoomParticipants` now also sends `sorting=asc`.

---

## 7. Working conventions (please keep)

- **Do not push.** This branch has always been local-only. ⚠️ **That also means 100 commits of
  work exist on exactly one machine** — if losing it would hurt, push it to a remote branch or
  at least tag it.
- **Only commit when asked**; when committing, keep commits small and focused (one reviewable
  question each), plain imperative subjects matching `git log` style, and end with the
  `Co-Authored-By: Claude …` trailer.
- **Discuss core-v3 changes before making them** — both shells depend on it.
- **Characterization-first for anything risky:** pin the current observable behavior in a test,
  *then* change the implementation, *then* prove the pinned test still passes. This is how P1, P3,
  and the login swap were done safely, and it is why the migration didn't break v2.
- Never `--no-verify`.

### Known issue

`packages/version-2`'s legacy suite has **1 pre-existing failure** (`Qiscus SDK Core > Comment >
should escape special char in message`). It predates this migration and is unrelated — do not
treat it as a regression, but don't let it mask new ones either.

---

## 8. Where to look

| Doc | Contents |
|---|---|
| `docs/v2-full-shell-plan.md` | **Authoritative log** of the whole migration: every phase, commit SHAs, accepted divergences, release gates, deferred items. |
| `docs/migrations.md` | Earlier migration handoff notes. |
| `docs/v2-core-v3-gaps.md` | v2 vs core-v3 feature gap analysis. |
| `docs/v2-on-core-v3-plan.md` | The original (now superseded) per-shell-transport plan. |
| `docs/features.md`, `docs/core-v3-decode-module-refactor.md` | Supporting notes. |

**Key files to read first:** `packages/core-v3/src/index.ts` (the public surface of core),
`packages/version-2/src/compat/deps.js` (how v2 wires itself to core-v3),
`packages/version-2/src/index.js` (the v2 shell).
