export const tryCatch = <T>(
  fn: () => T,
  default_: T,
  onError?: (error: Error) => void,
  onSuccess?: (resp: T) => void
) => {
  try {
    const resp = fn()
    if (onSuccess != null) onSuccess(resp)
    return resp
  } catch (error) {
    if (onError != null) onError(error)
    return default_
  }
}

export const wrapP = <T>(promise: Promise<T>) =>
  promise.then(res => [res, null]).catch(err => [null, err])
