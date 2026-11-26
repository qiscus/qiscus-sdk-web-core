import { expect } from 'chai'
import { syncPolicy } from '../src/lib/adapters/sync'

const build = (overrides = {}) => {
  const state = {
    isLogin: true,
    forceEnableSync: true,
    realtimeConnected: false,
    enableSync: true,
    enableSyncEvent: false,
    syncOnlyWhenDisconnected: false,
    ...overrides,
  }
  const policy = syncPolicy({
    statusLogin: () => state.isLogin,
    syncInterval: () => 5000,
    syncOnConnect: () => 30000,
    getShouldSync: () => state.forceEnableSync && state.isLogin,
    enableSync: () => state.enableSync,
    enableSyncEvent: () => state.enableSyncEvent,
    isRealtimeConnected: () => state.realtimeConnected,
    syncOnlyWhenDisconnected: () => state.syncOnlyWhenDisconnected,
  })
  return { state, policy }
}

describe('syncPolicy', function () {
  it('should keep polling while realtime is connected', () => {
    const { state, policy } = build()
    state.realtimeConnected = true

    expect(policy.shouldSync()).to.equal(true)
  })

  it('should back off to syncOnConnect while realtime is connected', () => {
    const { state, policy } = build()

    expect(policy.getInterval()).to.equal(5000)
    state.realtimeConnected = true
    expect(policy.getInterval()).to.equal(30000)
  })

  it('should not poll before login', () => {
    const { policy } = build({ isLogin: false })

    expect(policy.getInterval()).to.equal(0)
    expect(policy.shouldSync()).to.equal(false)
  })

  it('should not poll when sync is disabled by app config', () => {
    const { policy } = build({ enableSync: false })

    expect(policy.shouldSync()).to.equal(false)
  })

  it('should not poll when stopSync forced it off', () => {
    const { policy } = build({ forceEnableSync: false })

    expect(policy.shouldSync()).to.equal(false)
  })

  it('should gate sync event on its own app config flag', () => {
    const { state, policy } = build()

    expect(policy.shouldSyncEvent()).to.equal(false)
    state.enableSyncEvent = true
    expect(policy.shouldSyncEvent()).to.equal(true)
  })

  it('should stop while connected when syncOnlyWhenDisconnected is opted into', () => {
    const { state, policy } = build({
      syncOnlyWhenDisconnected: true,
      enableSyncEvent: true,
    })

    expect(policy.shouldSync()).to.equal(true)
    state.realtimeConnected = true
    expect(policy.shouldSync()).to.equal(false)
    expect(policy.shouldSyncEvent()).to.equal(false)
  })
})
