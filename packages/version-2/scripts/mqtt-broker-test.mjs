#!/usr/bin/env node
/**
 * scripts/mqtt-broker-test.mjs
 *
 * MQTT broker round-trip harness for qiscus-sdk-core.
 *
 * Connects two MQTT clients to a configurable broker, has Client-1 (publisher)
 * publish a representative payload on every topic/event the SDK uses, and
 * confirms Client-2 (subscriber) receives each one. Prints an interactive
 * colored checklist; exits 0 if all 9 events pass, 1 otherwise.
 *
 * Usage:
 *   node scripts/mqtt-broker-test.mjs [--verbose] [--no-color|--plain]
 *   BROKER_URL=mqtt://broker.hivemq.com:1883 node scripts/mqtt-broker-test.mjs
 *   npm run test:mqtt
 *
 * Coloring is auto-disabled when output is not a TTY (e.g. piped to pbcopy),
 * or explicitly via --no-color / --plain / NO_COLOR env.
 *
 * No build step. No new dependencies — uses the existing mqtt v4 dep.
 * See the plan file for full env var reference.
 */

import mqtt from 'mqtt'
import { RE, buildCatalog, EVENT_COUNT } from './mqtt-events.mjs'

// ─── Config ────────────────────────────────────────────────────────────────

const BROKER_URL = process.env.BROKER_URL ?? 'wss://realtime-jogja.qiscus.com:1886/mqtt'
const MQTT_USERNAME = process.env.MQTT_USERNAME          // undefined → anonymous
const MQTT_PASSWORD = process.env.MQTT_PASSWORD
const APP_ID = process.env.APP_ID ?? 'sdksample'
const USER_ID = process.env.USER_ID ?? 'guest-1001'
const PARTNER_ID = process.env.PARTNER_ID ?? 'guest-1002'
const USER_TOKEN =
  process.env.USER_TOKEN ??
  `testtoken-${Math.random().toString(36).slice(2, 8)}`
const ROOM_ID = process.env.ROOM_ID ?? '12345'
const CHANNEL_UNIQUE_ID = process.env.CHANNEL_UNIQUE_ID ?? 'channel-001'
const EVENT_TIMEOUT_MS = Number(process.env.EVENT_TIMEOUT_MS ?? '5000')
const VERBOSE = process.argv.includes('--verbose') || process.env.DEBUG === '1'

// Coloring: off when explicitly requested, NO_COLOR is set, or stdout isn't a
// TTY (so piping to pbcopy/files yields clean, control-char-free text).
const NO_COLOR =
  process.argv.includes('--no-color') ||
  process.argv.includes('--plain') ||
  process.env.NO_COLOR != null ||
  !process.stdout.isTTY
const COLOR = !NO_COLOR
// Live spinner/line-rewrite only makes sense on an interactive color terminal.
const INTERACTIVE = COLOR && process.stdout.isTTY

// Safety: never hang longer than (all events × 2) + a buffer
const OVERALL_TIMEOUT_MS = EVENT_TIMEOUT_MS * EVENT_COUNT + 8000

// ─── ANSI helpers (no chalk) ────────────────────────────────────────────────

const paint = (code) => (s) => (COLOR ? `\x1b[${code}m${s}\x1b[0m` : String(s))
const C = {
  green:  paint(32),
  red:    paint(31),
  yellow: paint(33),
  dim:    paint(2),
  bold:   paint(1),
}

// ─── Event catalog — 9 SDK realtime events ──────────────────────────────────
//
// RE and the full catalog shape live in ./mqtt-events.mjs (shared with the
// browser page). buildCatalog binds the runtime config identifiers to topics,
// payloads, and matchRegex entries — same shape and order as before.

const catalog = buildCatalog({
  appId:           APP_ID,
  userId:          USER_ID,
  partnerId:       PARTNER_ID,
  userToken:       USER_TOKEN,
  roomId:          ROOM_ID,
  channelUniqueId: CHANNEL_UNIQUE_ID,
})

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeClientId(role) {
  return `mqtttest-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

function buildConnectOpts(clientId) {
  const opts = { clientId }
  if (MQTT_USERNAME) {
    opts.username = MQTT_USERNAME
    opts.password = MQTT_PASSWORD
  }
  return opts
}

function connectClient(url, clientId) {
  return mqtt.connect(url, buildConnectOpts(clientId))
}

function waitForConnect(client) {
  return new Promise((resolve, reject) => {
    client.once('connect', resolve)
    client.once('error', reject)
  })
}

function waitForSuback(client, topics) {
  return new Promise((resolve, reject) => {
    client.subscribe(topics, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

/**
 * Publish entry.publishTopic from pub; wait until sub receives a message on a
 * topic that matches entry.matchRegex, or EVENT_TIMEOUT_MS elapses.
 */
function runEvent(pub, sub, entry) {
  return new Promise((resolve) => {
    const startMs = Date.now()

    const timer = setTimeout(() => {
      sub.removeListener('message', handler)
      resolve({ ok: false, elapsed: EVENT_TIMEOUT_MS, topic: entry.publishTopic })
    }, EVENT_TIMEOUT_MS)

    function handler(topic, message) {
      if (VERBOSE) {
        console.log(C.dim(`       [recv] topic=${topic}  payload=${message.toString().slice(0, 120)}`))
      }
      if (entry.matchRegex.test(topic)) {
        clearTimeout(timer)
        sub.removeListener('message', handler)
        resolve({ ok: true, elapsed: Date.now() - startMs, topic })
      }
    }

    sub.on('message', handler)
    pub.publish(entry.publishTopic, entry.payload, { retain: entry.retain ?? false })
  })
}

function delay(ms) {
  return new Promise((res) => setTimeout(res, ms))
}

// ─── Live list rendering ─────────────────────────────────────────────────────
//
// One row per event. `res` is null while pending/in-progress, or the runEvent
// result once done. In LIVE mode these rows are rewritten in place so the single
// list updates from ⏳ → ✓/✗; in piped/no-color mode each row is printed once.

function statusLine(i, entry, res) {
  const idx = `[${i + 1}/${catalog.length}]`
  if (res == null) {
    return `  ${C.yellow('⏳')} ${idx} ${entry.name}  ${C.dim(entry.publishTopic)}`
  }
  if (res.ok) {
    return `  ${C.green('✓')} ${idx} ${C.green(entry.name)}` +
      `  ${C.dim(`(${res.elapsed} ms) ${entry.publishTopic}`)}`
  }
  return `  ${C.red('✗')} ${idx} ${C.red(entry.name)}` +
    `  ${C.dim(`(timeout ${EVENT_TIMEOUT_MS} ms) ${entry.publishTopic}`)}`
}

// Move the cursor up over the N already-printed rows and rewrite each in place.
// Assumes nothing else printed since the block was drawn (true in non-verbose
// interactive mode, where events run sequentially with no interleaved output).
function repaintBlock(states) {
  process.stdout.write(`\x1b[${catalog.length}A`)
  for (let i = 0; i < catalog.length; i++) {
    process.stdout.write(`\r\x1b[2K${statusLine(i, catalog[i], states[i])}\n`)
  }
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const subClientId = makeClientId('sub')
  const pubClientId = makeClientId('pub')
  const TOTAL = catalog.length  // 9

  // ── Header ──
  console.log('')
  console.log(C.bold('═══ MQTT Broker Round-Trip Test ═══'))
  console.log(C.dim(`Broker    : ${BROKER_URL}`))
  console.log(C.dim(`Auth      : ${MQTT_USERNAME ? `on  (username=${MQTT_USERNAME})` : 'off (anonymous)'}`))
  console.log(C.dim(`Sub id    : ${subClientId}`))
  console.log(C.dim(`Pub id    : ${pubClientId}`))
  console.log(C.dim(`Timeout   : ${EVENT_TIMEOUT_MS} ms / event`))
  if (VERBOSE) console.log(C.dim(`Verbose   : on`))
  console.log('')

  // ── Overall safety timeout (never hangs) ──
  const safetyHandle = setTimeout(() => {
    console.error(C.red('\nOverall safety timeout reached — forcing exit.'))
    process.exit(2)
  }, OVERALL_TIMEOUT_MS)
  // Don't keep process alive just for this timer
  if (typeof safetyHandle.unref === 'function') safetyHandle.unref()

  // ── Step 1: connect subscriber first ──
  let sub, pub
  try {
    sub = connectClient(BROKER_URL, subClientId)
    await waitForConnect(sub)
    if (VERBOSE) console.log(C.dim('  [sub] connected'))
  } catch (err) {
    console.error(C.red(`Failed to connect subscriber: ${err.message}`))
    process.exit(1)
  }

  // ── Step 2: subscribe to all SDK topic patterns (mirrors real SDK subscriptions) ──
  // Collect unique subscription topics across all catalog entries
  const subTopics = [...new Set(catalog.map((e) => e.subscribeTopic))]
  try {
    await waitForSuback(sub, subTopics)
    if (VERBOSE) console.log(C.dim(`  [sub] subscribed: ${subTopics.join(', ')}`))
  } catch (err) {
    console.error(C.red(`Failed to subscribe: ${err.message}`))
    process.exit(1)
  }

  // Drain any retained messages that arrived immediately on subscription.
  // They have no registered handler yet, so they're silently dropped here.
  // This prevents a stale retained-presence message from triggering the
  // presence event test before we even publish.
  await delay(300)

  // ── Step 3: connect publisher ──
  try {
    pub = connectClient(BROKER_URL, pubClientId)
    await waitForConnect(pub)
    if (VERBOSE) console.log(C.dim('  [pub] connected'))
  } catch (err) {
    console.error(C.red(`Failed to connect publisher: ${err.message}`))
    process.exit(1)
  }

  // ── Step 4: render one event list and run each event sequentially ──
  // LIVE = rewrite the list rows in place (interactive TTY, non-verbose), so a
  // single section updates ⏳ → ✓/✗. Otherwise (piped/no-color, or verbose where
  // recv logs would interleave) print one finished row per event — still a
  // single section, no duplicate pending block.
  const LIVE = INTERACTIVE && !VERBOSE
  const states = new Array(catalog.length).fill(null)

  console.log(C.bold('Events:'))
  if (LIVE) {
    // Draw the initial all-pending block; rows are rewritten in place below.
    for (let i = 0; i < catalog.length; i++) {
      console.log(statusLine(i, catalog[i], null))
    }
  }

  const results = []
  for (let i = 0; i < catalog.length; i++) {
    const entry = catalog[i]
    const result = await runEvent(pub, sub, entry)
    states[i] = result
    results.push({ entry, result })

    if (LIVE) repaintBlock(states)
    else console.log(statusLine(i, entry, result))
  }

  console.log('')

  // ── Step 5: summary ──
  const passed = results.filter((r) => r.result.ok).length
  const failures = results.filter((r) => !r.result.ok)

  if (passed === TOTAL) {
    console.log(C.green(C.bold(`✓ ${passed}/${TOTAL} passed — all events round-tripped successfully.`)))
  } else {
    console.log(C.red(C.bold(`✗ ${passed}/${TOTAL} passed.`)))
    console.log('')
    console.log('Failures:')
    failures.forEach(({ entry }) => {
      console.log(C.red(`  ✗ ${entry.name}`))
      console.log(C.dim(`      topic: ${entry.publishTopic}`))
    })
  }

  console.log('')

  // ── Step 6: clean shutdown ──
  clearTimeout(safetyHandle)
  await new Promise((res) => pub.end(false, {}, res))
  await new Promise((res) => sub.end(false, {}, res))

  process.exit(passed === TOTAL ? 0 : 1)
}

main().catch((err) => {
  console.error(C.red(`\nFatal: ${err.stack ?? err.message}`))
  process.exit(1)
})
