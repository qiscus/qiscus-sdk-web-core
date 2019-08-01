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
          // @ts-ignore
          options.headers.set('qiscus-sdk-app-id',  getAppId())
          // @ts-ignore
          options.headers.set('qiscus-sdk-user-id', getUserId())
          // @ts-ignore
          options.headers.set('qiscus-sdk-token', getToken())
          // @ts-ignore
          options.headers.set('qiscus-sdk-version', getSdkVersion())
          // @ts-ignore
          options.headers.set('qiscus-sdk-platform', 'JavaScript')
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

