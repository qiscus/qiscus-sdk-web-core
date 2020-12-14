import { Storage } from './storage'

export const withHeaders = (s: Storage) => ({
  headers: {
    'qiscus-sdk-app-id': s.getAppId(),
    'qiscus-sdk-version': s.getVersion(),
  },
})
export const withCredentials = (s: Storage) => ({
  headers: {
    ...withHeaders(s).headers,
    'qiscus-sdk-token': s.getToken(),
    'qiscus-sdk-user-id': s.getCurrentUser()?.id,
  },
})

export const withBaseUrl = (s: Storage) => ({
  baseUrl: `${s.getBaseUrl()}/api/v2/sdk`,
})

export const Provider = (s: Storage) => ({
  withHeaders: withHeaders(s),
  withCredentials: withCredentials(s),
  withBaseUrl: withBaseUrl(s),
})
