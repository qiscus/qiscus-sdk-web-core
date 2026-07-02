import * as model from '../v3/model'
import * as Api from '../api'
import * as Decoder from '../v3/decoder'
import { Storage } from '../storage'
import { getRoomAdapterRaw } from './room.raw'

export const getRoomAdapter = (s: Storage, api: Api.ApiRequester) => {
  const raw = getRoomAdapterRaw(s, api)

  return {
    async addParticipants(roomId: number, participantIds: string[]): Promise<model.IQParticipant[]> {
      const resp = await raw.addParticipants(roomId, participantIds)
      return resp.results.participants_added.map(Decoder.participant)
    },
    async removeParticipants(
      id: model.IQChatRoom['id'],
      participantIds: model.IQParticipant['id'][]
    ): Promise<model.IQParticipant[]> {
      const resp = await raw.removeParticipants(id, participantIds)
      return resp.results.participants_removed.map((email) =>
        Decoder.participant({
          email,
        } as any)
      )
    },
    async chatUser(userId: model.IQUser['id'], extras?: model.IQChatRoom['extras']): Promise<model.IQChatRoom> {
      const resp = await raw.chatUser(userId, extras)
      return Decoder.room({
        ...resp.results.room,
        is_removed: false,
        last_comment: resp.results.comments.find((it) => it.id === resp.results.room.last_comment_id),
      })
    },
    async clearRoom(uniqueIds: string[]): Promise<void> {
      await raw.clearRoom(uniqueIds)
      return undefined as void
    },
    async createGroup(
      name: model.IQChatRoom['name'],
      userIds: model.IQUser['id'][],
      avatarUrl?: model.IQChatRoom['avatarUrl'],
      extras?: model.IQChatRoom['extras']
    ): Promise<model.IQChatRoom> {
      const resp = await raw.createGroup(name, userIds, avatarUrl, extras)
      return Decoder.room({
        ...resp.results.room,
        is_removed: false,
        last_comment: resp.results.comments.pop(),
      })
    },
    async getChannel(
      uniqueId: model.IQChatRoom['uniqueId'],
      name?: model.IQChatRoom['name'],
      avatarUrl?: model.IQChatRoom['avatarUrl'],
      extras?: model.IQChatRoom['extras']
    ): Promise<model.IQChatRoom> {
      const resp = await raw.getChannel(uniqueId, name, avatarUrl, extras)
      return Decoder.room({
        ...resp.results.room,
        is_removed: false,
        last_comment: resp.results.comments.find((it) => it.id === resp.results.room.last_comment_id),
      })
    },
    async getParticipantList(
      uniqueId: string,
      page?: number,
      limit?: number,
      sorting?: 'asc' | 'desc'
    ): Promise<model.IQParticipant[]> {
      const resp = await raw.getParticipantList(uniqueId, page, limit, sorting)
      return resp.results.participants.map(Decoder.participant)
    },
    async getRoom(roomId: number): Promise<[model.IQChatRoom, model.IQMessage[]]> {
      const resp = await raw.getRoom(roomId)
      const room = Decoder.room({ ...resp.results.room, is_removed: false, last_comment: resp.results.comments.pop() })
      const comments = resp.results.comments.map((c) => Decoder.message(c))

      return [room, comments]
    },
    async getRoomInfo(
      roomIds?: number[],
      roomUniqueIds?: string[],
      page?: number,
      showRemoved: boolean = false,
      showParticipants: boolean = false
    ): Promise<model.IQChatRoom[]> {
      const resp = await raw.getRoomInfo(roomIds, roomUniqueIds, page, showRemoved, showParticipants)
      return resp.results.rooms_info.map(Decoder.room)
    },
    async getRoomList(
      showParticipants?: boolean,
      showRemoved?: boolean,
      showEmpty?: boolean,
      page?: number,
      limit?: number
    ): Promise<model.IQChatRoom[]> {
      const res = await raw.getRoomList(showParticipants, showRemoved, showEmpty, page, limit)
      return res.results.rooms_info.map<model.IQChatRoom>((it: any) => Decoder.room(it))
    },
    async getUnreadCount(): Promise<number> {
      const resp = await raw.getUnreadCount()
      return resp.results.total_unread_count
    },
    async getRoomUnreadCount(): Promise<number> {
      const resp = await raw.getRoomUnreadCount()
      return resp.results.total_unread_count
    },
    async updateRoom(
      roomId: model.IQChatRoom['id'],
      name?: model.IQChatRoom['name'],
      avatarUrl?: model.IQChatRoom['avatarUrl'],
      extras?: model.IQChatRoom['extras']
    ): Promise<model.IQChatRoom> {
      const resp = await raw.updateRoom(roomId, name, avatarUrl, extras)
      return Decoder.room(resp.results.room as any)
    },
  }
}

export default getRoomAdapter

export type RoomAdapter = ReturnType<typeof getRoomAdapter>
