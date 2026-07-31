import { expect } from 'chai'
import { ExpiredTokenAdapter } from '../lib/adapters/expired-token'

/**
 * Expired-token auto-refresh scheduler lift (docs/v2-full-shell-plan.md
 * "NEXT ITEM — Expired-token auto-refresh scheduler"): `ExpiredTokenAdapter`
 * now delegates its timer + lifecycle to core-v3's
 * `getTokenRefreshScheduler`. This pins that the delegation preserves v2's
 * exact observable contract: `refreshAuthToken()` calls the user adapter
 * with `(userId, refreshToken)`, invokes `onTokenRefreshed` with the 4 args
 * in v2's shape (including the OLD `expiredAt`), writes the new token to
 * storage, and `logout()` passes the current storage token.
 *
 * NOT picked up by `pnpm test`; run directly:
 * `npx mocha --require esbuild-register 'src/compat/*.test.js'`.
 */

function makeStubUserAdapter(response) {
  const captured = { refreshTokenCall: null, logoutCall: null }
  const userAdapter = {
    refreshToken(userId, refreshToken) {
      captured.refreshTokenCall = { userId, refreshToken }
      return Promise.resolve(response)
    },
    logout(userId, token) {
      captured.logoutCall = { userId, token }
      return Promise.resolve({ status: 200 })
    },
  }
  return { userAdapter, captured }
}

function makeStubStorage(initialToken) {
  const store = { token: initialToken }
  return {
    getToken: () => store.token,
    setToken: (t) => {
      store.token = t
    },
  }
}

describe('ExpiredTokenAdapter delegates to core-v3 getTokenRefreshScheduler', () => {
  it('refreshAuthToken() calls getUserAdapter().refreshToken(userId, refreshToken), invokes onTokenRefreshed with the OLD expiredAt + old storage token, writes new token to storage', async () => {
    const oldExpiredAt = new Date(Date.now() + 60_000).toJSON()
    const { userAdapter, captured } = makeStubUserAdapter({
      results: { token: 'newtok', refresh_token: 'newrt', token_expires_at: new Date(Date.now() + 120_000).toJSON() },
    })
    const storage = makeStubStorage('oldtok')

    const onTokenRefreshedCalls = []
    const adapter = new ExpiredTokenAdapter({
      getUserAdapter: () => userAdapter,
      getStorage: () => storage,
      getAuthenticationStatus: () => true,
      refreshToken: 'rt-1',
      expiredAt: oldExpiredAt,
      userId: 'u1',
      onTokenRefreshed: (token, refreshToken, expiredAt, oldToken) => {
        onTokenRefreshedCalls.push({ token, refreshToken, expiredAt, oldToken })
      },
    })

    const res = await adapter.refreshAuthToken()

    expect(captured.refreshTokenCall).to.deep.equal({ userId: 'u1', refreshToken: 'rt-1' })
    expect(storage.getToken()).to.equal('newtok')
    expect(adapter._refreshToken).to.equal('newrt')
    expect(res.token).to.equal('newtok')

    expect(onTokenRefreshedCalls).to.have.lengthOf(1)
    expect(onTokenRefreshedCalls[0].token).to.equal('newtok')
    expect(onTokenRefreshedCalls[0].refreshToken).to.equal('newrt')
    expect(onTokenRefreshedCalls[0].oldToken).to.equal('oldtok')
    // v2 quirk, preserved: the callback receives the OLD expiredAt.
    expect(onTokenRefreshedCalls[0].expiredAt.toJSON()).to.equal(oldExpiredAt)
  })

  it('refreshAuthToken() returns without calling the stub when getAuthenticationStatus() is false (refresh guard)', async () => {
    const { userAdapter, captured } = makeStubUserAdapter({
      results: { token: 'newtok', refresh_token: 'newrt', token_expires_at: null },
    })
    const storage = makeStubStorage('oldtok')

    const adapter = new ExpiredTokenAdapter({
      getUserAdapter: () => userAdapter,
      getStorage: () => storage,
      getAuthenticationStatus: () => false,
      refreshToken: 'rt-1',
      expiredAt: null,
      userId: 'u1',
      onTokenRefreshed: () => {},
    })

    const res = await adapter.refreshAuthToken()

    expect(res).to.equal(undefined)
    expect(captured.refreshTokenCall).to.equal(null)
    expect(storage.getToken()).to.equal('oldtok')
  })

  it('logout() calls getUserAdapter().logout(userId, storage.getToken())', async () => {
    const { userAdapter, captured } = makeStubUserAdapter({
      results: { token: 'newtok', refresh_token: 'newrt', token_expires_at: null },
    })
    const storage = makeStubStorage('current-token')

    const adapter = new ExpiredTokenAdapter({
      getUserAdapter: () => userAdapter,
      getStorage: () => storage,
      getAuthenticationStatus: () => true,
      refreshToken: 'rt-1',
      expiredAt: null,
      userId: 'u1',
      onTokenRefreshed: () => {},
    })

    await adapter.logout()

    expect(captured.logoutCall).to.deep.equal({ userId: 'u1', token: 'current-token' })
  })

  it('an already-expired token does NOT trigger an automatic refresh', async () => {
    const { userAdapter, captured } = makeStubUserAdapter({
      results: { token: 'newtok', refresh_token: 'newrt', token_expires_at: null },
    })
    const storage = makeStubStorage('oldtok')

    new ExpiredTokenAdapter({
      getUserAdapter: () => userAdapter,
      getStorage: () => storage,
      getAuthenticationStatus: () => true,
      refreshToken: 'rt-1',
      expiredAt: new Date(Date.now() - 60_000).toJSON(),
      userId: 'u1',
      onTokenRefreshed: () => {},
    })

    await new Promise((r) => setTimeout(r, 60))

    expect(captured.refreshTokenCall).to.equal(null)
  })
})
