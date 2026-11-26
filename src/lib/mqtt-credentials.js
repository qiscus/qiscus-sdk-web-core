import { wrapP } from './util'

export const MQTT_CONFIG_PATH = 'api/v2/sdk/mqtt_config'
export const MQTT_CONFIG_TIMEOUT = 3000

const withTimeout = (promise, ms) => {
  let timer = null
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`mqtt_config timeout after ${ms}ms`)),
      ms
    )
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/**
 * Normalize the `results` of `GET api/v2/sdk/mqtt_config` into broker
 * credentials.
 *
 * Only `username` / `password` are used. The `url` field is deliberately
 * ignored: it is the broker sdk-api publishes to (it may be an internal host
 * or a plain TCP listener), while the browser keeps connecting to the broker
 * it resolves today (`mqttURL` / app config `broker_url` / broker LB).
 *
 * @param {any} results
 * @return {{ username: string, password: string } | null} `null` means
 *   "connect anonymously", which is exactly the behavior before this feature.
 */
export function parseMqttCredentials(results) {
  if (results == null || typeof results !== 'object') return null
  const { username, password } = results
  if (typeof username !== 'string' || username.length === 0) return null
  return {
    username,
    password: typeof password === 'string' ? password : '',
  }
}

/**
 * Fetch broker credentials. Never throws: any failure (endpoint not deployed,
 * network error, timeout, malformed body) resolves to `{ ok: false }` so the
 * caller keeps the current (anonymous) connection untouched.
 *
 * @param {() => Promise<any>} request performs the authenticated GET
 * @param {{ timeout?: number }} [options]
 * @return {Promise<{ ok: true, credentials: ({ username: string, password: string } | null) } | { ok: false, error: any }>}
 */
export async function fetchMqttCredentials(
  request,
  { timeout = MQTT_CONFIG_TIMEOUT } = {}
) {
  const [res, err] = await wrapP(
    withTimeout(Promise.resolve().then(request), timeout)
  )
  if (err != null) return { ok: false, error: err }
  const results = res?.body?.results
  if (results == null) {
    return { ok: false, error: new Error('mqtt_config has no results') }
  }
  return { ok: true, credentials: parseMqttCredentials(results) }
}
