import { IQUserExtraProps, IAppConfig } from '../defs'
import * as Decoder from '../v3/decoder'
import * as model from '../v3/model'
import * as Api from '../api'
import { Storage } from '../storage'
import getUserAdapterRaw from './user.raw'

export type UserAdapter = ReturnType<typeof getUserAdapter>

const getUserAdapter = (s: Storage, api: Api.ApiRequester) => {
  const raw = getUserAdapterRaw(s, api)

  return {
    login(userId: string, userKey: string, extra: IQUserExtraProps): Promise<model.IQAccount> {
      return raw.login(userId, userKey, extra).then((resp) => {
        const [account, token_] = Decoder.account(resp.results.user)
        s.setCurrentUser(account)
        s.setToken(token_)
        s.setLastMessageId(account.lastMessageId)
        s.setLastEventId(account.lastSyncEventId)
        return account
      })
    },
    clear() {
      // @ts-ignore
      s.setCurrentUser(undefined)
      // @ts-ignore
      s.setToken(undefined)
    },
    blockUser(userId: string): Promise<model.IQUser> {
      return raw.blockUser(userId).then((resp) => Decoder.user(resp.results.user))
    },
    getBlockedUser(page: number = 1, limit: number = 20): Promise<model.IQUser[]> {
      return raw.getBlockedUser(page, limit).then((resp) => resp.results.users.map(Decoder.user))
    },
    getUserList(query: string = '', page: number = 1, limit: number = 20): Promise<model.IQUser[]> {
      return raw.getUserList(query, page, limit).then((resp) => resp.results.users.map((it) => Decoder.user(it as any)))
    },
    unblockUser(userId: string): Promise<model.IQUser> {
      return raw.unblockUser(userId).then((resp) => Decoder.user(resp.results.user))
    },
    setUserFromIdentityToken(identityToken: string): Promise<model.IQAccount> {
      return raw.setUserFromIdentityToken(identityToken).then((resp) => {
        const [account, token] = Decoder.account(resp.results.user)
        s.setCurrentUser(account)
        s.setToken(token)
        return account
      })
    },
    updateUser(
      name?: model.IQAccount['name'],
      avatarUrl?: model.IQAccount['avatarUrl'],
      extras?: model.IQAccount['extras']
    ): Promise<model.IQAccount> {
      return raw.updateUser(name, avatarUrl, extras).then((resp) => {
        const [account] = Decoder.account(resp.results.user)
        return account
      })
    },
    getNonce(): Promise<string> {
      return raw.getNonce().then((resp) => resp.results.nonce)
    },
    getUserData(): Promise<model.IQAccount> {
      return raw.getUserData().then((resp) => {
        const [account] = Decoder.account(resp.results.user)
        return account
      })
    },
    registerDeviceToken(deviceToken: string, isDevelopment: boolean = false): Promise<boolean> {
      return raw.registerDeviceToken(deviceToken, isDevelopment).then((resp) => resp.results.changed)
    },
    unregisterDeviceToken(deviceToken: string, isDevelopment: boolean = false): Promise<boolean> {
      return raw.unregisterDeviceToken(deviceToken, isDevelopment).then((resp) => resp.results.changed)
    },
    async getAppConfig(): Promise<IAppConfig> {
      return raw.getAppConfig().then((r) => Decoder.appConfig(r.results))
    },
  }
}

export default getUserAdapter
