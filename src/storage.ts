import { IQAccount, IQChatRoom, IQMessage } from './model'

export const storageFactory = () => {
  const storage = new Map<string, any>()
  const makeSetter = <T>(name: string) => (value: T): void => {
    storage.set(name, value)
  }
  const makeGetter = <T>(name: string, defaultValue?: T) => (): T =>
    storage.get(name) ?? defaultValue

  const defaultBaseURL = 'https://api.qiscus.com'
  const defaultUploadUrl = `${defaultBaseURL}/api/v2/sdk/upload`
  const defaultBrokerUrl = 'wss://realtime-bali.qiscus.com:1886/mqtt'
  const defaultBrokerLbUrl = 'https://realtime.qiscus.com'

  return {
    getAppId: makeGetter<string>('app-id'),
    setAppId: makeSetter<string>('app-id'),

    getBaseUrl: makeGetter<string>('base-url', defaultBaseURL),
    setBaseUrl: makeSetter<string>('base-url'),
    getBrokerUrl: makeGetter<string>('broker-url', defaultBrokerUrl),
    setBrokerUrl: makeSetter<string>('broker-url'),
    getBrokerLbUrl: makeGetter<string>('broker-lb-url', defaultBrokerLbUrl),
    setBrokerLbUrl: makeSetter<string>('broker-lb-url'),
    getUploadUrl: makeGetter<string>('upload-url', defaultUploadUrl),
    setUploadUrl: makeSetter<string>('upload-url'),

    getSyncInterval: makeGetter<number>('sync-interval', 5000),
    setSyncInterval: makeSetter<number>('sync-interval'),
    getVersion: makeGetter<string>('version'),
    setVersion: makeSetter<string>('version'),

    getDebugEnabled: makeGetter<boolean>('is-debug-enabled', false),
    setDebugEnabled: makeSetter<boolean>('is-debug-enabled'),
    getBrokerLbEnabled: makeGetter<boolean>('is-broker-lb-enabled', true),
    setBrokerLbEnabled: makeSetter<boolean>('is-broker-lb-enabled'),

    getToken: makeGetter<string>('token'),
    setToken: makeSetter<string>('token'),
    getCurrentUser: makeGetter<IQAccount>('current-user'),
    setCurrentUser: makeSetter<IQAccount>('current-user'),
    getCustomHeaders: makeGetter<Record<string, string>>('custom-headers'),
    setCustomHeaders: makeSetter<Record<string, string>>('custom-headers'),

    getRooms: makeGetter<IQChatRoom[]>('chat-rooms'),
    setRooms: makeSetter<IQChatRoom[]>('chat-rooms'),
    getMessages: makeGetter<IQMessage[]>('messages'),
    setMessages: makeSetter<IQMessage[]>('messages'),
  }
}
