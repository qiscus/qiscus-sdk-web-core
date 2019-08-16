import * as is from 'is_js'
import {pipe} from 'callbag-basics'
import catchError from 'callbag-catch-error'
import observe from 'callbag-observe'

export type Callbag<I, O> = {
  (t: 0, d: Callbag<O, I>): void
  (t: 1, d: I): void
  (t: 2, d?: Error): void
}
export type Source<T> = Callbag<void, T>
export type Sink<T> = Callbag<T, void>
export type Type = 0 | 1 | 2
export type Payload = any

export const every = <T>(...checkers: Array<Function>) => (item: T) => checkers.every(check => check(item))
export const some = <T>(...checkers: Array<Function>) => (item: T) => checkers.some(check => check(item))
export const compose = <T>(msg: string, checker: (it: T) => boolean) => (item: T) => {
  const isFullfiled = checker(item)
  if (isFullfiled) return item
  throw new TypeError(msg)
}

export const toPromise = <A>() => (source: Source<A>) => new Promise<A>((resolve, reject) => {
  source(0, (t: Type, d: Payload) => {
    if (t === 1) return resolve(d)
    else if (t === 2 && d != null) return reject(d)
  })
})
type Callback<A> = (a: A, b: Error) => void
export const toCallback = <A>(callback: Callback<A>) => (source: Source<A>) => {
  if (callback == null) callback = (_, error) => error && console.log(error)
  return pipe(
    source,
    catchError((error: Error) => callback(null, error)),
    observe((value: A) => callback(value, null))
  )
}
export const toCallbackOrPromise = <A>(cb?: Callback<A>) => (source: Source<A>) => {
  if (cb == null) return pipe(source, toPromise())
  return pipe(source, toCallback(cb))
}
export const tryCatch = <T>(fn: () => T, onError: (error: Error) => void): void => {
  try { fn() } catch (error) { onError(error) }
}
export const safeMap = <A>(fn: Function) => (source: Source<A>) => (start: Type, d) => {
  if (start !== 0) return
  const sink: Source<A> = d
  source(0, (t, d) => {
    if (t === 1) {
      tryCatch(
        () => sink(1, fn(d)),
        error => sink(2, error)
      )
    } else {
      sink(t, d)
    }
  })
}

export const tap = <T>(o: (data: T) => void, e?: (err: Error) => void, c?: () => void) => (source: Source<T>) => (start: Type, sink) => {
  if (start !== 0) return;
  source(0, (t, d) => {
    if (t === 1 && d !== undefined && o) o(d);
    else if (t === 2) {
      if (d) e && e(d)
      else c && c();
    }
    sink(t, d);
  });
};

export const process = <T>(item: T, ...checkers: Function[]): Source<T> => (start: Type, d) => {
  if (start !== 0) return
  const sink: Source<T> = d
  checkers.forEach(check => {
    tryCatch(
      () => sink(1, check(item)),
      error => sink(2, error)
    )
  })
}

export const isReqString = (msg: string) => compose(msg, every(is.not.null, is.not.undefined, is.string))
export const isReqNumber = (msg: string) => compose(msg, every(is.not.null, is.not.undefined, is.number))
export const isReqJson = (msg: string) => compose(msg, every(is.not.null, is.not.undefined, is.json))
export const isReqArrayNumber = (msg: string) => compose(msg, every(is.not.null, is.not.undefined, is.array, is.all.number))
export const isReqArrayString = (msg: string) => compose(msg, every(is.not.null, is.not.undefined, is.array, is.all.string))
export const isOptString = (msg: string) => compose(msg, some(is.null, is.undefined, is.string))
export const isOptNumber = (msg: string) => compose(msg, some(is.null, is.undefined, is.number))
export const isOptJson = (msg: string) => compose(msg, some(is.null, is.undefined, is.json))
export const isOptCallback = (msg: string) => compose(msg, some(is.null, is.undefined, is.function))
export const isOptBoolean = (msg: string) => compose(msg, some(is.null, is.undefined, is.boolean))
