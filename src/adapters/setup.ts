import { Storage } from '../storage'
import * as Api from '../api'
import * as model from '../model'
import * as Provider from '../provider'

const getSetupAdapter = (s: Storage) => ({
  setupWithCustomServer(): any | Promise<model.IQUser> {
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
  export interface Results {
    base_url: string
    broker_lb_url: string
    broker_url: string
    enable_event_report: boolean
    extras: string
    sync_interval: number
    enable_realtime: boolean
    sync_on_connect: number
  }

  export interface RootObject {
    result: Results
    status: number
  }
}
