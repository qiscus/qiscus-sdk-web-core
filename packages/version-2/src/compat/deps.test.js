import { expect } from 'chai'
import QiscusSDK from '../index'

/**
 * Verifies the `deps` getter keeps core-v3 storage's `currentUser` in sync
 * across the memoized bundle's lifetime, so a re-login is reflected in
 * methods that read `storage` VALUES directly (e.g. `updateUser`'s
 * `s.getCurrentUser().id`), not just in the always-live request headers.
 *
 * The token is a different story post-P5: it's seeded once (in `makeDeps`,
 * from `self.userData.token`) and afterwards written DIRECTLY to `storage`
 * at every set site (login, `ExpiredTokenAdapter.refreshAuthToken` — see
 * `lib/adapters/expired-token.js`) rather than re-synced from a live `self`
 * field on every `deps` access.
 */

const depsGetter = Object.getOwnPropertyDescriptor(QiscusSDK.prototype, 'deps').get

function makeSelf() {
  return {
    baseURL: 'https://api.example.com',
    AppId: 'sample-app-id',
    mqttURL: 'wss://mqtt.example.com/mqtt',
    _customHeader: {},
    user_id: 'user-1',
    userData: { id: 'user-1', name: 'Alice', token: 'tok-1' },
    _hookAdapter: undefined,
    _deps: null,
  }
}

describe('compat/deps liveness', () => {
  it('seeds storage token from userData once and re-syncs currentUser on each deps access', () => {
    const self = makeSelf()

    const d1 = depsGetter.call(self)
    expect(d1.storage.getToken()).to.equal('tok-1')
    expect(d1.storage.getCurrentUser().name).to.equal('Alice')

    // Simulate a profile change after deps was first built; the token is NOT
    // re-synced from `self.userData` (that's now storage's job, written
    // directly by login/ExpiredTokenAdapter), only `currentUser` is.
    self.userData = { id: 'user-1', name: 'Alice Renamed', token: 'tok-1' }

    const d2 = depsGetter.call(self)
    expect(d2).to.equal(d1) // still the same memoized deps bundle
    expect(d2.storage.getCurrentUser().name).to.equal('Alice Renamed') // user re-synced live

    // Direct storage writes (how the real token lifecycle now works) ARE
    // reflected, since it's the same storage object across `deps` accesses.
    d1.storage.setToken('tok-2')
    expect(d2.storage.getToken()).to.equal('tok-2')
  })
})
