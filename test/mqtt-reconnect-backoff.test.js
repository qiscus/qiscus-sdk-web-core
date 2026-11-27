import net from 'net'
import { expect } from 'chai'
import MqttAdapter from '../src/lib/adapters/mqtt'
import {
  DEFAULT_RECONNECT_BACKOFF,
  reconnectDelay,
} from '../src/lib/reconnect-backoff'

// Pins the retry rhythm of the realtime connection. A broker that refuses
// every CONNECT (anonymous access switched off, or wrong credentials) used to
// be retried once per second per tab, forever.

// Fixed jitter factor of 1.0, so delays are exact powers of two.
const MIDDLE = () => 0.5

describe('reconnectDelay', () => {
  const cfg = { baseMs: 1000, maxMs: 30000, random: MIDDLE }

  it('doubles with every retry', () => {
    expect(reconnectDelay(1, cfg)).to.equal(2000)
    expect(reconnectDelay(2, cfg)).to.equal(4000)
    expect(reconnectDelay(3, cfg)).to.equal(8000)
    expect(reconnectDelay(4, cfg)).to.equal(16000)
  })

  it('stops growing at the cap', () => {
    expect(reconnectDelay(5, cfg)).to.equal(30000)
    expect(reconnectDelay(50, cfg)).to.equal(30000)
    expect(reconnectDelay(100000, cfg)).to.equal(30000)
  })

  it('spreads retries by +-20% and never passes the cap', () => {
    expect(reconnectDelay(2, { ...cfg, random: () => 0 })).to.equal(3200)
    expect(reconnectDelay(2, { ...cfg, random: () => 1 })).to.equal(4800)
    expect(reconnectDelay(10, { ...cfg, random: () => 1 })).to.equal(30000)
  })

  it('never goes below the base period or returns a non-finite number', () => {
    for (const attempt of [0, 1, 2, 7, 1000, Infinity]) {
      const d = reconnectDelay(attempt, { ...cfg, random: () => 0 })
      expect(Number.isFinite(d)).to.equal(true)
      expect(d).to.be.at.least(cfg.baseMs)
    }
  })

  it('has defaults that keep the first retry at one second', () => {
    expect(DEFAULT_RECONNECT_BACKOFF.baseMs).to.equal(1000)
    expect(DEFAULT_RECONNECT_BACKOFF.maxMs).to.equal(30000)
  })
})

// A broker that answers the first CONNECT of each connection with the given
// CONNACK return code (0 = accepted, 4 = bad user name or password).
const startBroker = (answer) => {
  const connects = []
  const sockets = new Set()
  const server = net.createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => {})
    socket.once('data', () => {
      const index = connects.length
      connects.push(Date.now())
      const rc = answer(index)
      socket.write(Buffer.from([0x20, 0x02, 0x00, rc]))
      if (rc !== 0) socket.end()
    })
  })
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        url: `mqtt://127.0.0.1:${server.address().port}`,
        connects,
        dropAll: () => sockets.forEach((s) => s.destroy()),
        close: () => {
          sockets.forEach((s) => s.destroy())
          return new Promise((r) => server.close(r))
        },
      })
    )
  )
}

const makeAdapter = (url, options = {}) => {
  const core = {
    AppId: 'app',
    user_id: 'user@example.com',
    userData: {},
    isLogin: false,
    debugMQTTMode: false,
    mqttURL: url,
  }
  return new MqttAdapter(url, core, false, {
    shouldConnect: true,
    enableLb: false,
    getClientId: () => `client-${Math.random()}`,
    reconnectBackoff: { baseMs: 60, maxMs: 240, random: MIDDLE },
    ...options,
  })
}

const until = async (predicate, timeoutMs, what) => {
  const start = Date.now()
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout: ${what}`)
    await new Promise((r) => setTimeout(r, 10))
  }
}

const gaps = (times) => times.slice(1).map((t, i) => t - times[i])

describe('MqttAdapter reconnect backoff', function () {
  this.timeout(8000)

  let broker
  let adapter
  afterEach(async () => {
    if (adapter && adapter.mqtt) adapter.mqtt.end(true)
    adapter = null
    if (broker) await broker.close()
    broker = null
  })

  it('backs off while the broker keeps refusing the connection', async () => {
    broker = await startBroker(() => 4)
    adapter = makeAdapter(broker.url)

    await until(() => broker.connects.length >= 6, 6000, '6 CONNECT attempts')
    const g = gaps(broker.connects)

    // base 60ms, cap 240ms: ~60, ~120, ~240, ~240, ~240
    expect(g[0], 'first retry stays at the base period').to.be.below(115)
    expect(g[1]).to.be.above(g[0] + 30)
    expect(g[2]).to.be.above(g[1] + 60)
    expect(g[3], 'capped').to.be.below(240 + 110)
    expect(g[4], 'capped').to.be.below(240 + 110)
  })

  it('goes back to the base period after a successful connection', async () => {
    broker = await startBroker((index) => (index < 3 ? 4 : 0))
    adapter = makeAdapter(broker.url)
    let connected = false
    adapter.on('connected', () => (connected = true))

    await until(() => connected, 4000, 'connected')
    expect(adapter._reconnectAttempts).to.equal(0)
    expect(adapter.mqtt.options.reconnectPeriod).to.equal(60)

    // The broker drops us once: the next retry is at the base period again,
    // not at wherever the earlier refusals had pushed it.
    const droppedAt = Date.now()
    const before = broker.connects.length
    broker.dropAll()
    await until(() => broker.connects.length > before, 3000, 'retry')
    expect(broker.connects[before] - droppedAt).to.be.below(60 + 90)
  })

  it('stops retrying once the connection is closed on purpose', async () => {
    broker = await startBroker(() => 4)
    adapter = makeAdapter(broker.url)
    await until(() => broker.connects.length >= 2, 3000, '2 CONNECT attempts')

    await adapter.closeConnection()
    const seen = broker.connects.length
    await new Promise((r) => setTimeout(r, 500))
    expect(broker.connects.length).to.equal(seen)
  })

  it('keeps reconnectPeriod positive, so topics survive for the resubscribe', async () => {
    broker = await startBroker(() => 4)
    adapter = makeAdapter(broker.url)
    await until(() => broker.connects.length >= 4, 4000, '4 CONNECT attempts')

    // mqtt.js only records a subscription for resubscribing while
    // reconnectPeriod > 0, and __mqtt_conneck carries those topics over to the
    // next client. A period of 0 would silently drop them.
    expect(adapter.mqtt.options.reconnectPeriod).to.be.above(0)
    adapter.subscribe('user/c')
    expect(Object.keys(adapter.mqtt._resubscribeTopics)).to.include('user/c')
  })
})

describe('MqttAdapter load balancer failover backoff', function () {
  this.timeout(8000)

  const DEAD_BROKER = 'ws://127.0.0.1:9/mqtt'
  let adapter
  afterEach(() => {
    if (adapter) adapter._on_close_handler.cancel()
    if (adapter && adapter.mqtt) adapter.mqtt.end(true)
    adapter = null
  })

  const makeLbAdapter = () => {
    const a = makeAdapter(DEAD_BROKER, {
      enableLb: true,
      brokerLbUrl: 'https://lb.example.com',
    })
    a.core.isLogin = true
    a.mqtt.end(true) // keep the real client quiet; failover is driven by hand
    a.getMqttNode = async () => 'ws://127.0.0.1:9/node'
    a.replacements = []
    a.__mqtt_conneck = () => {
      a.replacements.push(Date.now())
      return a.mqtt
    }
    return a
  }

  const closeOnce = async (a) => {
    a._on_close_handler()
    await a._on_close_handler.flush()
  }

  it('fails over at once the first time, then waits longer each time', async () => {
    adapter = makeLbAdapter()

    const t0 = Date.now()
    await closeOnce(adapter) // no wait
    await closeOnce(adapter) // ~120ms
    await closeOnce(adapter) // ~240ms (cap)
    await closeOnce(adapter) // ~240ms (cap)

    const g = gaps([t0, ...adapter.replacements])
    expect(g[0], 'first failover is immediate').to.be.below(50)
    expect(g[1]).to.be.within(100, 200)
    expect(g[2]).to.be.within(200, 330)
    expect(g[3], 'capped').to.be.within(200, 330)
  })

  it('does not replace the client when the old one came back while waiting', async () => {
    adapter = makeLbAdapter()
    await closeOnce(adapter)
    const replaced = adapter.replacements.length

    const pending = closeOnce(adapter)
    // The old client's own retry succeeds during the wait.
    Object.defineProperty(adapter.mqtt, 'connected', { value: true })
    await pending

    expect(adapter.replacements.length).to.equal(replaced)
    expect(adapter.willConnectToRealtime).to.equal(false)
  })

  it('does not replace the client when the user logged out while waiting', async () => {
    adapter = makeLbAdapter()
    await closeOnce(adapter)
    const replaced = adapter.replacements.length

    const pending = closeOnce(adapter)
    adapter.core.isLogin = false
    await pending

    expect(adapter.replacements.length).to.equal(replaced)
    expect(adapter.willConnectToRealtime).to.equal(false)
  })
})
