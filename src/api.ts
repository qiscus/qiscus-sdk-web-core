import { IQUser, IQChatRoom } from 'model'
import * as Encode from 'encoder'

interface Request<O> {
  (o: O): Api
}
export type Api = {
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

type FnUrl = (url: string) => () => { method: Api['method']; url: Api['url'] }
const useGetUrl: FnUrl = (url: string) => () => ({ method: 'get', url })
const usePostUrl: FnUrl = (url: string) => () => ({ method: 'post', url })
const usePutUrl: FnUrl = (url: string) => () => ({ method: 'put', url })
const usePatchUrl: FnUrl = (url: string) => () => ({ method: 'patch', url })
const useDeleteUrl: FnUrl = (url: string) => () => ({ method: 'delete', url })

type Json = Record<string, unknown>
type BodyMapperFn<O> = (o: O) => Json
const useBody = <O extends Json>(mapper: BodyMapperFn<O>) => (o: O) => ({
  body: mapper(o),
})

const parseApi = (o: Record<string, any>): Api => ({
  method: o.method,
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
const compose = <O extends Record<string, unknown>>(...fns: Fn<O>[]) => (
  o: O
): Api => parseApi(fns.reduce((acc, fn) => ({ ...acc, ...fn(acc) }), o))

export type loginOrRegisterParams = {
  userId: string
  userKey: string
  username?: string
  avatarUrl?: string
  deviceToken?: string
  extras?: Record<string, unknown>
}
export const loginOrRegister: Request<
  loginOrRegisterParams & withHeaders
> = compose(
  usePostUrl('/login_or_register'),
  useHeaders,
  useBody(Encode.loginOrRegister)
)

export const getNonce: Request<withHeaders> = compose(
  usePostUrl('/auth/nonce'),
  useHeaders
)

export const verifyIdentityToken: Request<
  { identityToken: string } & withHeaders
> = compose(
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

export const getUserList: Request<
  { page?: number; limit?: number; query?: string } & withCredentials
> = compose(
  useGetUrl('get_user_list'),
  useCredentials,
  useBody(o => ({
    page: o.page,
    limit: o.limit,
    query: o.query,
  }))
)

export const blockUser: Request<
  {
    userId: IQUser['id']
  } & withCredentials
> = compose(
  usePostUrl('/block_user'),
  useCredentials,
  useBody(o => ({
    user_email: o.userId,
  }))
)

export const unblockUser = (
  o: { userId: IQUser['id'] } & withCredentials
): Api => ({
  method: 'post',
  url: '/unblock_user',
  headers: o.headers,
  body: { user_email: o.userId },
})

export const getBlockedUsers = (
  o: {
    page?: number
    limit?: number
  } & withCredentials
): Api => ({
  method: 'get',
  url: '/get_blocked_users',
  params: { page: String(o.page), limit: String(o.limit) },
  headers: o.headers,
})

export const getTotalUnreadCount: Request<{} & withCredentials> = compose(
  useGetUrl('/total_unread_count'),
  useCredentials
)

export const createRoom: Request<
  { name: string; userIds: IQUser['id'][] } & withCredentials
> = compose(
  usePostUrl('/create_room'),
  useCredentials,
  useBody(it => ({
    name: it.name,
    participants: it.userIds,
  }))
)

export const getOrCreateRoomWithTarget: Request<
  { userIds: IQUser['id'][] } & withCredentials
> = compose(
  usePostUrl('/get_or_create_room_with_target'),
  useCredentials,
  useBody(o => ({
    emails: o.userIds,
  }))
)

export const getOrCreateRoomWithUniqueId: Request<
  { uniqueId: string } & withCredentials
> = compose(
  usePostUrl('/get_or_create_room_with_unique_id'),
  useCredentials,
  useBody(o => ({
    unique_id: o.uniqueId,
  }))
)

export const getRoomById: Request<
  { id: IQChatRoom['id'] } & withCredentials
> = compose(
  useGetUrl('/get_room_by_id'),
  useCredentials,
  useParams(o => ({ id: o.id }))
)
