import { expect } from 'chai'
import {
  fetchMqttCredentials,
  parseMqttCredentials,
} from '../src/lib/mqtt-credentials'
import MqttAdapter from '../src/lib/adapters/mqtt'
import QiscusSDK from '../src/index'

// Port that nothing listens on: the client is created (so its options can be
// inspected) but never connects.
const DEAD_BROKER = 'ws://127.0.0.1:9/mqtt'

const makeAdapter = () => {
  const core = {
    AppId: 'app',
    user_id: 'user@example.com',
    userData: {},
    isLogin: false,
    debugMQTTMode: false,
    mqttURL: DEAD_BROKER,
  }
  return new MqttAdapter(DEAD_BROKER, core, false, {
    shouldConnect: true,
    enableLb: false,
    getClientId: () => 'client-id',
  })
}

describe('mqtt_config credentials', () => {
  describe('parseMqttCredentials', () => {
    it('returns credentials when username is present', () => {
      expect(
        parseMqttCredentials({ url: 'h', username: 'u', password: 'p' })
      ).to.deep.equal({ username: 'u', password: 'p' })
    })
    it('treats empty username as anonymous (current sdk-api default)', () => {
      expect(parseMqttCredentials({ url: 'h', username: '', password: '' })).to
        .be.null
    })
    it('treats missing fields as anonymous', () => {
      expect(parseMqttCredentials({ url: 'h' })).to.be.null
      expect(parseMqttCredentials(null)).to.be.null
    })
    it('defaults a missing password to empty string', () => {
      expect(parseMqttCredentials({ username: 'u' })).to.deep.equal({
        username: 'u',
        password: '',
      })
    })
  })

  describe('fetchMqttCredentials', () => {
    it('resolves ok with credentials', async () => {
      const res = await fetchMqttCredentials(async () => ({
        body: { results: { url: 'h', username: 'u', password: 'p' } },
      }))
      expect(res).to.deep.equal({
        ok: true,
        credentials: { username: 'u', password: 'p' },
      })
    })
    it('never throws on HTTP error (endpoint not deployed)', async () => {
      const res = await fetchMqttCredentials(async () => {
        const err = new Error('Not Found')
        err.status = 404
        throw err
      })
      expect(res.ok).to.equal(false)
    })
    it('never throws when the request function throws synchronously', async () => {
      const res = await fetchMqttCredentials(() => {
        throw new TypeError('HTTPAdapter is null')
      })
      expect(res.ok).to.equal(false)
    })
    it('gives up after the timeout', async () => {
      const res = await fetchMqttCredentials(() => new Promise(() => {}), {
        timeout: 20,
      })
      expect(res.ok).to.equal(false)
      expect(res.error.message).to.contain('timeout')
    })
    it('treats a body without results as unavailable', async () => {
      const res = await fetchMqttCredentials(async () => ({ body: {} }))
      expect(res.ok).to.equal(false)
    })
  })
})

describe('MqttAdapter credentials', () => {
  let adapter
  afterEach(() => {
    if (adapter && adapter.mqtt) adapter.mqtt.end(true)
    adapter = null
  })

  it('connects anonymously by default (no username/password in CONNECT)', () => {
    adapter = makeAdapter()
    expect(adapter.mqtt.options).to.not.have.property('username')
    expect(adapter.mqtt.options).to.not.have.property('password')
  })

  it('sends credentials on reconnect after setCredentials', () => {
    adapter = makeAdapter()
    expect(adapter.setCredentials({ username: 'u', password: 'p' })).to.equal(
      true
    )
    adapter.connect()
    expect(adapter.mqtt.options.username).to.equal('u')
    expect(adapter.mqtt.options.password).to.equal('p')
  })

  it('keeps credentials for openConnection()', async () => {
    adapter = makeAdapter()
    adapter.setCredentials({ username: 'u', password: 'p' })
    await adapter.openConnection()
    expect(adapter.mqtt.options.username).to.equal('u')
  })

  it('restores subscribed topics when reconnecting with credentials', () => {
    adapter = makeAdapter()
    adapter.subscribe('token/c')
    adapter.setCredentials({ username: 'u', password: 'p' })
    adapter.connect()
    expect(Object.keys(adapter.mqtt._resubscribeTopics)).to.include('token/c')
  })

  it('reports whether the credentials changed', () => {
    adapter = makeAdapter()
    expect(adapter.setCredentials(null)).to.equal(false)
    expect(adapter.setCredentials({ username: 'u', password: 'p' })).to.equal(
      true
    )
    expect(adapter.setCredentials({ username: 'u', password: 'p' })).to.equal(
      false
    )
    expect(adapter.setCredentials({ username: 'u', password: 'q' })).to.equal(
      true
    )
    expect(adapter.setCredentials(null)).to.equal(true)
  })
})

describe('QiscusSDK post-login realtime connection', () => {
  const okCreds = () =>
    Promise.resolve({
      body: { results: { url: 'h', username: 'u', password: 'p' } },
    })
  const okEmpty = () =>
    Promise.resolve({
      body: { results: { url: 'h', username: '', password: '' } },
    })
  const fail = () => Promise.reject(new Error('404'))

  const setup = (response, { enableMqttAuth } = {}) => {
    const sdk = new QiscusSDK()
    if (enableMqttAuth != null) sdk.enableMqttAuth = enableMqttAuth
    sdk.isLogin = true
    const calls = { get: [], connect: [] }
    let resolveGet
    sdk.HTTPAdapter = {
      get: (path) => {
        calls.get.push(path)
        if (response === 'pending') {
          return new Promise((r) => {
            resolveGet = r
          })
        }
        return response()
      },
    }
    sdk.realtimeAdapter = {
      shouldConnect: true,
      credentials: null,
      setCredentials(c) {
        const changed =
          JSON.stringify(c) !== JSON.stringify(this.credentials)
        this.credentials = c
        return changed
      },
      connect() {
        calls.connect.push(this.credentials)
      },
    }
    // what the login-success handler does
    const login = () => {
      sdk._loginGeneration += 1
      sdk._mqttCredentialsReady = sdk._loadMqttCredentials(
        sdk._loginGeneration
      )
    }
    return { sdk, calls, login, resolve: (v) => resolveGet(v) }
  }
  const flush = () => new Promise((r) => setTimeout(r, 0))

  describe('setUser path (_connectRealtimeAfterLogin)', () => {
    it('waits for mqtt_config, then connects ONCE with credentials', async () => {
      const { sdk, calls, login, resolve } = setup('pending')
      login()
      sdk._connectRealtimeAfterLogin()
      await flush()
      expect(calls.connect).to.have.length(0) // no anonymous attempt first
      resolve({ body: { results: { username: 'u', password: 'p' } } })
      await flush()
      expect(calls.get).to.deep.equal(['api/v2/sdk/mqtt_config'])
      expect(calls.connect).to.deep.equal([{ username: 'u', password: 'p' }])
    })

    it('connects anonymously when mqtt_config has no username', async () => {
      const { sdk, calls, login } = setup(okEmpty)
      login()
      sdk._connectRealtimeAfterLogin()
      await flush()
      expect(calls.connect).to.deep.equal([null])
    })

    it('connects anonymously when mqtt_config fails', async () => {
      const { sdk, calls, login } = setup(fail)
      login()
      sdk._connectRealtimeAfterLogin()
      await flush()
      expect(calls.connect).to.deep.equal([null])
    })

    it('connects synchronously without any request when enableMqttAuth is false', () => {
      const { sdk, calls, login } = setup(okCreds, { enableMqttAuth: false })
      login()
      sdk._connectRealtimeAfterLogin()
      expect(calls.connect).to.deep.equal([null])
      expect(calls.get).to.have.length(0)
    })

    it('does not connect when the user logged out while waiting', async () => {
      const { sdk, calls, login, resolve } = setup('pending')
      login()
      sdk._connectRealtimeAfterLogin()
      sdk.isLogin = false
      await flush()
      resolve({ body: { results: { username: 'u', password: 'p' } } })
      await flush()
      expect(calls.connect).to.have.length(0)
    })

    it('ignores a late response from a previous login', async () => {
      const { sdk, calls, login, resolve } = setup('pending')
      login()
      sdk._connectRealtimeAfterLogin()
      sdk._loginGeneration += 1 // a newer login happened
      await flush()
      resolve({ body: { results: { username: 'u', password: 'p' } } })
      await flush()
      expect(calls.connect).to.have.length(0)
    })
  })

  describe('setUserWithIdentityToken path (_upgradeRealtimeAfterLogin)', () => {
    it('keeps the existing connection when there are no credentials', async () => {
      const { sdk, calls, login } = setup(okEmpty)
      login()
      sdk._upgradeRealtimeAfterLogin()
      await flush()
      expect(calls.connect).to.have.length(0)
    })

    it('keeps the existing connection when mqtt_config fails', async () => {
      const { sdk, calls, login } = setup(fail)
      login()
      sdk._upgradeRealtimeAfterLogin()
      await flush()
      expect(calls.connect).to.have.length(0)
    })

    it('reconnects once when credentials are provided', async () => {
      const { sdk, calls, login } = setup(okCreds)
      login()
      sdk._upgradeRealtimeAfterLogin()
      await flush()
      expect(calls.connect).to.deep.equal([{ username: 'u', password: 'p' }])
    })
  })
})
