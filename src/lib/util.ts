export const tryCatch = <T>(fn: () => T, default_: T, onError?: (error: Error) => void) => {
  try {
    return fn()
  } catch (error) {
    if (onError != null) onError(error)
    return default_
  }
}
