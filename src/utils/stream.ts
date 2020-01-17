import xs, { Stream, Subscription } from 'xstream'
import { Subscription as Subs } from '../defs'

type Callback<T> = (value: T, error?: Error | null) => void;
export const toPromise = <T> (stream: Stream<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    let value = null
    stream.subscribe({
      next (data) {
        value = data
      },
      error (error) {
        reject(error)
      },
      complete () {
        resolve(value)
      },
    })
  })
export const toCallback = <T> (callback: Callback<T>) => (stream: Stream<T>) => {
  let value = null
  const subscription = stream.subscribe({
    next (data) {
      value = data
    },
    error (error) {
      callback(null, error)
    },
    complete () {
      callback(value)
      subscription.unsubscribe()
    },
  })
}
export const toCallbackOrPromise = <T> (callback?: Callback<T> | null) => (
  stream: Stream<T>,
) => {
  if (callback == null) return toPromise(stream)
  return toCallback(callback)(stream)
}

export const tryCatch = <T> (
  fn: () => T,
  onError: (error: Error) => void,
): void => {
  try {
    fn()
  } catch (error) {
    onError(error)
  }
}

export const process = <T> (item: T, ...checkers: Function[]): Stream<T> =>
  xs.create({
    start (listener) {
      checkers.forEach(check => {
        tryCatch(
          () => {
            const value = check(item)
            listener.next(value)
            listener.complete()
          },
          error => listener.error(error),
        )
      })
    },
    stop () {},
  })

export const tap = <T> (
  onNext: (value: T) => void,
  onError?: (error: Error) => void,
  onComplete?: () => void,
) => (stream: Stream<T>): Stream<T> => {
  let subscription: Subscription = null
  return xs.create<T>({
    start (listener) {
      subscription = stream.subscribe({
        next (value) {
          if (onNext != null) onNext(value)
          listener.next(value)
        },
        error (error) {
          if (onError != null) onError(error)
          listener.error(error)
        },
        complete () {
          if (onComplete != null) onComplete()
          listener.complete()
        },
      })
    },
    stop () {
      if (subscription != null) subscription.unsubscribe()
    },
  })
}

const sleep = (time: number) => new Promise(res => setTimeout(res, time))
export const bufferUntil = <T> (fn: () => boolean) => (
  stream: Stream<T>,
): Stream<T> => {
  const buffer = []
  let subscription: Subscription
  return xs.create({
    start (listener) {
      subscription = stream.subscribe({
        next: data => {
          buffer.push(data)
          while (fn() && buffer.length) {
            const data = buffer.shift()
            listener.next(data)
          }
        },
        error: err => listener.error(err),
        complete: async () => {
          while (buffer.length) {
            if (fn()) listener.next(buffer.shift())
            await sleep(300)
          }
          listener.complete()
        },
      })
    },
    stop () {
      subscription && subscription.unsubscribe()
    },
  })
}

export const subscribeOnNext = <T extends any[]> (
  onNext: (value: T) => void,
) => (stream: Stream<T>) => {
  return stream.subscribe({
    next: (data: T) => onNext(data),
  })
}

type Func<T extends any[]> = (...data: T) => void;
export const toEventSubscription = <T extends any[]> (
  eventSubscribe: (handler: Func<T>) => Subs,
) => (stream: Stream<Func<T>>) => {
  let subscription: Subscription = null
  let subs: Subs = null
  subscription = stream.subscribe({
    next: handler => {
      subs = eventSubscribe(handler)
    },
  })

  return () => {
    subscription.unsubscribe()
    subs()
  }
}

export const toEventSubscription_ =
  <T extends unknown> (handler: (data: T) => void, onError?: (error: Error) => void) =>
    (stream: Stream<T>) => {
      const subscription = stream.subscribe({
        next: data => handler(data),
        error: err => onError?.(err),
      })

      return () => subscription.unsubscribe()
    }

export const share = <T> () => (source: Stream<T>): Stream<T> => {
  let subscription: Subscription = null
  return xs.create<T>({
    start (listener) {},
    stop () {},
  })
}
