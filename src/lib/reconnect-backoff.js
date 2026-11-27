/**
 * Retry rhythm of the realtime (MQTT) connection.
 *
 * mqtt.js retries a failed connection every `reconnectPeriod` ms, forever, and
 * the load balancer failover in `MqttAdapter` asks for a new broker node on
 * every close. A broker that refuses every CONNECT (anonymous access turned
 * off, wrong credentials) therefore got one attempt per second from every open
 * tab. The retry period now doubles with each failed retry, up to a cap, and
 * goes back to the base period after a successful connection.
 *
 * @typedef {Object} ReconnectBackoff
 * @property {number} baseMs period of the first retry, and the floor
 * @property {number} maxMs  cap of the period
 * @property {() => number} random source of jitter, in [0, 1)
 */

/** @type {ReconnectBackoff} */
export const DEFAULT_RECONNECT_BACKOFF = {
  baseMs: 1000,
  maxMs: 30000,
  random: Math.random,
}

// Spread of the period, so tabs that lost the connection together (a broker
// restart) do not all retry in the same instant.
const JITTER = 0.2

/**
 * Period to wait before the next retry, after `attempt` retries already
 * started (1 = the first retry has started and failed).
 *
 * The very first retry after a drop is not computed here: it keeps the base
 * period (mqtt.js option), so a single transient drop recovers exactly as fast
 * as before.
 *
 * @param {number} attempt
 * @param {Partial<ReconnectBackoff>} [config]
 * @return {number} milliseconds, never below `baseMs` and never above `maxMs`
 */
export function reconnectDelay(attempt, config = {}) {
  const { baseMs, maxMs, random } = { ...DEFAULT_RECONNECT_BACKOFF, ...config }
  // Beyond ~30 doublings the number is far past any cap; clamping the exponent
  // keeps it finite for any input.
  const exponent = Math.min(Math.max(attempt, 0), 30)
  const grown = Math.min(maxMs, baseMs * 2 ** exponent)
  const jittered = grown * (1 - JITTER + random() * 2 * JITTER)
  return Math.round(Math.min(maxMs, Math.max(baseMs, jittered)))
}
