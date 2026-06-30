import { nanoid } from 'nanoid/non-secure'
import { IQMessageStatus, IQMessageType } from '../defs'
import * as model from '../model'
import { QiscusDeps } from './types'

export function generateUniqueId(): string {
  return `javascript-${nanoid()}`
}

export function generateMessage(
  deps: QiscusDeps,
  {
    roomId,
    text,
    extras,
  }: {
    roomId: number
    text: string
    extras?: Record<string, any>
  }
): model.IQMessage {
  const id = Math.ceil(Math.random() * 1e4)
  return {
    chatRoomId: roomId,
    text: text,
    extras: extras,
    timestamp: new Date(),
    uniqueId: generateUniqueId(),
    //
    id: id,
    payload: undefined,
    previousMessageId: 0,
    sender: deps.storage.getCurrentUser(),
    status: IQMessageStatus.Sending,
    type: IQMessageType.Text,
  }
}

export function generateFileAttachmentMessage(
  deps: QiscusDeps,
  {
    roomId,
    caption,
    url,
    text = 'File attachment',
    extras,
    filename,
    size,
  }: {
    roomId: number
    caption: string
    url: string
    text: string
    extras?: Record<string, unknown>
    filename?: string
    size?: number
  }
): model.IQMessage {
  const id = Math.ceil(Math.random() * 1e4)
  return {
    chatRoomId: roomId,
    text: text,
    extras: extras,
    timestamp: new Date(),
    uniqueId: generateUniqueId(),
    //
    id: id,
    payload: {
      url,
      file_name: filename,
      size,
      caption,
    },
    previousMessageId: 0,
    sender: deps.storage.getCurrentUser(),
    status: IQMessageStatus.Sending,
    type: IQMessageType.Attachment,
  }
}

export function generateCustomMessage(
  deps: QiscusDeps,
  {
    roomId,
    text,
    type,
    payload,
    extras,
  }: {
    roomId: number
    text: string
    type: string
    extras?: Record<string, unknown>
    payload?: Record<string, any>
  }
): model.IQMessage {
  const id = Math.ceil(Math.random() * 1e4)
  return {
    chatRoomId: roomId,
    text: text,
    extras: extras,
    timestamp: new Date(),
    uniqueId: generateUniqueId(),
    //
    id: id,
    payload: {
      type,
      payload,
    },
    previousMessageId: 0,
    sender: deps.storage.getCurrentUser(),
    status: IQMessageStatus.Sending,
    type: IQMessageType.Custom,
  }
}

export function generateReplyMessage(
  deps: QiscusDeps,
  {
    roomId,
    text,
    repliedMessage,
    extras,
  }: {
    roomId: number
    text: string
    repliedMessage: model.IQMessage
    extras?: Record<string, unknown>
  }
): model.IQMessage {
  const id = Math.ceil(Math.random() * 1e4)
  return {
    chatRoomId: roomId,
    text: text,
    extras: extras,
    timestamp: new Date(),
    uniqueId: generateUniqueId(),
    //
    id: id,
    payload: {
      type: 'reply',
      replied_comment_id: repliedMessage.id,
    },
    previousMessageId: 0,
    sender: deps.storage.getCurrentUser(),
    status: IQMessageStatus.Sending,
    type: IQMessageType.Reply,
  }
}
