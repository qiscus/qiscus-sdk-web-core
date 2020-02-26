import { Storage } from '../storage'
import * as Api from '../api'
import * as model from '../model'
import * as Provider from '../provider'

const getSetupAdapter = (s: Storage) => ({
  // setup(appId: string, syncInterval: number): Promise<model.IQUser> {
  //   const apiConfig = Api.setup({
  //     ...Provider.withBaseUrl(s),
  //     ...Provider.withHeaders(s),
  //     appId,
  //     syncInterval,
  //   })
  //   return Api.request<GetSetupAppConfig.RootObject>(apiConfig).then()
  // },

  setupWithCustomServer(
    appId: string,
    baseUrl: string,
    brokerUrl: string,
    brokerLbUrl: string,
    syncInterval: number
  ): Promise<model.IQUser> {
    const apiConfig = Api.setupWithCustomServer({
      ...Provider.withBaseUrl(s),
      ...Provider.withHeaders(s),
      appId,
      baseUrl,
      brokerUrl,
      brokerLbUrl,
      syncInterval,
    })
    return Api.request<GetSetupAppConfig.RootObject>(apiConfig).catch(
      err => err
    )
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
  }
}
