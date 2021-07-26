import Kefir, { Stream, Subscription } from 'kefir'
import { Subscription as Subs, IQCallback2 as Callback2, IQCallback1 as Callback1 } from '../defs'
import { isCallback1, isCallback2 } from './param-utils'

export const toPromise = <T, E>(stream: Stream<T, E>): Promise<T> =>
  new Promise((resolve, reject) => {
    let value: T
    stream.observe({
      value(v) {
        value = v
      },
      error(e) {
        reject(e)
      },
      end() {
        resolve(value)
      },
    })
  })
export const toCallback =
  <T>(callback: Callback2<T> | Callback1) =>
  (stream: Stream<T, Error | undefined>) => {
    let value: T
    const subscription = stream.observe({
      value(data) {
        value = data
      },
      error(error) {
        if (isCallback1(callback)) {
          callback(error)
        }
        if (isCallback2(callback)) {
          callback(undefined, error)
        }
      },
      end() {
        if (isCallback1(callback)) callback(undefined)
        if (isCallback2(callback)) callback(value, undefined)
        subscription?.unsubscribe()
      },
    })
  }
export const toCallbackOrPromise =
  <T>(callback?: Callback1 | Callback2<T> | null) =>
  (stream: Stream<T, Error>) => {
    if (callback == null) return toPromise(stream)
    return toCallback(callback)(stream)
  }

export const tryCatch = <T>(fn: () => T, onError: (error: Error) => void): void => {
  try {
    fn()
  } catch (error) {
    onError(error)
  }
}

export const process = <T>(item: T, ...checkers: Function[]) =>
  Kefir.stream<T, Error>((listener) => {
    checkers.forEach((check) => {
      tryCatch(
        () => {
          const value = check(item)
          listener.emit(value)
          listener.end()
        },
        (error) => listener.error(error)
      )
    })
  })

export const tap =
  <T>(onNext: (value: T) => void, onError?: (error: Error) => void, onComplete?: () => void) =>
  (stream: Stream<T, Error>) =>
    stream
      .onValue((v) => onNext?.(v))
      .onError((e) => onError?.(e))
      .onEnd(() => onComplete?.())

const sleep = (time: number) => new Promise((res) => setTimeout(res, time))
export const bufferUntil =
  <T>(fn: () => boolean) =>
  (stream: Stream<T, Error>): Stream<T, Error> => {
    const buffer: Array<T> = []
    let subscription: Subscription
    return Kefir.stream<T, Error>((listener) => {
      subscription = stream.observe({
        value(data) {
          buffer.push(data)
          while (fn() && buffer.length) {
            const data = buffer.shift()
            if (data != null) listener.value(data)
          }
        },
        error(err) {
          return listener.error(err)
        },
        async end() {
          while (buffer.length) {
            if (fn()) {
              const data = buffer.shift()
              if (data != null) listener.value(data)
            } else {
              await sleep(300)
            }
          }
          listener.end()
        },
      })
    })
  }

export const subscribeOnNext =
  <T extends any>(onNext: (value: T) => void) =>
  (stream: Stream<T, Error>) =>
    stream.observe(onNext)

type Func<T extends any[]> = (...data: T) => void
export const toEventSubscription =
  <T extends any[]>(eventSubscribe: (handler: Func<T>) => Subs) =>
  (stream: Stream<Func<T>, Error>) => {
    let subscription: Subscription
    let subs: Subs
    subscription = stream.observe((handler) => {
      subs = eventSubscribe(handler)
    })

    return () => {
      subscription.unsubscribe()
      subs()
    }
  }

export const toEventSubscription_ =
  <T extends unknown>(handler: (data: T) => void, onError?: (error: Error) => void) =>
  (stream: Stream<T, Error>) => {
    const subscription = stream.observe({
      value: (data) => handler(data),
      error: (err) => onError?.(err),
    })

    return () => subscription.unsubscribe()
  }
