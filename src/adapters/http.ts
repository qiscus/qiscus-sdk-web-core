import ky from 'ky-universal'

export interface IQHttpAdapter {
  get<T> (path: string): Promise<T>
  post<T> (path: string, data?: object): Promise<T>
  patch<T> (path: string, data?: object): Promise<T>
  put<T> (path: string, data?: object): Promise<T>
  delete<T> (path: string, data?: object): Promise<T>
}

export default function getHttpAdapter ({ baseUrl, getAppId, getUserId, getToken, getSdkVersion }): IQHttpAdapter {
  const api = ky.create({
    prefixUrl: baseUrl,
    hooks: {
      beforeRequest: [
        (options) => {
          options.headers['qiscus-sdk-app-id'] = getAppId()
          options.headers['qiscus-sdk-user-id'] = getUserId()
          options.headers['qiscus-sdk-token'] = getToken()
          options.headers['qiscus-sdk-version'] = getSdkVersion()
          options.headers['qiscus-sdk-platform'] = 'JavaScript'
        }
      ]
    }
  })

  return {
    delete<T> (path: string, data?: object): Promise<T> {
      return api.delete(path, { json: data }).json<T>()
    },
    get<T> (path: string): Promise<T> {
      return api.get(path).json<T>()
    },
    patch<T> (path: string, data?: object): Promise<T> {
      return api.patch(path, { json: data }).json<T>()
    },
    post<T> (path: string, data?: object): Promise<T> {
      return api.post(path, { json: data }).json<T>()
    },
    put<T> (path: string, data?: object): Promise<T> {
      return api.post(path, { json: data }).json<T>()
    }
  }
}

