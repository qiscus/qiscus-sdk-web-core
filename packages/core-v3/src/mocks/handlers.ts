import { rest } from 'msw'
import type { RestHandler } from 'msw'
import * as r from '../utils/test-utils'

const baseUrl = 'https://api.qiscus.com/api/v2/sdk'
const api = (path: string) => `${baseUrl}${path}`

const get = (path: string, resp: Record<string, any>) =>
  rest.get(api(path), (_, res, ctx) => {
    return res(ctx.status(200), ctx.json(resp))
  })
const post = (path: string, resp: Record<string, any>) =>
  rest.post(api(path), (_, res, ctx) => {
    return res(ctx.status(200), ctx.json(resp))
  })
const del = (path: string, resp: Record<string, any>) =>
  rest.delete(api(path), (_, res, ctx) => {
    return res(ctx.status(200), ctx.json(resp))
  })

export const handlers: RestHandler[] = [
  get('/load_comments', r.createMessagesResponse()),
  post('/comments', r.createMessagesResponse()),
  post('/get_or_create_room_with_target', r.createRoomResponse()),
  post('/add_room_participants', r.createAddParticipantsResponse()),
  post('/remove_room_participants', r.createRemoveParticipantsResponse()),
  post('/create_room', r.createGroupResponse()),
  del('/clear_room_messages', r.createClearRoomResponse()),
  post('/get_or_create_room_with_unique_id', r.createGetChannelResponse()),
  get('/room_participants', r.createListParticipantsResponse()),
  get('/get_room_by_id', r.createGetRoomResponse()),
  post('/rooms_info', r.createRoomInfoResponse()),
  get('/user_rooms', r.createUserRoomsResponse()),
  get('/total_unread_count', r.createUnreadCountResponse()),
]
