import { expect } from 'chai'
import MqttAdapter from '../lib/adapters/mqtt'

/**
 * P3a characterization tests (docs/v2-full-shell-plan.md). Before swapping
 * v2's `MqttAdapter` connection transport onto core-v3 (P3c), pin the EXACT
 * observable facade behavior it exposes today: topic strings, buffering,
 * disconnect, presence/typing payloads, and mitt emit/off passthrough. This
 * is the oracle P3c's replacement is verified against.
 *
 * Deliberately NOT pinned: the load-balancer reconnect cadence
 * (`_on_close_handler`'s debounce/backoff) — we are intentionally replacing
 * that with core-v3's exponential backoff, so characterizing it here would
 * only lock in behavior we plan to discard.
 *
 * Driven with a fake `connect` implementation injected via the constructor's
 * test seam (`{ connect }` opt, defaulting to the real `mqtt/lib/connect`),
 * so no real socket is opened. NOT picked up by `pnpm test`; run directly:
 * `npx mocha --require esbuild-register 'src/compat/*.test.js'`.
 */

function makeFakeClient() {
  const calls = { subscribe: [], unsubscribe: [], publish: [], end: [] }
  const listeners = {}
  const client = {
    calls,
    listeners,
    connected: true,
    _resubscribeTopics: {},
    subscribe(...a) {
      calls.subscribe.push(a)
      return this
    },
    unsubscribe(...a) {
      calls.unsubscribe.push(a)
      return this
    },
    publish(...a) {
      calls.publish.push(a)
      return this
    },
    end(...a) {
      calls.end.push(a)
    },
    // core-v3's `getMqttAdapter` registers its connection-event handlers via
    // `addListener` on whatever `connect()` returns, then reacts to the real
    // mqtt.js client firing 'connect'/'reconnect'/'close'/'error'/'message'.
    // Capture those handlers so tests can simulate the client emitting them
    // (`emitEv`), without a real socket.
    addListener(ev, fn) {
      ;(listeners[ev] || (listeners[ev] = [])).push(fn)
    },
    removeAllListeners() {
      Object.keys(listeners).forEach((ev) => delete listeners[ev])
    },
    emitEv(ev, ...a) {
      ;(listeners[ev] || []).forEach((fn) => fn(...a))
    },
  }
  return client
}

function makeCore(overrides = {}) {
  return {
    AppId: 'app-1',
    user_id: 'user-1',
    userData: { token: 'tok-1', email: 'user-1@mail.test' },
    selected: null,
    mqttURL: 'wss://example.test/mqtt',
    isLogin: true,
    debugMQTTMode: false,
    ...overrides,
  }
}

function makeAdapter({ core, connectOpts = {}, connect } = {}) {
  const fakeClient = connect ? connect() : makeFakeClient()
  const connectSpy = { calls: [] }
  const connectImpl = (...args) => {
    connectSpy.calls.push(args)
    return fakeClient
  }
  const resolvedCore = core || makeCore()
  const adapter = new MqttAdapter(resolvedCore.mqttURL, resolvedCore, resolvedCore.isLogin, {
    shouldConnect: true,
    enableLb: false,
    connect: connectImpl,
    ...connectOpts,
  })
  return { adapter, fakeClient, connectSpy, core: resolvedCore }
}

describe('MqttAdapter facade characterization', () => {
  describe('clientId + will', () => {
    it('uses the injected getClientId when provided', () => {
      const { connectSpy } = makeAdapter({ connectOpts: { getClientId: () => 'CID' } })
      const [, opts] = connectSpy.calls[0]
      expect(opts.clientId).to.equal('CID')
    })

    it('defaults to `${AppId}_${user_id}_<digits>` when no getClientId given', () => {
      const { connectSpy } = makeAdapter({ core: makeCore({ AppId: 'app-1', user_id: 'user-1' }) })
      const [, opts] = connectSpy.calls[0]
      expect(opts.clientId).to.match(/^app-1_user-1_\d+$/)
    })

    it('defaults to `${AppId}_undefined_<digits>` pre-login (user_id undefined)', () => {
      const { connectSpy } = makeAdapter({ core: makeCore({ AppId: 'app-1', user_id: undefined }) })
      const [, opts] = connectSpy.calls[0]
      expect(opts.clientId).to.match(/^app-1_undefined_\d+$/)
    })

    it('sets the `will` option (core-v3 shape: string \'0\', qos 1)', () => {
      const { connectSpy, core } = makeAdapter({ core: makeCore({ user_id: 'user-1' }) })
      const [, opts] = connectSpy.calls[0]
      // ACCEPTED wire divergence (Fable-flagged): LWT payload 0->'0' + qos 1;
      // retained-status subscribers parse via Number() so '0' is safe; MUST
      // be verified in the P3d two-client soak.
      expect(opts.will).to.deep.equal({
        topic: `u/${core.user_id}/s`,
        payload: '0',
        retain: true,
        qos: 1,
      })
      expect(opts.will.payload).to.be.a('string')
    })
  })

  describe('subscribeChannel', () => {
    it('subscribes `${appId}/${uid}/c`', () => {
      const { adapter, fakeClient } = makeAdapter()
      adapter.subscribeChannel('app-1', 'uid-1')
      expect(fakeClient.calls.subscribe).to.deep.equal([['app-1/uid-1/c']])
    })
  })

  describe('subscribeRoom / unsubscribeRoom', () => {
    it('subscribes 4 topics in order when a room is selected', () => {
      const roomId = 'room-1'
      const { adapter, fakeClient } = makeAdapter({ core: makeCore({ selected: { id: roomId } }) })
      adapter.subscribeRoom(roomId)
      expect(fakeClient.calls.subscribe).to.deep.equal([
        [`r/${roomId}/typing`],
        [`r/${roomId}/${roomId}/+/t`],
        [`r/${roomId}/${roomId}/+/d`],
        [`r/${roomId}/${roomId}/+/r`],
      ])
    })

    it('does nothing when no room is selected', () => {
      const { adapter, fakeClient } = makeAdapter({ core: makeCore({ selected: null }) })
      adapter.subscribeRoom('room-1')
      expect(fakeClient.calls.subscribe).to.deep.equal([])
    })

    it('unsubscribeRoom mirrors subscribeRoom (4 topics, in order)', () => {
      const roomId = 'room-1'
      const { adapter, fakeClient } = makeAdapter({ core: makeCore({ selected: { id: roomId } }) })
      adapter.unsubscribeRoom(roomId)
      expect(fakeClient.calls.unsubscribe).to.deep.equal([
        [`r/${roomId}/typing`],
        [`r/${roomId}/${roomId}/+/t`],
        [`r/${roomId}/${roomId}/+/d`],
        [`r/${roomId}/${roomId}/+/r`],
      ])
    })

    it('unsubscribeRoom does nothing when no room is selected', () => {
      const { adapter, fakeClient } = makeAdapter({ core: makeCore({ selected: null }) })
      adapter.unsubscribeRoom('room-1')
      expect(fakeClient.calls.unsubscribe).to.deep.equal([])
    })
  })

  describe('subscribeUserChannel(ByToken) / unsubscribe variants', () => {
    it('subscribeUserChannel subscribes token c/n/update', () => {
      const { adapter, fakeClient, core } = makeAdapter()
      adapter.subscribeUserChannel()
      expect(fakeClient.calls.subscribe).to.deep.equal([
        [`${core.userData.token}/c`],
        [`${core.userData.token}/n`],
        [`${core.userData.token}/update`],
      ])
    })

    it('subscribeUserChannelByToken subscribes the given token c/n/update', () => {
      const { adapter, fakeClient } = makeAdapter()
      adapter.subscribeUserChannelByToken('other-tok')
      expect(fakeClient.calls.subscribe).to.deep.equal([
        ['other-tok/c'],
        ['other-tok/n'],
        ['other-tok/update'],
      ])
    })

    it('unsubscribeUserChannel mirrors subscribeUserChannel', () => {
      const { adapter, fakeClient, core } = makeAdapter()
      adapter.unsubscribeUserChannel()
      expect(fakeClient.calls.unsubscribe).to.deep.equal([
        [`${core.userData.token}/c`],
        [`${core.userData.token}/n`],
        [`${core.userData.token}/update`],
      ])
    })

    it('unsusbcribeUserChannelByToken mirrors subscribeUserChannelByToken', () => {
      const { adapter, fakeClient } = makeAdapter()
      adapter.unsusbcribeUserChannelByToken('other-tok')
      expect(fakeClient.calls.unsubscribe).to.deep.equal([
        ['other-tok/c'],
        ['other-tok/n'],
        ['other-tok/update'],
      ])
    })
  })

  describe('subscribeUserPresence / unsubscribeUserPresence', () => {
    it('subscribes `u/${userId}/s`', () => {
      const { adapter, fakeClient } = makeAdapter()
      adapter.subscribeUserPresence('user-2')
      expect(fakeClient.calls.subscribe).to.deep.equal([['u/user-2/s']])
    })

    it('unsubscribes `u/${userId}/s`', () => {
      const { adapter, fakeClient } = makeAdapter()
      adapter.unsubscribeUserPresence('user-2')
      expect(fakeClient.calls.unsubscribe).to.deep.equal([['u/user-2/s']])
    })
  })

  describe('publishPresence', () => {
    it('online publishes "1" (stringified at the buffer flush) with retain:true', () => {
      const { adapter, fakeClient } = makeAdapter()
      adapter.publishPresence('user-2', true)
      expect(fakeClient.calls.publish).to.deep.equal([['u/user-2/s', '1', { retain: true }]])
    })

    it('offline publishes "0" (stringified) with retain:true', () => {
      const { adapter, fakeClient } = makeAdapter()
      adapter.publishPresence('user-2', false)
      expect(fakeClient.calls.publish).to.deep.equal([['u/user-2/s', '0', { retain: true }]])
    })
  })

  describe('publishTyping', () => {
    it('publishes `r/${roomId}/${roomId}/${uid}/t` with the stringified status', () => {
      const roomId = 'room-1'
      const uid = 'user-1'
      const { adapter, fakeClient } = makeAdapter({
        core: makeCore({ selected: { id: roomId }, user_id: uid }),
      })
      adapter.publishTyping(1)
      // publishTyping calls core's `publish` directly with no `options` arg
      // (P3c); core forwards `options` as-is (no `= {}` default), so the
      // underlying client call now receives `undefined` as the 3rd arg.
      expect(fakeClient.calls.publish).to.deep.equal([[`r/${roomId}/${roomId}/${uid}/t`, '1', undefined]])
    })

    it('does nothing when no room is selected', () => {
      const { adapter, fakeClient } = makeAdapter({ core: makeCore({ selected: null }) })
      adapter.publishTyping(1)
      expect(fakeClient.calls.publish).to.deep.equal([])
    })
  })

  describe('buffering (subscribe/publish before the underlying client exists)', () => {
    // core-v3 now owns buffering (packages/core-v3/src/adapters/mqtt.ts):
    // subscribe/unsubscribe/publish push onto a buffer and attempt an
    // immediate flush, but the flush is a no-op until a client object
    // actually exists (`mqtt != null`), and creating that object
    // (`conneck()`) does NOT itself flush — only the underlying client's
    // real 'connect' event (-> core's `mqtt::connected`) does. This mirrors
    // core-v3's own characterization
    // (`packages/core-v3/src/adapters/mqtt.test.ts`, "buffers subscribe/
    // publish issued before mqtt exists and flushes on the connect event").
    // `shouldConnect: false` is required here so the adapter's constructor
    // does NOT auto-`conneck()` — otherwise the client would already exist
    // before the test's `subscribe`/`publish` call and it would flush
    // immediately instead of buffering.
    it('subscribe buffers before any client exists, then flushes on the connect event', () => {
      const { adapter, fakeClient } = makeAdapter({ connectOpts: { shouldConnect: false } })
      adapter.subscribe('t/1')
      expect(fakeClient.calls.subscribe).to.deep.equal([])

      adapter.connect()
      // Client object now exists, but still not flushed — no 'connect' event yet.
      expect(fakeClient.calls.subscribe).to.deep.equal([])

      fakeClient.emitEv('connect')
      expect(fakeClient.calls.subscribe).to.deep.equal([['t/1']])
    })

    it('publish buffers before any client exists, then flushes on the connect event', () => {
      const { adapter, fakeClient } = makeAdapter({ connectOpts: { shouldConnect: false } })
      adapter.publish('p/1', 'x')
      expect(fakeClient.calls.publish).to.deep.equal([])

      adapter.connect()
      expect(fakeClient.calls.publish).to.deep.equal([])

      fakeClient.emitEv('connect')
      expect(fakeClient.calls.publish).to.deep.equal([['p/1', 'x', undefined]])
    })
  })

  describe('disconnect()', () => {
    it('publishes offline presence for the user email and unsubscribes the resubscribe-topic keys, without calling end()', () => {
      const { adapter, fakeClient, core } = makeAdapter({ core: makeCore({ userData: { token: 'tok-1', email: 'me@mail.test' } }) })
      // The adapter already `conneck()`ed during construction (default
      // `shouldConnect: true`), so `fakeClient` is already `this._core.mqtt`
      // here — no explicit assignment needed (there's no public setter).
      fakeClient._resubscribeTopics = { 'a/b': 1, 'c/d': 1 }

      adapter.disconnect()

      expect(fakeClient.calls.publish).to.deep.equal([[`u/${core.userData.email}/s`, '0', { retain: true }]])
      // core-v3 unsubscribes per-topic (P3c), not with one call over the
      // whole array (v2's old behavior).
      expect(fakeClient.calls.unsubscribe).to.deep.equal([['a/b'], ['c/d']])
      expect(fakeClient.calls.end).to.deep.equal([])
    })
  })

  describe('mitt passthrough', () => {
    it('on/emit invokes the registered callback with the emitted payload', () => {
      const { adapter } = makeAdapter()
      let received
      const cb = (payload) => {
        received = payload
      }
      adapter.on('x', cb)
      adapter.emit('x', 42)
      expect(received).to.equal(42)
    })

    it('off removes the registered callback', () => {
      const { adapter } = makeAdapter()
      let calls = 0
      const cb = () => {
        calls++
      }
      adapter.on('x', cb)
      adapter.off('x', cb)
      adapter.emit('x', 42)
      expect(calls).to.equal(0)
    })

    it('__mqtt_error_handler suppresses "client disconnecting" (no error emit)', () => {
      const { adapter } = makeAdapter()
      let errorEmitted = false
      adapter.on('error', () => {
        errorEmitted = true
      })
      adapter.__mqtt_error_handler({ message: 'client disconnecting' })
      expect(errorEmitted).to.equal(false)
    })

    it('__mqtt_error_handler re-emits other errors with the error message', () => {
      const { adapter } = makeAdapter()
      let received
      adapter.on('error', (msg) => {
        received = msg
      })
      adapter.__mqtt_error_handler({ message: 'boom' })
      expect(received).to.equal('boom')
    })
  })
})
