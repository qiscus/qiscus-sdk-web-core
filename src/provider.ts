import { storageFactory } from './storage'

type Storage = ReturnType<typeof storageFactory>

const withHeaders = (s: Storage) => ({
  headers: {
    'qiscus-sdk-app-id': s.getAppId(),
    'qiscus-sdk-version': s.getVersion(),
  }
})
const withCredentials = (s: Storage) => ({
  headers: {
    'qiscus-sdk-token': s.getToken(),
    'qiscus-sdk-user-id': s.getCurrentUser()?.id,
  }
})

const withBaseUrl = (s: Storage) => ({
  baseUrl: s.getBaseUrl()
})

export const Provider = (s: ReturnType<typeof storageFactory>) => ({
  withHeaders: withHeaders(s),
  withCredentials: withCredentials(s),
  withBaseUrl: withBaseUrl(s),
})

