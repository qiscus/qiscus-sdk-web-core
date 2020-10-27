import * as H from './hook'

test('Hooks constants', () => {
  expect(H.Hooks.MESSAGE_BEFORE_RECEIVED).toBe('message::before-received')
  expect(H.Hooks.MESSAGE_BEFORE_SENT).toBe('message::before-sent')
})

let adapter: ReturnType<typeof H.hookAdapterFactory> | null
beforeEach(() => {
  adapter = H.hookAdapterFactory()
})
afterEach(() => {
  adapter = null
})
test('Hooks trigger message::before-received', (done) => {
  adapter?.intercept(H.Hooks.MESSAGE_BEFORE_RECEIVED, (data: string) => {
    expect(data).toBe('before received data')
    done()
    return data
  })
  adapter?.trigger(H.Hooks.MESSAGE_BEFORE_RECEIVED, 'before received data')
})
test('Hook trigger message::before-sent', (done) => {
  adapter?.intercept(H.Hooks.MESSAGE_BEFORE_SENT, (data: string) => {
    expect(data).toBe('before sent data')
    done()
    return data
  })

  adapter?.trigger(H.Hooks.MESSAGE_BEFORE_SENT, 'before sent data')
})
