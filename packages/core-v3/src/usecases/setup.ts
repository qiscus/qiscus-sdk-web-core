import xs from 'xstream'
import flattenConcurrently from 'xstream/extra/flattenConcurrently'
import { IQCallback1 } from '../defs'
import * as model from '../v3/model'
import {
  bufferUntil,
  process,
  toCallbackOrPromise,
} from '../utils/stream'
import {
  isOptCallback,
  isOptNumber,
  isOptString,
  isReqBoolean,
  isReqString,
} from '../utils/param-utils'
import { QiscusDeps } from './types'

export function setup(deps: QiscusDeps, appId: string, callback?: IQCallback1): void | Promise<void> {
  return setupWithCustomServer(deps, appId, undefined, undefined, undefined, undefined, callback)
}

export function setupWithCustomServer(
  deps: QiscusDeps,
  appId: string,
  baseUrl: string = deps.storage.getBaseUrl(),
  brokerUrl: string = deps.storage.getBrokerUrl(),
  brokerLbUrl: string = deps.storage.getBrokerLbUrl(),
  syncInterval: number = 5000,
  callback?: (error?: Error) => void
): void | Promise<void> {
  const setterHelper = <T>(fromUser: T, fromServer: T | undefined, defaultValue: T): T => {
    if (typeof fromServer === 'string' && fromServer === '') {
      if (fromUser != null) {
        if (typeof fromUser !== 'string') return fromUser
        if (fromUser.length > 0) return fromUser
      }
    }
    if (typeof fromServer === 'string' && fromServer != null) {
      if (fromServer.length > 0) return fromServer
      if (typeof fromServer !== 'string') return fromServer
    }
    return defaultValue
  }

  const brokerUrlSetter = (mqttResult: string) => {
    if (mqttResult.includes('wss://')) {
      return mqttResult
    } else {
      return `wss://${mqttResult}:1886/mqtt`
    }
  }

  return xs
    .combine(
      process(appId, isReqString({ appId })),
      process(baseUrl, isOptString({ baseUrl })),
      process(brokerUrl, isOptString({ brokerUrl })),
      process(brokerLbUrl, isOptString({ brokerLbUrl })),
      process(syncInterval, isOptNumber({ syncInterval })),
      process(callback, isOptCallback({ callback }))
    )
    .map(([appId, baseUrl, brokerUrl, brokerLbUrl, syncInterval]) => {
      const defaultBaseUrl = deps.storage.getBaseUrl()
      const defaultBrokerUrl = deps.storage.getBrokerUrl()
      const defaultBrokerLbUrl = deps.storage.getBrokerLbUrl()

      // We need to disable realtime load balancing if user are using custom server
      // and did not provide a brokerLbUrl
      const isDifferentBaseUrl = baseUrl !== defaultBaseUrl
      const isDifferentBrokerUrl = brokerUrl !== defaultBrokerUrl
      const isDifferentBrokerLbUrl = brokerLbUrl !== defaultBrokerLbUrl
      // disable realtime lb if user change baseUrl or mqttUrl but did not change
      // broker lb url
      if ((isDifferentBaseUrl || isDifferentBrokerUrl) && !isDifferentBrokerLbUrl) {
        deps.loggerAdapter.log(
          '' +
            'force disable load balancing for realtime server, because ' +
            '`baseUrl` or `brokerUrl` get changed but ' +
            'did not provide `brokerLbURL`'
        )
        deps.storage.setBrokerLbEnabled(false)
      }

      deps.storage.setAppId(appId)
      deps.storage.setBaseUrl(baseUrl)
      deps.storage.setBrokerUrl(brokerUrl)
      deps.storage.setBrokerLbUrl(brokerLbUrl)
      deps.storage.setSyncInterval(syncInterval)
      deps.storage.setDebugEnabled(false)
      deps.storage.setVersion('javascript-3.4.2')

      return xs.fromPromise(deps.userAdapter.getAppConfig())
    })
    .compose(flattenConcurrently)
    .map((appConfig) => {
      deps.storage.setBaseUrl(setterHelper(baseUrl, appConfig.baseUrl, deps.storage.defaultBaseURL))
      deps.storage.setBrokerUrl(
        brokerUrlSetter(setterHelper(brokerUrl, appConfig.brokerUrl, deps.storage.defaultBrokerUrl))
      )
      deps.storage.setBrokerLbUrl(setterHelper(brokerLbUrl, appConfig.brokerLbUrl, deps.storage.defaultBrokerLbUrl))
      deps.storage.setSyncInterval(
        setterHelper(syncInterval, appConfig.syncInterval, deps.storage.defaultSyncInterval)
      )
      deps.storage.setSyncIntervalWhenConnected(
        setterHelper(
          deps.storage.defaultSyncIntervalWhenConnected,
          appConfig.syncOnConnect,
          deps.storage.defaultSyncIntervalWhenConnected
        )
      )
      deps.storage.setIsSyncEnabled(setterHelper(true, appConfig.isSyncEnabled, true))
      deps.storage.setIsSyncEventEnabled(setterHelper(false, appConfig.isSyncEventEnabled, false))
    })
    .compose(toCallbackOrPromise<void>(callback))
}

export function setCustomHeader(deps: QiscusDeps, headers: Record<string, string>): void {
  deps.storage.setCustomHeaders(headers)
}

export function setSyncInterval(deps: QiscusDeps, interval: number): void {
  deps.storage.setSyncInterval(interval)
}

export function enableDebugMode(deps: QiscusDeps, enable: boolean, callback?: IQCallback1) {
  return process(enable, isReqBoolean({ enable }))
    .compose(bufferUntil(() => deps.storage.getCurrentUser() != null))
    .map((enable: boolean) => deps.loggerAdapter.setEnable(enable))
    .compose(toCallbackOrPromise<void>(callback))
}

export async function startSync(deps: QiscusDeps) {
  deps.storage.setForceDisableSync(false)
}

export async function stopSync(deps: QiscusDeps) {
  deps.storage.setForceDisableSync(true)
}

export async function openRealtimeConnection(deps: QiscusDeps) {
  return deps.realtimeAdapter.openMqtt()
}

export async function closeRealtimeConnection(deps: QiscusDeps) {
  return deps.realtimeAdapter.closeMqtt()
}

export function synchronize(deps: QiscusDeps, lastMessageId: model.IQAccount['lastMessageId']): void {
  deps.realtimeAdapter.synchronize(lastMessageId)
}

export function synchronizeEvent(deps: QiscusDeps, lastEventId: model.IQAccount['lastSyncEventId']): void {
  deps.realtimeAdapter.synchronizeEvent(lastEventId)
}
