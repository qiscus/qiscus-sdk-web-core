import { expect } from 'chai'
import { ExpiredTokenAdapter } from '../lib/adapters/expired-token'

/**
 * P5 pass 3 (docs/v2-full-shell-plan.md, §2 item 6): pins that
 * `ExpiredTokenAdapter` now sources its `refresh_user_token`/`logout` HTTP
 * calls from an injected `getUserAdapter()` (core-v3's raw user adapter:
 * `.refreshToken(userId, refreshToken)` / `.logout(userId, token)`) instead
 * of v2's superagent `HttpAdapter`, and that the token is read/written via an
 * injected `getStorage()` instead of `HttpAdapter.token`/`.setToken`. Keeps
 * the exact same token lifecycle: `_refreshToken` rotation, the
 * `onTokenRefreshed` callback shape (token, refreshToken, expiredAt,
 * oldToken), and the auth-status refresh guard.
 *
 * NOT picked up by `pnpm test`; run directly:
 * `npx mocha --require esbuild-register 'src/compat/*.test.js'`.
 */

function makeStubUserAdapter() {
  const captured = { refreshTokenCall: null, logoutCall: null }
  const userAdapter = {
    refreshToken(userId, refreshToken) {
      captured.refreshTokenCall = { userId, refreshToken }
      return Promise.resolve({
        results: { token: 'newtok', refresh_token: 'newrt', token_expires_at: null },
      })
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
    _store: store,
  }
}

describe('auth transport swap (ExpiredTokenAdapter -> core-v3 userAdapter)', () => {
  it('refreshAuthToken() calls getUserAdapter().refreshToken(userId, refreshToken), rotates _refreshToken, writes storage, and resolves res', async () => {
    const { userAdapter, captured } = makeStubUserAdapter()
    const storage = makeStubStorage('oldtok')

    const adapter = new ExpiredTokenAdapter({
      getUserAdapter: () => userAdapter,
      getStorage: () => storage,
      getAuthenticationStatus: () => true,
      refreshToken: 'rt-1',
      expiredAt: null,
      userId: 'u1',
      onTokenRefreshed: () => {},
    })

    const res = await adapter.refreshAuthToken()

    expect(captured.refreshTokenCall).to.deep.equal({ userId: 'u1', refreshToken: 'rt-1' })
    expect(storage.getToken()).to.equal('newtok')
    expect(adapter._refreshToken).to.equal('newrt')
    expect(res).to.deep.equal({ token: 'newtok', refresh_token: 'newrt', token_expires_at: null })
  })

  it('logout() calls getUserAdapter().logout(userId, storage.getToken())', async () => {
    const { userAdapter, captured } = makeStubUserAdapter()
    const storage = makeStubStorage('oldtok')

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

    expect(captured.logoutCall).to.deep.equal({ userId: 'u1', token: 'oldtok' })
  })

  it('refreshAuthToken() returns without calling the stub when getAuthenticationStatus() is false (refresh guard)', async () => {
    const { userAdapter, captured } = makeStubUserAdapter()
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
})
