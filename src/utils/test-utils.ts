import { GetCommentsResponse } from 'src/adapters/message'
import { storageFactory } from 'src/storage'

export function getMockedStorage() {
  let s = storageFactory()
  s.setAppId('sdksample')
  s.setToken('some-token')
  s.setCurrentUser({
    id: 'user-id',
    lastMessageId: 1,
    lastSyncEventId: '1',
    name: 'user-name',
    avatarUrl: 'avatar-url',
    extras: {},
  })
  s.setVersion('1.0.0-mock')

  return s
}

export const createMessagesResponse = (): GetCommentsResponse.RootObject => ({
  status: 1,
  results: {
    comments: [
      {
        comment_before_id: 1,
        comment_before_id_str: '1',
        disable_link_preview: true,
        email: 'asd',
        extras: {},
        id: 1,
        id_str: '1',
        is_deleted: false,
        is_public_channel: true,
        message: 'qwe',
        payload: null,
        room_avatar: 'http:/asdlkj.com',
        room_id: 1,
        room_id_str: '1',
        room_name: 'qwe',
        room_type: 'qwe',
        status: 'read',
        timestamp: new Date().toISOString(),
        topic_id: 1,
        topic_id_str: '1',
        type: 'text',
        unique_temp_id: 'qwerty',
        unix_nano_timestamp: Date.now(),
        unix_timestamp: Date.now(),
        user_avatar: {
          avatar: { url: 'asd' },
        },
        user_avatar_url: 'asd',
        user_id: 1,
        user_id_str: '1',
        username: 'qwe',
      },
    ],
  },
})
