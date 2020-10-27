import * as U from 'utils/try-catch'

test('tryCatch', () => {
  const r1 = U.tryCatch(() => 'some-data', 'default-value')
  expect(r1).toBe('some-data')

  const r2 = U.tryCatch(() => { throw Error() }, 'default-value')
  expect(r2).toBe('default-value')
})

test('tryCatch with success callback', () => {
  const mockSuccessCb1 = jest.fn((_r) => 'mocked')
  const mockFailureCb1 = jest.fn((_err) => 'mocked-error')
  const r3 = U.tryCatch(() => 'some-data', 'default-value', mockFailureCb1, mockSuccessCb1)
  expect(r3).toBe('some-data')
  expect(mockSuccessCb1.mock.calls.length).toBe(1)
  expect(mockSuccessCb1.mock.calls[0][0]).toBe('some-data')
  expect(mockFailureCb1.mock.calls.length).toBe(0)
})

test('tryCatch with failure callback', () => {
  const mockSuccessCb1 = jest.fn((_r) => 'mocked')
  const mockFailureCb1 = jest.fn((_err) => 'mocked-err')

  const r1 = U.tryCatch(() => { throw new Error('some error') }, 'default', mockFailureCb1, mockSuccessCb1)

  expect(r1).toBe('default')
  expect(mockSuccessCb1.mock.calls.length).toBe(0)
  expect(mockFailureCb1.mock.calls.length).toBe(1)
  expect(mockFailureCb1.mock.calls[0][0]).toStrictEqual(Error('some error'))
})

test('wrapP success', async () => {
  const [r1, e1] = await U.wrapP(Promise.resolve(0))

  expect(r1).toBe(0)
  expect(e1).toBeNull()
})
test('wrapP failure', async () => {
  const [r1, e1] = await U.wrapP(Promise.reject(new Error('error')))

  expect(r1).toBeNull()
  expect(e1).toStrictEqual(Error('error'))
})

test('getOrThrow success', () => {
  const data1 = 12
  const data2 = null

  expect(U.getOrThrow(data1, 'data1 null')).toEqual(data1)
  expect(() => U.getOrThrow(data1, 'data1 null')).not.toThrow(Error('data1 null'))
  expect(() => U.getOrThrow(data2, 'data2 null')).toThrow(Error('data2 null'))
})
