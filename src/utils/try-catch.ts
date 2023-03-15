import * as model from '../model'

export const tryCatch = <T>(
  fn: () => T,
  default_: T,
  onError?: (error: Error) => void,
  onSuccess?: (resp: T) => void
) => {
  try {
    const resp = fn()
    onSuccess?.(resp)
    return resp
  } catch (error) {
    onError?.(error as Error)
    return default_
  }
}

export const wrapP = <T>(promise: Promise<T>) => promise.then((res) => [res, null]).catch((err) => [null, err])

export const getOrThrow = <T>(item: T | null | undefined, msg: string): T => {
  if (item != null) return item
  else throw new Error(msg)
}

export const isChatRoom = <T extends unknown>(data: T | model.IQChatRoom): data is model.IQChatRoom => {
  return (data as model.IQChatRoom).id != null
}
