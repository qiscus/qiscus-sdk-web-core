import { expect } from 'chai'
import QiscusSDK from '../index'

/**
 * Verifies the `deps` getter keeps core-v3 storage's mutable fields (token,
 * currentUser) in sync across the memoized bundle's lifetime — so a post-init
 * token refresh (HttpAdapter 403-retry) or re-login is reflected in methods
 * that read storage VALUES directly (updateMessage body token, updateUser id),
 * not just in the always-live request headers.
 */

const depsGetter = Object.getOwnPropertyDescriptor(QiscusSDK.prototype, 'deps').get

function makeSelf() {
  return {
    baseURL: 'https://api.example.com',
    AppId: 'sample-app-id',
    mqttURL: 'wss://mqtt.example.com/mqtt',
    _customHeader: {},
    user_id: 'user-1',
    userData: { id: 'user-1', name: 'Alice' },
    _hookAdapter: undefined,
    HTTPAdapter: { token: 'tok-1' },
    _deps: null,
  }
}

describe('compat/deps liveness', () => {
  it('re-syncs storage token + currentUser on each deps access (same memoized bundle)', () => {
    const self = makeSelf()

    const d1 = depsGetter.call(self)
    expect(d1.storage.getToken()).to.equal('tok-1')
    expect(d1.storage.getCurrentUser().name).to.equal('Alice')

    // Simulate a token refresh + a profile change after deps was first built.
    self.HTTPAdapter.token = 'tok-2'
    self.userData = { id: 'user-1', name: 'Alice Renamed' }

    const d2 = depsGetter.call(self)
    expect(d2).to.equal(d1) // still the same memoized deps bundle
    expect(d2.storage.getToken()).to.equal('tok-2') // token re-synced live
    expect(d2.storage.getCurrentUser().name).to.equal('Alice Renamed') // user re-synced live
  })
})
