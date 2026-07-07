import mitt from 'mitt'
import { classifySyncEvents } from '@qiscus/core-v3'
import UrlBuilder from '../url-builder'

const noop = () => {}
const sleep = (time) => new Promise((res) => setTimeout(res, time))

function synchronizeFactory(getHttp, getInterval, getSync, getId, logger) {
  const emitter = mitt()
  const synchronize = (messageId) => {
    const url = UrlBuilder('api/v2/sdk/sync')
      .param('last_received_comment_id', messageId)
      .build()

    return getHttp()
      .get(url)
      .then((resp) => {
        const results = resp.body.results
        const messages = results.comments
        const lastMessageId = results.meta.last_received_comment_id
        messages.sort((a, b) => a.id - b.id)
        return Promise.resolve({
          lastMessageId,
          messages,
          interval: getInterval(),
        })
      })
      .catch(noop)
  }
  async function* generator() {
    let accumulatedInterval = 0
    const interval = 100
    const shouldSync = () => getHttp() != null && getSync()

    while (true) {
      accumulatedInterval += interval
      if (accumulatedInterval >= getInterval() && shouldSync()) {
        accumulatedInterval = 0
        yield synchronize(getId())
      }
      await sleep(interval)
    }
  }

  return {
    get synchronize() {
      return synchronize
    },
    get on() {
      return emitter.on
    },
    get off() {
      return emitter.off
    },
    async run() {
      for await (let result of generator()) {
        try {
          emitter.emit('synchronize', Date.now())
          if (result?.lastMessageId != null && result?.messages != null) {
            const messageId = result.lastMessageId
            const messages = result.messages
            if (messageId > getId()) {
              messages.forEach((m) => emitter.emit('message.new', m))
              emitter.emit('last-message-id.new', messageId)
            }
          }
        } catch (e) {
          logger('error when sync', e.message)
          console.log('error when sync', e)
        }
      }
    },
  }
}
function synchronizeEventFactory(getHttp, getInterval, getSync, getId, logger) {
  const emitter = mitt()
  const synchronize = (messageId) => {
    const url = UrlBuilder('api/v2/sdk/sync_event')
      .param('start_event_id', messageId)
      .build()

    return getHttp()
      .get(url)
      .then((resp) => {
        // Single source (Phase 4 step 5): classify the sync_event batch via
        // core-v3's shared classifySyncEvents (also fixes the old divergence
        // where v2 matched 'delete_message' but core-v3 matched
        // 'deleted_message' — now both are accepted). Each shell still shapes
        // the raw payload.data buckets its own way (v2 emits them raw below).
        const { lastId, messageDelivered, messageRead, messageDeleted, roomCleared } =
          classifySyncEvents(resp.body.events)
        return Promise.resolve({
          lastId,
          messageDelivered,
          messageRead,
          messageDeleted,
          roomCleared,
          interval: getInterval(),
        })
      })
      .catch(noop)
  }
  async function* generator() {
    let accumulatedInterval = 0
    const interval = 100
    const shouldSync = () => getHttp() != null && getSync()

    while (true) {
      accumulatedInterval += interval
      if (accumulatedInterval >= getInterval() && shouldSync()) {
        accumulatedInterval = 0
        yield synchronize(getId())
      }
      await sleep(interval)
    }
  }

  return {
    get synchronize() {
      return synchronize
    },
    get on() {
      return emitter.on
    },
    get off() {
      return emitter.off
    },
    async run() {
      for await (let result of generator()) {
        try {
          const eventId = result.lastId
          if (eventId > getId()) {
            emitter.emit('last-event-id.new', eventId)
            result.messageDelivered.forEach((it) =>
              emitter.emit('message.delivered', it)
            )
            result.messageDeleted.forEach((it) =>
              emitter.emit('message.deleted', it)
            )
            result.messageRead.forEach((it) => emitter.emit('message.read', it))
            result.roomCleared.forEach((it) => emitter.emit('room.cleared', it))
          }
        } catch (e) {
          logger('error when sync event', e.message)
        }
      }
    },
  }
}

export default function SyncAdapter(
  getHttpAdapter,
  {
    isDebug = false,
    syncInterval,
    getShouldSync,
    syncOnConnect,
    lastCommentId,
    statusLogin,
    enableSync,
    enableSyncEvent,
  }
) {
  const emitter = mitt()
  const logger = (...args) => (isDebug ? console.log('QSync:', ...args) : {})

  let lastMessageId = 0
  let lastEventId = 0

  const getInterval = () => {
    if (statusLogin()) {
      if (getShouldSync()) return syncInterval()
      return syncOnConnect()
    }
    return 0
  }

  const _getShouldSync = () => getShouldSync() && enableSync()
  const syncFactory = synchronizeFactory(
    getHttpAdapter,
    getInterval,
    _getShouldSync,
    lastCommentId,
    logger
  )
  syncFactory.on('last-message-id.new', (id) => (lastMessageId = id))
  syncFactory.on('message.new', (m) => emitter.emit('message.new', m))
  syncFactory.on('synchronize', (m) => emitter.emit('synchronize', m))
  syncFactory.run().catch((err) => logger('got error when sync', err))

  const _getShouldSyncEvent = () => getShouldSync() && enableSyncEvent()
  const syncEventFactory = synchronizeEventFactory(
    getHttpAdapter,
    getInterval,
    _getShouldSyncEvent,
    () => lastEventId,
    logger
  )
  syncEventFactory.on('last-event-id.new', (id) => {
    lastEventId = id
  })
  syncEventFactory.on('message.read', (it) => {
    emitter.emit('message.read', it)
  })
  syncEventFactory.on('message.delivered', (it) =>
    emitter.emit('message.delivered', it)
  )
  syncEventFactory.on('message.deleted', (it) =>
    emitter.emit('message.deleted', it)
  )
  syncEventFactory.on('room.cleared', (it) => emitter.emit('room.cleared', it))
  syncEventFactory
    .run()
    .catch((err) => logger('got error when sync event', err))

  return {
    get on() {
      return emitter.on
    },
    get off() {
      return emitter.off
    },
    get interval() {
      return getInterval()
    },
    get enabled() {
      return enableSync()
    },
    async synchronize() {
      let id = lastCommentId()
      let result = await syncFactory.synchronize(id)
      let messages = result?.messages ?? []
      let lastMessageId = result?.lastMessageId ?? -1
      for (let message of messages) {
        emitter.emit('message.new', message)
      }
      if (lastMessageId > 0) {
        emitter.emit('last-message-id.new', lastMessageId)
      }
    },
    async synchronizeEvent() {
      let result = await syncEventFactory.synchronize(lastEventId)
      try {
        const eventId = result.lastId
        if (eventId > getId()) {
          emitter.emit('last-event-id.new', eventId)
          result.messageDelivered.forEach((it) =>
            emitter.emit('message.delivered', it)
          )
          result.messageDeleted.forEach((it) =>
            emitter.emit('message.deleted', it)
          )
          result.messageRead.forEach((it) => emitter.emit('message.read', it))
          result.roomCleared.forEach((it) => emitter.emit('room.cleared', it))
        }
      } catch (e) {
        logger('error when sync event', e.message)
      }
    },
  }
}
