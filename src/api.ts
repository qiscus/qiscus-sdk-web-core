import axios from 'axios'
import { IQUser, IQChatRoom, IQMessage } from './model'
import * as Encode from './encoder'
import { tryCatch } from './utils/try-catch'

export const request = <Resp extends unknown>(
  api: Partial<Api>
): Promise<Resp> => {
  return axios({
    method: api.method,
    baseURL: api.baseUrl,
    url: api.url,
    headers: api.headers,
    data: api.body,
    params: api.params,
  }).then(resp => resp.data)
}

type ApiRequest<O> = (o: O) => Partial<Api>

export type Api = {
  baseUrl?: string
  method: 'get' | 'post' | 'put' | 'patch' | 'delete'
  url: string
  params?: Record<string, string>
  headers?: Record<string, string>
  body?: Record<string, unknown>
}
export type withHeaders = {
  headers: {
    'qiscus-sdk-app-id': string
    'qiscus-sdk-version': string
  }
}
export type withCredentials = {
  headers: {
    'qiscus-sdk-token': string
    'qiscus-sdk-user-id': string
  }
} & withHeaders

type FnHeaders = <O extends withHeaders>() => ApiRequest<O>
const useCredentials: FnHeaders = () => o => ({
  headers: o.headers,
})
const useHeaders: FnHeaders = () => o => ({
  headers: o.headers,
})

type FnParams = <O>(fn: (o: O) => Json<any>) => ApiRequest<O>
const useParams: FnParams = fn => o => ({ params: fn(o) })

type FnUrl = (
  method: Api['method']
) => <O extends Partial<Api>>(url: Api['url']) => ApiRequest<O>
const useUrl: FnUrl = method => url => o => ({
  method,
  url,
  baseUrl: o.baseUrl,
})
const useGetUrl = useUrl('get')
const usePostUrl = useUrl('post')
const usePatchUrl = useUrl('patch')
const useDeleteUrl = useUrl('delete')

type Json<O = unknown> = Record<string, O>

type useBody = <O>(fn: (o: O) => Json<unknown>) => ApiRequest<O>
const useBody: useBody = mapper => o => ({
  body: mapper(o),
})

type compose = <O>(...fns: Array<ApiRequest<O>>) => (o: O) => Api
const compose: compose = (...fns) => o => {
  const { method, url, headers, params, body, baseUrl } = (fns.reduce(
    (acc, fn) => ({ ...acc, ...fn(o) }),
    o
  ) as unknown) as Api

  return { method, url, headers, params, body, baseUrl }
}

export type loginOrRegisterParams = {
  userId: string
  userKey: string
  username?: string
  avatarUrl?: string
  deviceToken?: string
  extras?: Record<string, unknown>
}
export const loginOrRegister: ApiRequest<loginOrRegisterParams &
  withHeaders> = compose(
  usePostUrl('/login_or_register'),
  useHeaders(),
  useBody(Encode.loginOrRegister)
)

export const getNonce: ApiRequest<withHeaders> = compose(
  usePostUrl('/auth/nonce'),
  useHeaders()
)

export const verifyIdentityToken: ApiRequest<{
  identityToken: string
} & withHeaders> = compose(
  usePostUrl('/auth/verify_identity_token'),
  useHeaders(),
  useBody(Encode.verifyIdentityToken)
)

export const getProfile: ApiRequest<withCredentials> = compose(
  useGetUrl('/my_profile'),
  useHeaders()
)
export const patchProfile: ApiRequest<Partial<IQUser> &
  withCredentials> = compose(
  usePatchUrl('/my_profile'),
  useCredentials(),
  useBody(o => Encode.patchProfile(o))
)

export const getUserList: ApiRequest<{
  page?: number
  limit?: number
  query?: string
} & withCredentials> = compose(
  useGetUrl('get_user_list'),
  useCredentials(),
  useParams(o => ({
    page: o.page,
    limit: o.limit,
    query: o.query,
  }))
)

export const blockUser: ApiRequest<{
  userId: IQUser['id']
} & withCredentials> = compose(
  usePostUrl('/block_user'),
  useCredentials(),
  useBody(o => ({
    user_email: o.userId,
  }))
)

export const unblockUser: ApiRequest<{
  userId: IQUser['id']
} & withCredentials> = compose(
  usePostUrl('/unblock_user'),
  useCredentials(),
  useBody(o => ({
    user_email: o.userId,
  }))
)

export const getBlockedUsers: ApiRequest<{
  page?: number
  limit?: number
} & withCredentials> = compose(
  useGetUrl('/get_blocked_users'),
  useCredentials(),
  useParams(o => ({
    page: String(o.page),
    limit: String(o.limit),
  }))
)

export const getTotalUnreadCount: ApiRequest<{} & withCredentials> = compose(
  useGetUrl('/total_unread_count'),
  useCredentials()
)

export const createRoom: ApiRequest<{
  name: string
  userIds: IQUser['id'][]
  avatarUrl?: IQChatRoom['avatarUrl']
  extras?: IQChatRoom['extras']
} & withCredentials> = compose(
  usePostUrl('/create_room'),
  useCredentials(),
  useBody(it => ({
    name: it.name,
    participants: it.userIds,
    avatar_url: it.avatarUrl,
    options: tryCatch(() => JSON.stringify(it.extras), ''),
  }))
)

export const getOrCreateRoomWithTarget: ApiRequest<{
  userIds: IQUser['id'][]
  extras?: IQChatRoom['extras']
} & withCredentials> = compose(
  usePostUrl('/get_or_create_room_with_target'),
  useCredentials(),
  useBody(o => ({
    emails: o.userIds,
    options: o.extras,
  }))
)

export const getOrCreateRoomWithUniqueId: ApiRequest<{
  uniqueId: string
  name?: string
  avatarUrl?: string
  options?: Record<string, any>
} & withCredentials> = compose(
  usePostUrl('/get_or_create_room_with_unique_id'),
  useCredentials(),
  useBody(o => ({
    unique_id: o.uniqueId,
  }))
)

export const getRoomById: ApiRequest<{
  id: IQChatRoom['id']
} & withCredentials> = compose(
  useGetUrl('/get_room_by_id'),
  useCredentials(),
  useParams(o => ({ id: o.id }))
)

export const updateRoom: ApiRequest<{
  id: IQChatRoom['id']
  name?: IQChatRoom['name']
  avatarUrl?: IQChatRoom['avatarUrl']
  extras?: IQChatRoom['extras']
} & withCredentials> = compose(
  usePostUrl('/update_room'),
  useCredentials(),
  useBody(o => ({
    id: String(o.id),
    room_name: o.name,
    avatar_url: o.avatarUrl,
    options: tryCatch(() => JSON.stringify(o.extras), null),
  }))
)

export const getUserRooms: ApiRequest<{
  page?: number
  limit?: number
  type?: IQChatRoom['type']
  showParticipants?: boolean
  showRemoved?: boolean
  showEmpty?: boolean
} & withCredentials> = compose(
  useGetUrl('/user_rooms'),
  useCredentials(),
  useParams(o => ({
    page: o.page,
    limit: o.limit,
    show_participants: o.showParticipants ?? false,
    show_removed: o.showRemoved ?? false,
    room_type: o.type ?? 'all',
    show_empty: o.showEmpty ?? false,
  }))
)

export const getRoomInfo: ApiRequest<{
  roomIds?: IQChatRoom['id'][]
  roomUniqueIds?: IQChatRoom['uniqueId'][]
  showParticipants?: boolean
  showRemoved?: boolean
  page?: number
} & withCredentials> = compose(
  usePostUrl('/rooms_info'),
  useCredentials(),
  useBody(o => ({
    room_id: o.roomIds?.map(it => it.toString()),
    room_unique_id: o.roomUniqueIds,
    show_participants: o.showParticipants,
    show_removed: o.showRemoved,
  }))
)

export const getRoomParticipants: ApiRequest<{
  uniqueId: IQChatRoom['uniqueId']
  page?: number
  limit?: number
  sorting?: 'asc' | 'desc'
} & withCredentials> = compose(
  useGetUrl('/room_participants'),
  useCredentials(),
  useParams(o => ({
    room_unique_id: o.uniqueId,
    sorting: o.sorting ?? 'asc',
  }))
)

export const addRoomParticipants: ApiRequest<{
  id: IQChatRoom['id']
  userIds: IQUser['id'][]
} & withCredentials> = compose(
  usePostUrl('/add_room_participants'),
  useCredentials(),
  useBody(o => ({
    room_id: o.id.toString(),
    emails: o.userIds,
  }))
)

export const removeRoomParticipants: ApiRequest<{
  id: IQChatRoom['id']
  userIds: IQUser['id'][]
} & withCredentials> = compose(
  usePostUrl('/remove_room_participants'),
  useCredentials(),
  useBody(o => ({
    room_id: o.id.toString(),
    emails: o.userIds,
  }))
)

export const postComment: ApiRequest<{
  roomId: IQChatRoom['id']
  text: IQMessage['text']
  uniqueId: IQMessage['uniqueId']
  type: IQMessage['type']
  payload?: IQMessage['payload']
  extras?: IQMessage['extras']
} & withCredentials> = compose(
  usePostUrl('/post_comment'),
  useCredentials(),
  useBody(o => ({
    topic_id: String(o.roomId),
    comment: o.text,
    unique_temp_id: o.uniqueId,
    type: o.type,
    payload: o.payload,
    extras: o.extras,
  }))
)
export const getComment: ApiRequest<{
  roomId: IQChatRoom['id']
  lastMessageId: IQMessage['id']
  after?: boolean
  limit?: number
} & withCredentials> = compose(
  useGetUrl('/load_comments'),
  useCredentials(),
  useParams(o => ({
    topic_id: o.roomId,
    last_comment_id: o.lastMessageId,
    after: o.after,
    limit: o.limit,
  }))
)
export const updateCommentStatus: ApiRequest<{
  roomId: IQChatRoom['id']
  lastReadId?: IQMessage['id']
  lastReceivedId?: IQMessage['id']
} & withCredentials> = compose(
  usePostUrl('/update_comment_status'),
  useCredentials(),
  useBody(o => ({
    room_id: o.roomId.toString(),
    last_comment_read_id: o.lastReadId?.toString(),
    last_comment_received_id: o.lastReceivedId?.toString(),
  }))
)
export const searchMessages: ApiRequest<{
  query: string
  roomId?: IQChatRoom['id']
  page?: number
} & withCredentials> = compose(
  usePostUrl('/search_messages'),
  useCredentials(),
  useBody(o => ({
    query: o.query,
    room_id: o.roomId,
    page: o.page,
  }))
)

export const deleteMessages: ApiRequest<{
  uniqueIds: IQMessage['uniqueId'][]
} & withCredentials> = compose(
  useDeleteUrl('/delete_messages'),
  useCredentials(),
  useParams(o => ({
    unique_ids: o.uniqueIds,
    is_delete_for_everyone: true,
    is_hard_delete: true,
  }))
)

export const clearRooms: ApiRequest<{
  uniqueIds: IQChatRoom['uniqueId'][]
} & withCredentials> = compose(
  useDeleteUrl('/clear_room_messages'),
  useCredentials(),
  useParams(o => ({
    room_channel_ids: o.uniqueIds,
  }))
)

export const setDeviceToken: ApiRequest<{
  deviceToken: string
  isDevelopment?: boolean
} & withCredentials> = compose(
  usePostUrl('/set_user_device_token'),
  useCredentials(),
  useBody(o => ({
    device_token: o.deviceToken,
    device_platform: 'rn',
    is_development: o.isDevelopment ?? false,
  }))
)
export const removeDeviceToken: ApiRequest<{
  deviceToken: string
  isDevelopment?: boolean
} & withCredentials> = compose(
  usePostUrl('/remove_user_device_token'),
  useCredentials(),
  useBody(o => ({
    device_token: o.deviceToken,
    device_platform: 'rn',
    is_development: o.isDevelopment ?? false,
  }))
)

export const synchronize: ApiRequest<{
  lastMessageId?: IQMessage['id']
  limit?: number
} & withCredentials> = compose(
  useGetUrl('/sync'),
  useCredentials(),
  useParams(o => ({
    last_received_comment_id: o.lastMessageId ?? 0,
    limit: o.limit,
  }))
)

export const synchronizeEvent: ApiRequest<{
  lastEventId?: string
} & withCredentials> = compose(
  useGetUrl('/sync_event'),
  useCredentials(),
  useParams(o => ({
    start_event_id: o.lastEventId ?? 0,
  }))
)
