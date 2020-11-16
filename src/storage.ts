import { IQAccount, IQChatRoom, IQMessage } from 'model.d.ts'

export type Storage = ReturnType<typeof storageFactory>

export const listStorageFactory = <T extends unknown>() => {
  const storage = new Map<string, T>()
  return {
    getOrSet(id: string, valueIfNull: T) {
      if (!storage.has(id)) storage.set(id, valueIfNull)
      return storage.get(id)
    },
    [Symbol.iterator]: storage[Symbol.iterator],
  }
}
export type ListStorageFactory = ReturnType<typeof listStorageFactory>

export const storageFactory = () => {
  // const storage = new Map<string, any>()
  const storage: Record<string, any> = {}
  const makeSetter = <T>(name: string) => (value: T): void => {
    // storage.set(name, value)
    storage[name] = value
  }
  const makeGetter = <T>(name: string, defaultValue?: T) => (): T => {
    // storage.get(name) ?? defaultValue
    return storage[name] ?? defaultValue
  }

  const defaultBaseURL = 'https://api.qiscus.com'
  const defaultUploadUrl = `${defaultBaseURL}/api/v2/sdk/upload`
  const defaultBrokerUrl = 'wss://mqtt.qiscus.com:1886/mqtt'
  const defaultBrokerLbUrl = 'https://realtime-lb.qiscus.com'
  const defaultSyncInterval = 5000
  const defaultSyncIntervalWhenConnected = 30000

  return {
    defaultBaseURL,
    defaultUploadUrl,
    defaultBrokerLbUrl,
    defaultBrokerUrl,
    defaultSyncInterval,
    defaultSyncIntervalWhenConnected,
    // @ts-ignore
    __storage: storage,
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

    getSyncInterval: makeGetter<number>('sync-interval', defaultSyncInterval),
    setSyncInterval: makeSetter<number>('sync-interval'),
    getSyncIntervalWhenConnected: makeGetter<number>(
      'sync-interval-when-connected',
      defaultSyncIntervalWhenConnected
    ),
    setSyncIntervalWhenConnected: makeSetter<number>(
      'sync-interval-when-connected'
    ),
    getVersion: makeGetter<string>('version'),
    setVersion: makeSetter<string>('version'),
    getAccSyncInterval: makeGetter<number>('acc-sync-interval', 1000),
    setAccSyncInterval: makeSetter<number>('acc-sync-interval'),

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

    getLastMessageId: makeGetter<IQAccount['lastMessageId']>('last-message-id'),
    setLastMessageId: makeSetter<IQAccount['lastMessageId']>('last-message-id'),
    getLastEventId: makeGetter<IQAccount['lastSyncEventId']>('last-event-id'),
    setLastEventId: makeSetter<IQAccount['lastSyncEventId']>('last-event-id'),
  }
}
