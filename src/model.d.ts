export interface IQUser {
  id: string
  name: string
  avatarUrl?: string
  extras?: Record<string, unknown>
}
export interface IQAccount extends IQUser {
  lastMessageId: number
  lastSyncEventId: string
}
export interface IQParticipant extends IQUser {
  lastMessageReadId: number
  lastMessageReceivedId: number
}

export interface IQMessage {
  id: number
  uniqueId: string
  previousMessageId: IQMessage['id']
  text: string
  status: 'sending' | 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
  timestamp: Date
  type: 'text' | 'file_attachment' | 'reply' | 'custom'
  sender: IQUser
  chatRoomId: IQChatRoom['id']
  extras?: Record<string, unknown>
  payload?: Record<string, unknown>
}
export interface IQChatRoom {
  id: number
  uniqueId: string
  name: string
  type: 'single' | 'group' | 'channel'
  participants: IQParticipant[]
  totalParticipants: number
  unreadCount: number
  lastMessage?: IQMessage
  extras?: Record<string, unknown>
  avatarUrl?: string
}
