import xs, { Stream, Subscription } from 'xstream'

type Callback<T> = (value: T, error?: Error | null) => void
export const toPromise = <T> (stream: Stream<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    let value = null
    stream.subscribe({
      next (data) { value = data },
      error (error) { reject(error) },
      complete () { resolve(value) }
    })
  })
export const toCallback = <T> (callback: Callback<T>) =>
  (stream: Stream<T>) => {
    let value = null
    const subscription = stream.subscribe({
      next (data) { value = data },
      error (error) { callback(null, error) },
      complete () {
        callback(value)
        subscription.unsubscribe()
      }
    })
  }
export const toCallbackOrPromise = <T> (callback?: Callback<T> | null) =>
  (stream: Stream<T>) => {
    if (callback == null) return toPromise(stream)
    return toCallback(callback)(stream)
  }

export const tryCatch = <T> (fn: () => T, onError: (error: Error) => void): void => {
  try { fn() } catch (error) { onError(error) }
}

export const process = <T> (item: T, ...checkers: Function[]): Stream<T> => xs.create({
  start (listener) {
    checkers.forEach((check) => {
      tryCatch(() => {
        const value = check(item)
        listener.next(value)
        listener.complete()
      }, (error) => listener.error(error))
    })
  },
  stop () {}
})

export const tap = <T> (onNext: (value: T) => void, onError?: (error: Error) => void, onComplete?: () => void) => (stream: Stream<T>): Stream<T> => {
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
        }
      })
    },
    stop () {
      if (subscription != null) subscription.unsubscribe()
    }
  })
}
