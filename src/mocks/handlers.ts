import { rest } from 'msw'
import type { RestHandler } from 'msw'
import * as r from '../utils/test-utils'

const baseUrl = 'https://api.qiscus.com/api/v2/sdk'
const api = (path: string) => `${baseUrl}${path}`

export const handlers: RestHandler[] = [
  rest.get(api('/load_comments'), (_, res, ctx) => {
    return res(ctx.status(200), ctx.json(r.createMessagesResponse()))
  }),
  rest.post(api('/comments'), (_, res, ctx) => {
    return res(ctx.status(200), ctx.json(r.createMessagesResponse()))
  }),
]
