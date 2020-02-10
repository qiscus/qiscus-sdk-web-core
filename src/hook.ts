import xs, { Stream } from 'xstream'
import { tap } from './utils/stream'

export const Hooks = {
  MESSAGE_BEFORE_SENT: 'message::before-sent',
  MESSAGE_BEFORE_RECEIVED: 'message::before-received',
}

export function hookAdapterFactory () {
  type Callback<T extends unknown> = (data: T) => T
  const hooks: Record<string, Callback<any>[]> = {}
  const get = (key: string) => {
    if (!Array.isArray(hooks[key])) hooks[key] = []
    return hooks[key]
  }

  function intercept<T extends unknown> (
    hook: string, callback: (data: T) => T): () => void {
    get(hook).push(callback)

    const index = get(hook).length
    return () => get(hook).splice(index, 1)
  }

  function trigger<T extends unknown> (hook: string, payload: T): Promise<T> {
    return get(hook).reduce(
      (acc, fn) => Promise.resolve(acc).then(fn),
      Promise.resolve(payload),
    )
  }

  const triggerBeforeReceived$ = <T extends unknown> (payload: T): Stream<T> =>
    xs.fromPromise(trigger(Hooks.MESSAGE_BEFORE_RECEIVED, payload))

  return {
    trigger,
    triggerBeforeReceived$,
    intercept,
  }
}
