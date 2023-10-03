import { EventEmitter } from 'pietile-eventemitter'
import xs from 'xstream'
import * as Api from '../api'
import * as Decoder from '../decoder'
import * as m from '../model'
import * as Provider from '../provider'
import type { Storage } from '../storage'
import { IntervalProducer, tap } from '../utils/stream'

interface SynchronizeData {
  'last-message-id.new': (messageId: m.IQAccount['lastMessageId']) => void
  'message.new': (message: m.IQMessage) => void
  synchronized: () => void
}

export function synchronizeFactory(
  getInterval: () => number,
  getEnableSync: () => boolean,
  getId: () => m.IQAccount['lastMessageId'],
  // @ts-ignore
  logger: (...arg: string[]) => void,
  s: Storage,
  api: Api.ApiRequester
) {
  const emitter = new EventEmitter<SynchronizeData>()
  const synchronize = (
    messageId: m.IQAccount['lastMessageId']
  ): Promise<{
    lastMessageId: m.IQAccount['lastMessageId']
    messages: m.IQMessage[]
    interval: number
  }> => {
    return api
      .request<SyncResponse.RootObject>(
        Api.synchronize({
          ...Provider.withBaseUrl(s),
          ...Provider.withCredentials(s),
          lastMessageId: messageId,
          limit: 20,
        })
      )
      .then((resp) => {
        const messages = resp.results.comments.map((it) =>
          Decoder.message({
            ...it,
            room_type: it.chat_type,
          })
        )
        const lastMessageId = resp.results.meta.last_received_comment_id ?? 0
        logger(`lastMessageId:${JSON.stringify(resp.results.meta, null, 2)}`)
        return { lastMessageId, messages, interval: getInterval() }
      })
  }

  async function processResult(result: ReturnType<typeof synchronize>) {
    let res = await result
    const messageId = res.lastMessageId
    const messages = res.messages
    if (messageId > 0) {
      emitter.emit('last-message-id.new', messageId)
    }
    messages
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      .forEach((m) => {
        emitter.emit('message.new', m)
      })

    return result
  }

  return {
    get synchronize(): typeof synchronize {
      return (eventId) => processResult(synchronize(eventId))
    },
    get on() {
      return emitter.on.bind(emitter)
    },
    get off() {
      return emitter.off.bind(emitter)
    },
    stream() {
      return xs
        .create(new IntervalProducer(s.getAccSyncInterval, getInterval))
        .map((_) => getId())
        .filter((_) => getEnableSync())
        .map((id) => xs.fromPromise(synchronize(id)))
        .flatten()
        .compose(tap((_) => emitter.emit('synchronized')))
        .compose(tap((v) => logger(`synchronize returned id: ${v.lastMessageId}`)))
        .map((v) => xs.fromPromise(processResult(Promise.resolve(v))))
        .flatten()
    },
  }
}

export declare module SyncResponse {
  export interface Extras {}

  export interface Payload {}

  export interface Avatar {
    url: string
  }

  export interface UserAvatar {
    avatar: Avatar
  }

  export interface Comment {
    chat_type: string
    comment_before_id: number
    comment_before_id_str: string
    disable_link_preview: boolean
    email: string
    extras: Extras
    id: number
    id_str: string
    is_deleted: boolean
    is_public_channel: boolean
    message: string
    payload: Payload
    room_avatar: string
    room_id: number
    room_id_str: string
    room_name: string
    status: string
    timestamp: string
    topic_id: number
    topic_id_str: string
    type: string
    unique_temp_id: string
    unix_nano_timestamp: number
    unix_timestamp: number
    user_avatar: UserAvatar
    user_avatar_url: string
    user_id: number
    user_id_str: string
    username: string
  }

  export interface Meta {
    last_received_comment_id: number
    need_clear: boolean
  }

  export interface Results {
    comments: Comment[]
    meta: Meta
  }

  export interface RootObject {
    results: Results
    status: number
  }
}
