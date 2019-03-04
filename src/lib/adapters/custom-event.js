import is from 'is_js'
import { EventEmitter } from 'events'

export default function CustomEventAdapter (mqttAdapter, userId) {
  const events = new EventEmitter()
  const subscribedTopics = {}

  const reTopic = /^r\/[\w]+\/[\w]+\/e$/i
  mqttAdapter.mqtt.on('message', (topic, payload) => {
    if (reTopic.test(topic)) events.emit(topic, payload)
  })

  const getTopic = (roomId) => `r/${roomId}/${roomId}/e`

  return {
    publishEvent (roomId, payload) {
      if (is.undefined(roomId)) throw new Error('`roomId` required')
      if (is.not.string(roomId)) throw new TypeError('`roomId` must have type of string')
      if (is.undefined(payload)) throw new Error('`payload` required')
      if (is.not.object(payload)) throw new TypeError('`payload` must have type of object')

      const _payload = JSON.stringify({
        sender: userId, // ?
        data: payload
      })
      mqttAdapter.mqtt.publish(getTopic(roomId), _payload)
    },
    subscribeEvent (roomId, callback) {
      if (is.undefined(roomId)) throw new Error('`roomId` required')
      if (is.not.string(roomId)) throw new TypeError('`roomId` must have type of string')
      if (is.undefined(callback)) throw new Error('`callback` required')
      if (is.not.function(callback)) throw new TypeError('`callback` must have type of function')

      const topic = getTopic(roomId)
      // Only allow 1 subcription for now
      if (subscribedTopics[topic]) return
      mqttAdapter.mqtt.subscribe(topic)

      const cb = (payload) => {
        const parsedPayload = JSON.parse(payload)
        callback(parsedPayload)
      }
      events.addListener(topic, cb)
      subscribedTopics[topic] = cb
    },
    unsubscribeEvent (roomId) {
      if (is.undefined(roomId)) throw new Error('`roomId` required')
      if (is.not.string(roomId)) throw new TypeError('`roomId` must have type of string')

      const topic = getTopic(roomId)
      if (!subscribedTopics[topic]) return
      mqttAdapter.mqtt.unsubscribe(topic)
      events.removeListener(topic, subscribedTopics[topic])
      subscribedTopics[topic] = null
      delete subscribedTopics[topic]
    }
  }
}
