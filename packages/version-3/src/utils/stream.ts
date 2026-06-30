import xs, { Listener, Producer, Stream, Subscription } from 'xstream'
import { Subscription as Subs, IQCallback2 as Callback2, IQCallback1 as Callback1 } from '../defs'
import { isCallback1, isCallback2 } from './param-utils'

export const toPromise = <T>(stream: Stream<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    let value: T
    stream.subscribe({
      next(data) {
        value = data
      },
      error(error) {
        reject(error)
      },
      complete() {
        resolve(value)
      },
    })
  })
export const toCallback =
  <T>(callback: Callback2<T> | Callback1) =>
  (stream: Stream<T>) => {
    let value: T
    let subscription: Subscription | undefined

    subscription = stream.subscribe({
      next(data) {
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
      complete() {
        if (isCallback1(callback)) callback(undefined)
        if (isCallback2(callback)) callback(value, undefined)
        subscription?.unsubscribe()
      },
    })
  }
export const toCallbackOrPromise =
  <T>(callback?: Callback1 | Callback2<T> | null) =>
  (stream: Stream<T>) => {
    if (callback == null) return toPromise(stream)
    return toCallback(callback)(stream)
  }

export const tryCatch = <T>(fn: () => T, onError: (error: Error) => void): void => {
  try {
    fn()
  } catch (error) {
    onError(error as Error)
  }
}

export const process = <T>(item: T, ...checkers: Function[]): Stream<T> =>
  xs.create({
    start(listener) {
      checkers.forEach((check) => {
        tryCatch(
          () => {
            const value = check(item)
            listener.next(value)
            listener.complete()
          },
          (error) => listener.error(error)
        )
      })
    },
    stop() {},
  })

export const tap =
  <T>(onNext: (value: T) => void, onError?: (error: Error) => void, onComplete?: () => void) =>
  (stream: Stream<T>): Stream<T> => {
    let subscription: Subscription | null
    return xs.create<T>({
      start(listener) {
        subscription = stream.subscribe({
          next(value) {
            onNext?.(value)
            listener.next(value)
          },
          error(error) {
            onError?.(error)
            listener.error(error)
          },
          complete() {
            onComplete?.()
            listener.complete()
          },
        })
      },
      stop() {
        subscription?.unsubscribe()
      },
    })
  }

const sleep = (time: number) => new Promise((res) => setTimeout(res, time))
export const bufferUntil =
  <T>(fn: () => boolean) =>
  (stream: Stream<T>): Stream<T> => {
    const buffer: Array<T> = []
    let subscription: Subscription | undefined
    return xs.create({
      start(listener) {
        subscription = stream.subscribe({
          next: (data) => {
            buffer.push(data)
            while (fn() && buffer.length) {
              const data = buffer.shift()
              if (data != null) listener.next(data)
            }
          },
          error: (err) => listener.error(err),
          complete: async () => {
            while (buffer.length) {
              if (fn()) {
                const data = buffer.shift()
                if (data != null) listener.next(data)
              } else {
                await sleep(300)
              }
            }
            listener.complete()
          },
        })
      },
      stop() {
        subscription?.unsubscribe()
      },
    })
  }

export const subscribeOnNext =
  <T extends any>(onNext: (value: T) => void) =>
  (stream: Stream<T>) => {
    return stream.subscribe({
      next: (data: T) => onNext(data),
    })
  }

type Func<T extends any[]> = (...data: T) => void
export const toEventSubscription =
  <T extends any[]>(eventSubscribe: (handler: Func<T>) => Subs) =>
  (stream: Stream<Func<T>>) => {
    let subscription: Subscription | undefined
    let subs: Subs | undefined

    subscription = stream.subscribe({
      next: (handler) => {
        subs = eventSubscribe(handler)
      },
    })

    return () => {
      subscription?.unsubscribe()
      subs?.()
    }
  }

export const toEventSubscription_ =
  <T extends unknown>(handler: (data: T) => void, onError?: (error: Error) => void) =>
  (stream: Stream<T>) => {
    const subscription = stream.subscribe({
      next: (data) => handler(data),
      error: (err) => {
        onError?.(err)
      },
    })

    return () => subscription.unsubscribe()
  }

export function fromAsyncGenerator<T>(generator: AsyncIterable<T>): Stream<T> {
  let isCanceled = false

  return xs.create({
    async start(sink) {
      try {
        for await (let data of generator) {
          sink.next(data)
          if (isCanceled) {
            break
          }
        }
        sink.complete()
      } catch (err) {
        sink.error(err)
      }
    },
    stop() {
      isCanceled = true
    },
  })
}

export class IntervalProducer implements Producer<number> {
  accumulator: number = 0
  _isCanceled = false
  constructor(private getInterval: () => number, private getSyncInterval: () => number) {}

  async start(sink: Listener<number>) {
    while (true) {
      this.accumulator += this.getInterval()

      if (this.accumulator >= this.getSyncInterval()) {
        sink.next(this.accumulator)
        this.accumulator = 0
      }
      if (this._isCanceled) break
      await sleep(this.getInterval())
    }
  }
  stop() {
    this._isCanceled = true
  }
}
