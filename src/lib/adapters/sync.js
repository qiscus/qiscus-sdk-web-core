import mitt from 'mitt'

class UrlBuilder {
  constructor (baseUrl) {
    this.baseUrl = baseUrl
    this.params = {}
  }

  param(key, value) {
    this.params[key] = value
    return this
  }

  build() {
    const param = Object.keys(this.params)
      .filter(it => this.params[it] != null)
      .map(key => `${key}=${this.params[key]}`)
      .join('&')
    return [this.baseUrl, param].join('?')
  }
}

export default function SyncAdapter (getHttpAdapter, {
  getToken,
  isDebug = false,
}) {
  const emitter = mitt()
  let lastMessageId = 0
  let lastEventId = 0

  const logger = (...args) => isDebug ? console.log('QSync:', ...args) : {}
  return {
    events: emitter,
    synchronize(messageId) {
      messageId = messageId || lastMessageId
      const url = new UrlBuilder('api/v2/sdk/sync')
        .param('token', getToken())
        .param('last_received_comment_id', messageId)
        .build()

      getHttpAdapter()
        .get(url)
        .then((resp) => {
          const results = resp.body.results
          const messages = results.comments
          lastMessageId = results.meta.last_received_comment_id
          emitter.emit('last-message-id', lastMessageId)
          messages.forEach(message => emitter.emit('message.new', message))
        }, (error) => logger('Error when synchonize', error))
    },
    synchronizeEvent(eventId) {
      eventId = eventId || lastEventId
      const url = new UrlBuilder('api/v2/sdk/sync_event')
        .param('token', getToken())
        .param('start_event_id', eventId)
        .build()

      getHttpAdapter()
        .get(url)
        .then((resp) => {
          const events = resp.body.events
          const lastId = events.map(it => it.id)
            .slice()
            .sort((a, b) => a - b)
            .pop()
          if (lastId != null) {
            lastEventId = lastId
            emitter.emit('last-event-id', lastEventId)
          }
          events.filter(it => it.action_topic === 'delivered')
            .forEach((event) => emitter.emit('message.delivered', event.payload.data))
          events.filter(it => it.action_topic === 'read')
            .forEach((event) => emitter.emit('message.read', event.payload.data))
          events.filter(it => it.action_topic === 'delete_message')
            .forEach((event) => emitter.emit('message.deleted', event.payload.data))
          events.filter(it => it.action_topic === 'clear_room')
            .forEach((event) => emitter.emit('room.deleted', event.payload.data))
        })
    },
  }
}
