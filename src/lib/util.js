export const tryCatch = (
  fn,
  default_,
  onError,
  onSuccess
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

export const wrapP = (promise) =>
  promise.then(res => [res, null]).catch(err => [null, err])

export const sleep = (time = 1000) =>
  new Promise(r => setTimeout(r, time))
