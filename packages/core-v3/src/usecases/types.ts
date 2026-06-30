import { storageFactory } from '../storage'
import { makeApiRequest } from '../api'
import { hookAdapterFactory } from '../hook'
import getUserAdapter from '../adapters/user'
import getRealtimeAdapter from '../adapters/realtime'
import { getLogger } from '../adapters/logger'
import { getRoomAdapter } from '../adapters/room'
import { getMessageAdapter } from '../adapters/message'

export interface QiscusDeps {
  storage: ReturnType<typeof storageFactory>
  apiAdapter: ReturnType<typeof makeApiRequest>
  hookAdapter: ReturnType<typeof hookAdapterFactory>
  userAdapter: ReturnType<typeof getUserAdapter>
  realtimeAdapter: ReturnType<typeof getRealtimeAdapter>
  loggerAdapter: ReturnType<typeof getLogger>
  roomAdapter: ReturnType<typeof getRoomAdapter>
  messageAdapter: ReturnType<typeof getMessageAdapter>
}
