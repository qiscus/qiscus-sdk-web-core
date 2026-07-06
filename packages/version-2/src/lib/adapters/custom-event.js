import is from '../is'
import mitt from 'mitt'

export default function CustomEventAdapter (mqttAdapter, userId) {
  const events = mitt()
  const subscribedTopics = {}
  const getTopic = (roomId) => `r/${roomId}/${roomId}/e`

  // Single source (Phase 4, docs/v2-on-core-v3-plan.md §7): consume the
  // canonical custom-event emitted on MqttAdapter's emitter (parsed once by
  // core-v3's parseRealtimeEvent -> adaptCanonicalToV2), instead of tapping the
  // raw mqtt client + running this adapter's own regex + JSON.parse. Subscribing
  // on the stable adapter emitter also survives reconnects (the old
  // `mqtt.on('message')` tap was dropped by `removeAllListeners` on reconnect).
  mqttAdapter.on('custom-event', ({ roomId, payload }) => {
    events.emit(getTopic(roomId), payload)
  })

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
      mqttAdapter.publish(getTopic(roomId), _payload)
    },
    subscribeEvent (roomId, callback) {
      if (is.undefined(roomId)) throw new Error('`roomId` required')
      if (is.not.string(roomId)) throw new TypeError('`roomId` must have type of string')
      if (is.undefined(callback)) throw new Error('`callback` required')
      if (is.not.function(callback)) throw new TypeError('`callback` must have type of function')

      const topic = getTopic(roomId)
      // Only allow 1 subcription for now
      if (subscribedTopics[topic]) return
      mqttAdapter.subscribe(topic)

      // payload arrives already parsed from the canonical custom-event
      const cb = (payload) => callback(payload)
      events.on(topic, cb)
      subscribedTopics[topic] = cb
    },
    unsubscribeEvent (roomId) {
      if (is.undefined(roomId)) throw new Error('`roomId` required')
      if (is.not.string(roomId)) throw new TypeError('`roomId` must have type of string')

      const topic = getTopic(roomId)
      if (!subscribedTopics[topic]) return
      mqttAdapter.unsubscribe(topic)
      events.off(topic, subscribedTopics[topic])
      subscribedTopics[topic] = null
      delete subscribedTopics[topic]
    }
  }
}
