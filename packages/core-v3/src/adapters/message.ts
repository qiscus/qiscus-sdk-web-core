// @ts-ignore
import { Storage } from '../storage'
import * as Api from '../api'
import * as Decoder from '../v3/decoder'
import * as model from '../v3/model'
import { getMessageAdapterRaw } from './message.raw'

export const getMessageAdapter = (s: Storage, api: Api.ApiRequester) => {
  const raw = getMessageAdapterRaw(s, api)

  return {
    sendMessage(roomId: number, message: model.IQMessage): Promise<model.IQMessage> {
      return raw.sendMessage(roomId, message).then((resp) => Decoder.message(resp.results.comment))
    },
    getMessages(
      roomId: number,
      lastMessageId: number = 0,
      limit: number = 20,
      after: boolean = false
    ): Promise<model.IQMessage[]> {
      return raw
        .getMessages(roomId, lastMessageId, limit, after)
        .then((resp) =>
          resp.results.comments.map(Decoder.message).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
        )
    },
    deleteMessage(uniqueIds: string[]): Promise<model.IQMessage[]> {
      return raw.deleteMessage(uniqueIds).then((resp) => resp.results.comments.map(Decoder.message))
    },
    markAsRead(roomId: number, messageId: number): Promise<void> {
      return raw.markAsRead(roomId, messageId).then(() => undefined)
    },
    markAsDelivered(roomId: number, messageId: number): Promise<void> {
      return raw.markAsDelivered(roomId, messageId).then(() => undefined)
    },
    async searchMessages(args: {
      query: string
      roomIds: number[]
      userId?: string
      type?: string
      roomType?: string
      page?: number
      limit?: number
    }): Promise<model.IQMessage[]> {
      const messages = await raw
        .searchMessages(args)
        .then((r) => r.results.comments)
        .then((comments) => comments.map((it) => Decoder.message(it as any)))

      return messages
    },
    async getFileList(args: {
      roomIds?: number[]
      fileType?: string
      page?: number
      limit?: number
      userId?: string
      includeExtensions?: string[]
      excludeExtensions?: string[]
    }): Promise<model.IQMessage[]> {
      const messages = raw
        .getFileList(args)
        .then((r) => r.results.comments)
        .then((r) => r.map((it) => Decoder.message(it as any)))

      return messages
    },
    async updateMessage(message: model.IQMessage): Promise<model.IQMessage> {
      return raw
        .updateMessage(message)
        .then((r) => r.results.comment)
        .then((r) => Decoder.message(r))
    },
  }
}
export default getMessageAdapter
export type MessageAdapter = ReturnType<typeof getMessageAdapter>
