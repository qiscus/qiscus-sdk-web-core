import { IQUserExtraProps } from '../defs'
import * as Api from '../api'
import { Storage } from '../storage'
import * as Provider from '../provider'
import * as model from '../v3/model'

export type NonceResponse = {
  status: number
  results: { expired_at: number; nonce: string }
}

export type UserAdapterRaw = ReturnType<typeof getUserAdapterRaw>

const getUserAdapterRaw = (s: Storage, api: Api.ApiRequester) => ({
  login(
    userId: string,
    userKey: string,
    { avatarUrl, extras, name }: IQUserExtraProps
  ): Promise<UserResponse.RootObject> {
    const apiConfig = Api.loginOrRegister({
      ...Provider.withBaseUrl(s),
      ...Provider.withHeaders(s),
      userId,
      userKey,
      username: name,
      extras,
      avatarUrl,
    })

    return api.request<UserResponse.RootObject>(apiConfig)
  },
  blockUser(userId: string): Promise<BlockUserResponse.RootObject> {
    const apiConfig = Api.blockUser({
      ...Provider.withBaseUrl(s),
      ...Provider.withCredentials(s),
      userId: userId,
    })
    return api.request<BlockUserResponse.RootObject>(apiConfig)
  },
  getUserPresences(userIds: string[]): Promise<UserPresencesResponse.RootObject> {
    return api.request<UserPresencesResponse.RootObject>(
      Api.getUserPresences({
        ...Provider.withBaseUrl(s),
        ...Provider.withCredentials(s),
        userIds,
      })
    )
  },
  getBlockedUser(page: number = 1, limit: number = 20): Promise<BlockedUserListResponse.RootObject> {
    const apiConfig = Api.getBlockedUsers({
      ...Provider.withBaseUrl(s),
      ...Provider.withCredentials(s),
      limit,
      page,
    })
    return api.request<BlockedUserListResponse.RootObject>(apiConfig)
  },
  getUserList(query: string = '', page: number = 1, limit: number = 20): Promise<UserListResponse.RootObject> {
    return api.request<UserListResponse.RootObject>(
      Api.getUserList({
        ...Provider.withBaseUrl(s),
        ...Provider.withCredentials(s),
        query,
        page,
        limit,
      })
    )
  },
  unblockUser(userId: string): Promise<BlockUserResponse.RootObject> {
    return api.request<BlockUserResponse.RootObject>(
      Api.unblockUser({
        ...Provider.withBaseUrl(s),
        ...Provider.withCredentials(s),
        userId,
      })
    )
  },
  setUserFromIdentityToken(identityToken: string): Promise<UserResponse.RootObject> {
    return api.request<UserResponse.RootObject>(
      Api.verifyIdentityToken({
        ...Provider.withBaseUrl(s),
        ...Provider.withHeaders(s),
        identityToken,
      })
    )
  },
  updateUser(
    name?: model.IQAccount['name'],
    avatarUrl?: model.IQAccount['avatarUrl'],
    extras?: model.IQAccount['extras']
  ): Promise<UserResponse.RootObject> {
    return api.request<UserResponse.RootObject>(
      Api.patchProfile({
        ...Provider.withBaseUrl(s),
        ...Provider.withCredentials(s),
        name,
        avatarUrl,
        extras,
        id: s.getCurrentUser().id,
      })
    )
  },
  getNonce(): Promise<NonceResponse> {
    return api.request<NonceResponse>(
      Api.getNonce({
        ...Provider.withBaseUrl(s),
        ...Provider.withHeaders(s),
      })
    )
  },
  getUserData(): Promise<UserResponse.RootObject> {
    return api.request<UserResponse.RootObject>(
      Api.getProfile({
        ...Provider.withBaseUrl(s),
        ...Provider.withCredentials(s),
      })
    )
  },
  registerDeviceToken(deviceToken: string, isDevelopment: boolean = false): Promise<DeviceTokenResponse.RootObject> {
    return api.request<DeviceTokenResponse.RootObject>(
      Api.setDeviceToken({
        ...Provider.withBaseUrl(s),
        ...Provider.withCredentials(s),
        isDevelopment,
        deviceToken,
      })
    )
  },
  unregisterDeviceToken(
    deviceToken: string,
    isDevelopment: boolean = false
  ): Promise<DeviceTokenResponse.RootObject> {
    return api.request<DeviceTokenResponse.RootObject>(
      Api.removeDeviceToken({
        ...Provider.withBaseUrl(s),
        ...Provider.withCredentials(s),
        deviceToken,
        isDevelopment,
      })
    )
  },
  async getAppConfig(): Promise<AppConfigResponse.RootObject> {
    return api.request<AppConfigResponse.RootObject>(
      Api.appConfig({
        ...Provider.withBaseUrl(s),
        ...Provider.withHeaders(s),
      })
    )
  },
})

export default getUserAdapterRaw

// Response type
export declare module UserResponse {
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
export declare module BlockUserResponse {
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
export declare module UserListResponse {
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
export declare module BlockedUserListResponse {
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
export declare module UserPresencesResponse {
  export interface UserStatus {
    email: string
    status: number
    timestamp: number
    timestamp_str: string
  }

  export interface Results {
    user_status: UserStatus[]
  }

  export interface RootObject {
    results: Results
    status: number
  }
}
export declare module DeviceTokenResponse {
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
export declare module AppConfigResponse {
  export interface Results {
    base_url: string
    broker_lb_url: string
    broker_url: string
    enable_event_report: boolean
    sync_interval: number
    sync_on_connect: number
    enable_realtime: boolean
    enable_realtime_check: boolean
    extras: string
    enable_sync: boolean | undefined
    enable_sync_event: boolean | undefined
  }

  export interface RootObject {
    results: Results
    status: number
  }
}
