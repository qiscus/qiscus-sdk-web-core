import { IQUserExtraProps } from '../defs'
import * as Decoder from '../decoder'
import * as model from '../model'
import * as Api from '../api'
import { Storage } from '../storage'
import * as Provider from '../provider'

type NonceResponse = {
  status: number
  results: { expired_at: number; nonce: string }
}
export type UserAdapter = ReturnType<typeof getUserAdapter>

const getUserAdapter = (s: Storage) => ({
  login (
    userId: string,
    userKey: string,
    { avatarUrl, extras, name }: IQUserExtraProps,
  ): Promise<model.IQAccount> {
    const apiConfig = Api.loginOrRegister({
      ...Provider.withBaseUrl(s),
      ...Provider.withHeaders(s),
      userId,
      userKey,
      username: name,
      extras,
      avatarUrl,
    })

    return Api.request<UserResponse.RootObject>(apiConfig)
      .then(resp => {
        const [account, token_] = Decoder.account(resp.results.user)
        s.setCurrentUser(account)
        s.setToken(token_)
        s.setLastMessageId(account.lastMessageId)
        s.setLastEventId(account.lastSyncEventId)
        return account
      })
  },
  clear () {
    s.setCurrentUser(undefined)
    s.setToken(undefined)
  },
  blockUser (userId: string): Promise<model.IQUser> {
    const apiConfig = Api.blockUser({
      ...Provider.withBaseUrl(s),
      ...Provider.withCredentials(s),
      userId: userId,
    })
    return Api.request<BlockUserResponse.RootObject>(apiConfig)
      .then(resp => Decoder.user(resp.results.user))
  },
  getBlockedUser (
    page: number = 1,
    limit: number = 20,
  ): Promise<model.IQUser[]> {
    const apiConfig = Api.getBlockedUsers({
      ...Provider.withBaseUrl(s),
      ...Provider.withCredentials(s),
      limit,
      page,
    })
    return Api.request<BlockedUserListResponse.RootObject>(apiConfig)
      .then(resp => resp.results.users.map(Decoder.user))
  },
  getUserList (
    query: string = '',
    page: number = 1,
    limit: number = 20,
  ): Promise<model.IQUser[]> {
    return Api.request<UserListResponse.RootObject>(Api.getUserList({
      ...Provider.withBaseUrl(s),
      ...Provider.withCredentials(s),
      query,
      page,
      limit,
    })).then(resp => resp.results.users.map(it => Decoder.user(it as any)))
  },
  unblockUser (userId: string): Promise<model.IQUser> {
    return Api.request<BlockUserResponse.RootObject>(Api.unblockUser({
      ...Provider.withBaseUrl(s),
      ...Provider.withCredentials(s),
      userId,
    })).then(resp => Decoder.user(resp.results.user))
  },
  setUserFromIdentityToken (identityToken: string): Promise<model.IQAccount> {
    return Api.request<UserResponse.RootObject>(Api.verifyIdentityToken({
      ...Provider.withBaseUrl(s),
      ...Provider.withHeaders(s),
      identityToken,
    })).then(resp => {
      const [account, token] = Decoder.account(resp.results.user)
      s.setCurrentUser(account)
      s.setToken(token)
      return account
    })
  },
  updateUser (
    name?: model.IQAccount['name'],
    avatarUrl?: model.IQAccount['avatarUrl'],
    extras?: model.IQAccount['extras'],
  ): Promise<model.IQAccount> {
    return Api.request<UserResponse.RootObject>(Api.patchProfile({
      ...Provider.withBaseUrl(s),
      ...Provider.withCredentials(s),
      name,
      avatarUrl,
      extras,
      id: s.getCurrentUser().id,
    })).then(resp => {
      const [account] = Decoder.account(resp.results.user)
      return account
    })
  },
  getNonce (): Promise<string> {
    return Api.request<NonceResponse>(Api.getNonce({
      ...Provider.withBaseUrl(s),
      ...Provider.withHeaders(s),
    })).then(resp => resp.results.nonce)
  },
  getUserData (): Promise<model.IQAccount> {
    return Api.request<UserResponse.RootObject>(Api.getProfile({
      ...Provider.withBaseUrl(s),
      ...Provider.withCredentials(s),
    })).then(resp => {
      const [account] = Decoder.account(resp.results.user)
      return account
    })
  },
  registerDeviceToken (
    deviceToken: string,
    isDevelopment: boolean = false,
  ): Promise<boolean> {
    return Api.request<DeviceTokenResponse.RootObject>(Api.setDeviceToken({
      ...Provider.withBaseUrl(s),
      ...Provider.withCredentials(s),
      isDevelopment,
      deviceToken,
    })).then(resp => resp.results.changed)
  },
  unregisterDeviceToken (
    deviceToken: string,
    isDevelopment: boolean = false,
  ): Promise<boolean> {
    return Api.request<DeviceTokenResponse.RootObject>(Api.removeDeviceToken({
      ...Provider.withBaseUrl(s),
      ...Provider.withCredentials(s),
      deviceToken,
      isDevelopment,
    })).then(resp => resp.results.changed)
  },
})

export default getUserAdapter

// Response type
declare module UserResponse {
  export interface App {
    code: string
    id: number
    id_str: string
    name: string
  }

  export interface Avatar2 {
    url: string
  }

  export interface Avatar {
    avatar: Avatar2
  }

  export interface Extras {
    role: string
  }

  export interface User {
    app: App
    avatar: Avatar
    avatar_url: string
    email: string
    extras: object
    id: number
    id_str: string
    last_comment_id: number
    last_comment_id_str: string
    last_sync_event_id: number
    pn_android_configured: boolean
    pn_ios_configured: boolean
    rtKey: string
    token: string
    username: string
  }

  export interface Results {
    user: User
  }

  export interface RootObject {
    results: Results
    status: number
  }
}
declare module BlockUserResponse {
  export interface Avatar2 {
    url: string
  }

  export interface Avatar {
    avatar: Avatar2
  }

  export interface Extras {}

  export interface User {
    avatar: Avatar
    avatar_url: string
    email: string
    extras: Extras
    id: number
    id_str: string
    username: string
  }

  export interface Results {
    user: User
  }

  export interface RootObject {
    results: Results
    status: number
  }
}
declare module UserListResponse {
  export interface Meta {
    total_data: number
    total_page: number
  }

  export interface Extras {}

  export interface User {
    avatar_url: string
    created_at: Date
    email: string
    extras: Extras
    id: number
    name: string
    updated_at: Date
    username: string
  }

  export interface Results {
    meta: Meta
    users: User[]
  }

  export interface RootObject {
    results: Results
    status: number
  }
}
declare module BlockedUserListResponse {
  export interface Avatar2 {
    url: string
  }

  export interface Avatar {
    avatar: Avatar2
  }

  export interface Extras {}

  export interface BlockedUser {
    avatar: Avatar
    avatar_url: string
    email: string
    extras: Extras
    id: number
    id_str: string
    username: string
  }

  export interface Results {
    users: BlockedUser[]
    total: number
  }

  export interface RootObject {
    results: Results
    status: number
  }
}
declare module DeviceTokenResponse {
  export interface Results {
    changed: boolean
    pn_android_configured: boolean
    pn_ios_configured: boolean
  }

  export interface RootObject {
    results: Results
    status: number
  }
}
