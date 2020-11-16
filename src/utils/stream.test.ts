import xs, { Listener } from 'xstream'
import * as S from 'utils/stream'
import { toCallbackOrPromise } from 'utils/stream'
import flattenConcurrently from 'xstream/extra/flattenConcurrently'

test('toPromise success', async () => {
  const r1 = xs.of('data').compose(S.toPromise)

  await expect(r1).resolves.toBe('data')
})
test('toPromise failure', async () => {
  const r1 = xs
    .create({
      start(listener) {
        listener.error(new Error('error'))
        listener.complete()
      },
      stop() {},
    })
    .compose(S.toPromise)

  await expect(r1).rejects.toThrow(Error('error'))
})

test('toCallback success', () => {
  const cb = jest.fn((_data?: number, _err?: Error) => {})

  xs.of(123).compose(S.toCallback(cb))

  expect(cb.mock.calls.length).toBe(1)
  expect(cb.mock.calls[0][0]).toBe(123)
  expect(cb.mock.calls[0][1]).toBeUndefined()
})

test('toCallback without data success', () => {
  const cb = jest.fn((_err?: Error) => {})

  xs.empty().compose(S.toCallback(cb))

  expect(cb.mock.calls.length).toBe(1)
  expect(cb.mock.calls[0][0]).toBeUndefined()
})
test('toCallback without data failure', () => {
  const cb = jest.fn((_err?: Error) => {})

  xs.create({
    start(listener: Listener<void>) {
      listener.error(new Error('failure'))
      // listener.complete()
    },
    stop() {},
  })
    // @ts-ignore
    .compose(S.toCallback(cb))

  expect(cb.mock.calls.length).toBe(1)
  expect(cb.mock.calls[0][0]).toStrictEqual(Error('failure'))
})

test('toCallback failure', () => {
  const cb = jest.fn((_data?: number, _err?: Error) => {})

  xs.throw(new Error('failure')).compose(S.toCallback(cb))

  expect(cb.mock.calls.length).toBe(1)
  expect(cb.mock.calls[0][0]).toBeUndefined()
  expect(cb.mock.calls[0][1]).toStrictEqual(Error('failure'))
})

test('tryCatch success', () => {
  const errorCb = jest.fn((_err: Error) => {})

  S.tryCatch(() => 123, errorCb)

  expect(errorCb.mock.calls.length).toBe(0)
})

test('tryCatch failure', () => {
  const errorCb = jest.fn((_err: Error) => {})
  S.tryCatch(() => {
    throw new Error('failure')
  }, errorCb)

  expect(errorCb.mock.calls.length).toBe(1)
  expect(errorCb.mock.calls[0][0]).toStrictEqual(Error('failure'))
})

test('toCallbackOrPromise promise', async () => {
  const resp = xs.of(123).compose(toCallbackOrPromise(undefined))

  const data = await (resp as Promise<number>)
  expect(data).toBe(123)
})
test('toCallbackOrPromise callback', () => {
  const cb = jest.fn((_data?: number, _err?: Error) => {})
  xs.of(123).compose(toCallbackOrPromise(cb))

  expect(cb.mock.calls.length).toBe(1)
  expect(cb.mock.calls[0][0]).toBe(123)
  expect(cb.mock.calls[0][1]).toBeUndefined()
})

test('process', (done) => {
  expect.assertions(3)

  const data1: number = 123
  const checkerCb = jest.fn((data: number) => data)

  S.process(data1, checkerCb).subscribe({
    next(data) {
      expect(data).toBe(data1)
    },
    complete() {
      expect(checkerCb.mock.calls.length).toBe(1)
      expect(checkerCb.mock.calls[0][0]).toBe(data1)
      done()
    },
  })
})

test('tap success', (done) => {
  expect.assertions(4)

  const data1: number = 123
  const tapCb = jest.fn((data: number) => expect(data).toBe(data1))

  xs.of(123)
    .compose(S.tap(tapCb))
    .subscribe({
      next: (data) => expect(data).toBe(data1),
      complete() {
        expect(tapCb.mock.calls.length).toBe(1)
        expect(tapCb.mock.calls[0][0]).toBe(data1)
        done()
      },
    })
})

test('tap failure', (done) => {
  expect.assertions(4)

  const tapCb = jest.fn((_data: number) => {})
  const tapErrorCb = jest.fn((_err?: Error) => {})

  xs.throw(new Error('failure'))
    .compose(S.tap(tapCb, tapErrorCb))
    .subscribe({
      error(error) {
        expect(error).toStrictEqual(Error('failure'))
        expect(tapCb.mock.calls.length).toBe(0)
        expect(tapErrorCb.mock.calls.length).toBe(1)
        expect(tapErrorCb.mock.calls[0][0]).toStrictEqual(Error('failure'))
        done()
      },
    })
})

test('bufferUntil', (done) => {
  const data1 = [1, 2, 3, 4, 5]
  const nextFn = jest.fn()
  const bufferFn = jest.fn().mockReturnValue(true).mockReturnValueOnce(false)

  xs.fromArray(data1)
    .compose(S.bufferUntil(bufferFn))
    .subscribe({
      next: nextFn,
      complete() {
        expect(nextFn.mock.calls.length).toBe(5)
        expect(nextFn.mock.calls[0][0]).toBe(1)
        expect(nextFn.mock.calls[1][0]).toBe(2)
        expect(nextFn.mock.calls[2][0]).toBe(3)
        expect(nextFn.mock.calls[3][0]).toBe(4)
        expect(nextFn.mock.calls[4][0]).toBe(5)

        expect(bufferFn.mock.calls.length).toBe(10)
        expect(bufferFn.mock.results[0].value).toBe(false)
        expect(bufferFn.mock.results[1].value).toBe(true)
        expect(bufferFn.mock.results[2].value).toBe(true)
        expect(bufferFn.mock.results[3].value).toBe(true)
        expect(bufferFn.mock.results[4].value).toBe(true)

        done()
      },
    })
})

test('subscribeOnNext', () => {
  expect.assertions(1)

  xs.of(123).compose(
    S.subscribeOnNext((value) => {
      expect(value).toBe(123)
    })
  )
})

test('toEventSubscription', () => {
  const cb = jest.fn((_d1: number): void => {})
  const handler = jest.fn((cb: (n: number) => void) => {
    cb(123)
    return () => {}
  })

  xs.of(cb as any).compose(S.toEventSubscription(handler))

  expect(handler.mock.calls.length).toBe(1)
  expect(cb.mock.calls.length).toBe(1)
  expect(cb.mock.calls[0][0]).toBe(123)
})

test('toEventSubscription_', () => {
  const cb = jest.fn((_d1: number) => {})
  const handler = jest.fn((cb: (n: number) => void) => {
    cb(123)
    return () => {}
  })

  xs.of(cb as any).compose(S.toEventSubscription_(handler))

  expect(handler.mock.calls.length).toBe(1)
  expect(cb.mock.calls.length).toBe(1)
  expect(cb.mock.calls[0][0]).toBe(123)
})

test('toEventSubscription_ error', () => {
  const cb = jest.fn((_d1: number) => {})
  const handler = jest.fn((cb: (n: number) => void) => {
    cb(123)
    return () => {}
  })
  const errorHandler = jest.fn((_err: Error): void => {})

  xs.of(cb as any)
    .mapTo(xs.throw(new Error('failure')))
    .compose(flattenConcurrently)
    .compose(S.toEventSubscription_(handler, errorHandler))

  expect(handler.mock.calls.length).toBe(0)
  expect(cb.mock.calls.length).toBe(0)
  expect(errorHandler.mock.calls.length).toBe(1)
  expect(errorHandler.mock.calls[0][0]).toStrictEqual(Error('failure'))
})
