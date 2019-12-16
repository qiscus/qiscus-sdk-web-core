import axios from 'axios'
import { IQUser, IQChatRoom, IQMessage } from './model'
import * as Encode from './encoder'
import { tryCatch } from './utils/try-catch'

export const request = async <Resp extends unknown> (api: Api): Promise<Resp> => {
  console.log('before-request api', api)
  const resp = await axios({
    method: api.method,
    baseURL: api.baseUrl,
    url: api.url,
    headers: api.headers,
    data: api.body,
    params: api.params,
  })
  return resp.data
}

interface Request<O> {
  (o: O): Api
}

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

type FnHeaders<O> = (o: O) => O
const useCredentials: FnHeaders<withCredentials> = o => ({
  headers: o.headers,
})
const useHeaders: FnHeaders<withHeaders> = o => ({
  headers: o.headers,
})

type FnParams = <O extends Json>(
  fn: (o: O) => Json
) => (o: O) => { params: Json }
const useParams: FnParams = fn => o => ({ params: fn(o) })

type FnUrl = <O extends Api>(url: string) => (o?: O) => { method: Api['method']; url: Api['url']; baseUrl: Api['baseUrl'] }
const useGetUrl: FnUrl = <O extends Api>(url: string) => (o: O) => ({ method: 'get', url, baseUrl: o.baseUrl })
const usePostUrl: FnUrl = <O extends Api>(url: string) => (o: O) => ({ method: 'post', url, baseUrl: o.baseUrl })
const usePutUrl: FnUrl = <O extends Api>(url: string) => (o: O) => ({ method: 'put', url, baseUrl: o.baseUrl })
const usePatchUrl: FnUrl = <O extends Api>(url: string) => (o: O) => ({ method: 'patch', url, baseUrl: o.baseUrl })
const useDeleteUrl: FnUrl = <O extends Api>(url: string) => (o: O) => ({ method: 'delete', url, baseUrl: o.baseUrl })

type Json = Record<string, unknown>
type BodyMapperFn<O> = (o: O) => Json
const useBody = <O extends Json> (mapper: BodyMapperFn<O>) => (o: O) => ({
  body: mapper(o),
})

const parseApi = (o: Record<string, any>): Api => ({
  method: o.method,
  baseUrl: o.baseUrl,
  url: o.url,
  headers: o.headers,
  params: o.params,
  body: o.body,
})
type Fn<O> =
  | FnHeaders<O>
  | ReturnType<typeof useBody>
  | ReturnType<FnUrl>
  | ReturnType<FnParams>
const compose = <O extends Record<string, unknown>> (...fns: Fn<O>[]) => (
  o: O
): Api => parseApi(fns.reduce((acc, fn) => ({ ...acc, ...fn(acc as any) }), o))

export type loginOrRegisterParams = {
  userId: string
  userKey: string
  username?: string
  avatarUrl?: string
  deviceToken?: string
  extras?: Record<string, unknown>
}
export const loginOrRegister: Request<loginOrRegisterParams & withHeaders> = compose(
  usePostUrl('/login_or_register'),
  useHeaders,
  useBody(Encode.loginOrRegister)
)

export const getNonce: Request<withHeaders> = compose(
  usePostUrl('/auth/nonce'),
  useHeaders
)

export const verifyIdentityToken: Request<{ identityToken: string } & withHeaders> = compose(
  usePostUrl('/auth/verify_identity_token'),
  useHeaders,
  useBody(Encode.verifyIdentityToken)
)

export const getProfile: Request<withCredentials> = compose(
  useGetUrl('/my_profile'),
  useHeaders
)
export const patchProfile: Request<IQUser & withCredentials> = compose(
  usePatchUrl('/my_profile'),
  useCredentials,
  useBody((o: any) => Encode.patchProfile(o))
)

export const getUserList: Request<{ page?: number; limit?: number; query?: string } & withCredentials> = compose(
  useGetUrl('get_user_list'),
  useCredentials,
  useParams(o => ({
    page: o.page,
    limit: o.limit,
    query: o.query,
  }))
)

export const blockUser: Request<{
  userId: IQUser['id']
} & withCredentials> = compose(
  usePostUrl('/block_user'),
  useCredentials,
  useBody(o => ({
    user_email: o.userId,
  }))
)

export const unblockUser: Request<{
  userId: IQUser['id']
} & withCredentials> = compose(
  usePostUrl('/unblock_user'),
  useCredentials,
  useBody((o) => ({
    user_email: o.userId
  }))
)

export const getBlockedUsers: Request<{
  page?: number,
  limit?: number
} & withCredentials> = compose(
  useGetUrl('/get_blocked_users'),
  useCredentials,
  useParams((o) => ({
    page: String(o.page),
    limit: String(o.limit)
  }))
)

export const getTotalUnreadCount: Request<{} & withCredentials> = compose(
  useGetUrl('/total_unread_count'),
  useCredentials
)

export const createRoom: Request<{
  name: string
  userIds: IQUser['id'][]
  avatarUrl?: IQChatRoom['avatarUrl']
  extras?: IQChatRoom['extras']
} & withCredentials> = compose(
  usePostUrl('/create_room'),
  useCredentials,
  useBody(it => ({
    name: it.name,
    participants: it.userIds,
    avatar_url: it.avatarUrl,
    options: tryCatch(() => JSON.stringify(it.extras), it.extras),
  }))
)

export const getOrCreateRoomWithTarget: Request<{
  userIds: IQUser['id'][]
  extras?: IQChatRoom['extras']
} & withCredentials> = compose(
  usePostUrl('/get_or_create_room_with_target'),
  useCredentials,
  useBody(o => ({
    emails: o.userIds,
    options: o.extras,
  }))
)

export const getOrCreateRoomWithUniqueId: Request<{
  uniqueId: string
  name?: string
  avatarUrl?: string
  options?: Record<string, any>
} & withCredentials> = compose(
  usePostUrl('/get_or_create_room_with_unique_id'),
  useCredentials,
  useBody(o => ({
    unique_id: o.uniqueId,
  }))
)

export const getRoomById: Request<{ id: IQChatRoom['id'] } & withCredentials> = compose(
  useGetUrl('/get_room_by_id'),
  useCredentials,
  useParams(o => ({ id: o.id }))
)

export const updateRoom: Request<{
  id: IQChatRoom['id'],
  name?: IQChatRoom['name'],
  avatarUrl?: IQChatRoom['avatarUrl'],
  extras?: IQChatRoom['extras']
} & withCredentials> = compose(
  usePostUrl('/update_room'),
  useCredentials,
  useBody(o => ({
    id: String(o.id),
    room_name: o.name,
    avatar_url: o.avatarUrl,
    options: o.extras
  }))
)

export const getUserRooms: Request<{
  page?: number,
  limit?: number,
  type?: IQChatRoom['type'],
  showParticipants?: boolean,
  showRemoved?: boolean,
  showEmpty?: boolean,
} & withCredentials> = compose(
  useGetUrl('/user_rooms'),
  useCredentials,
  useParams(o => ({
    page: o.page,
    limit: o.limit,
    show_participants: o.showParticipants ?? false,
    show_removed: o.showRemoved ?? false,
    room_type: o.type ?? 'all',
    show_empty: o.show_empty ?? false,
  }))
)

export const getRoomInfo: Request<{
  roomIds?: IQChatRoom['id'][],
  roomUniqueIds?: IQChatRoom['uniqueId'][],
  showParticipants?: boolean,
  showRemoved?: boolean
} & withCredentials> = compose(
  usePostUrl('/rooms_info'),
  useCredentials,
  useBody(o => ({
    room_id: o.roomIds,
    room_unique_id: o.roomUniqueIds,
    show_participants: o.showParticipants,
    show_removed: o.showRemoved,
  }))
)

export const getRoomParticipants: Request<{
  uniqueId: IQChatRoom['uniqueId'],
  page?: number,
  limit?: number,
  sorting?: 'asc' | 'desc'
} & withCredentials> = compose(
  useGetUrl('/room_participants'),
  useCredentials,
  useParams(o => ({
    room_unique_id: o.uniqueId,
    offset: o.offset ?? 0,
    sorting: o.sorting ?? 'asc'
  }))
)

export const addRoomParticipants: Request<{
  id: IQChatRoom['id'],
  userIds: IQUser['id'][],
} & withCredentials> = compose(
  usePostUrl('/add_room_participants'),
  useCredentials,
  useBody(o => ({
    room_id: o.id,
    emails: o.userIds,
  }))
)

export const removeRoomParticipants: Request<{
  id: IQChatRoom['id'],
  userIds: IQUser['id'][],
} & withCredentials> = compose(
  usePostUrl('/remove_room_participants'),
  useCredentials,
  useBody(o => ({
    room_id: o.id,
    emails: o.userIds,
  }))
)

export const postComment: Request<{
  roomId: IQChatRoom['id'],
  text: IQMessage['text'],
  uniqueId: IQMessage['uniqueId'],
  type: IQMessage['type'],
  payload?: IQMessage['payload'],
  extras?: IQMessage['extras'],
} & withCredentials> = compose(
  usePostUrl('/post_comment'),
  useCredentials,
  useBody(o => ({
    topic_id: String(o.roomId),
    comment: o.text,
    unique_temp_id: o.uniqueId,
    type: o.type,
    payload: o.payload,
    extras: o.extras,
  }))
)
export const getComment: Request<{
  roomId: IQChatRoom['id'],
  lastMessageId: IQMessage['id'],
  after?: boolean,
  limit?: number,
} & withCredentials> = compose(
  useGetUrl('/load_comments'),
  useCredentials,
  useParams(o => ({
    topic_id: o.roomId,
    last_comment_id: o.lastMessageId,
    after: o.after,
    limit: o.limit,
  }))
)
export const updateCommentStatus: Request<{
  roomId: IQChatRoom['id'],
  lastReadId: IQMessage['id'],
  lastReceivedId: IQMessage['id'],
} & withCredentials> = compose(
  usePostUrl('/update_comment_status'),
  useCredentials,
  useBody(o => ({
    room_id: o.roomId,
    last_comment_read_id: o.lastReadId,
    last_comment_received_id: o.lastReceivedId,
  }))
)
export const searchMessages: Request<{
  query: string,
  roomId?: IQChatRoom['id'],
  page?: number,
} & withCredentials> = compose(
  usePostUrl('/search_messages'),
  useCredentials,
  useBody(o => ({
    query: o.query,
    room_id: o.roomId,
    page: o.page,
  }))
)

export const deleteMessages: Request<{
  uniqueIds: IQMessage['uniqueId'][],
} & withCredentials> = compose(
  useDeleteUrl('/delete_messages'),
  useCredentials,
  useParams(o => ({
    unique_ids: o.uniqueIds,
  }))
)

export const clearRooms: Request<{
  uniqueIds: IQChatRoom['uniqueId'][]
} & withCredentials> = compose(
  useDeleteUrl('/clear_room_messages'),
  useCredentials,
  useParams(o => ({
    room_channel_ids: o.uniqueIds,
  }))
)

export const setDeviceToken: Request<{
  deviceToken: string,
  isDevelopment?: boolean,
} & withCredentials> = compose(
  usePostUrl('/set_user_device_token'),
  useCredentials,
  useBody(o => ({
    device_token: o.deviceToken,
    device_platform: 'rn',
    is_development: o.isDevelopment ?? false
  }))
)
export const removeDeviceToken: Request<{
  deviceToken: string,
  isDevelopment?: boolean,
} & withCredentials> = compose(
  usePostUrl('/remove_user_device_token'),
  useCredentials,
  useBody(o => ({
    device_token: o.deviceToken,
    device_platform: 'rn',
    is_development: o.isDevelopment ?? false
  }))
)

export const synchronize: Request<{
  lastMessageId?: IQMessage['id'],
  limit?: number,
} & withCredentials> = compose(
  useGetUrl('/sync'),
  useCredentials,
  useParams(o => ({
    last_received_comment_id: o.lastMessageId ?? 0,
    limit: o.limit,
  }))
)

export const synchronizeEvent: Request<{
  lastEventId?: string,
} & withCredentials> = compose(
  useGetUrl('/sync_event'),
  useCredentials,
  useParams(o => ({
    start_event_id: o.lastEventId ?? 0,
  }))
)
