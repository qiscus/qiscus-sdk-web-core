import { Storage } from '../storage'
import * as Api from '../api'
import * as Provider from '../provider'

const getSetupAdapter = (s: Storage) => ({
  setupWithCustomServer() {
    const apiConfig = Api.getConfig({
      ...Provider.withBaseUrl(s),
      ...Provider.withHeaders(s),
    })
    return Api.request<GetSetupAppConfig.RootObject>(apiConfig)
  },
})

export default getSetupAdapter

// Response type
declare module GetSetupAppConfig {
  export interface Result {
    base_url: string
    broker_lb_url: string
    broker_url: string
    enable_event_report: boolean
    enable_realtime: boolean
    enable_realtime_check: boolean
    extras: string
    sync_interval: number
    sync_on_connect: number
  }

  export interface RootObject {
    results: Result
  }
}
