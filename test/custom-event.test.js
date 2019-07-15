import chai, { expect } from 'chai'
import spy from 'chai-spies'
import CustomEvent from '../lib/adapters/custom-event'

chai.use(spy)

describe('CustomEvent', function () {
  let customEvent = null
  let mqttAdapter = null
  beforeEach(() => {
    const mockedEvents = {}
    mqttAdapter = {
      mqtt: {
        _resubscribeTopics: [],
        on (type, callback) {
          mockedEvents[type] = callback
        },
        sendEvent (roomId, payload) {
          mockedEvents['message'](`r/${roomId}/${roomId}/e`, payload)
        },
        publish (topic, payload) {
          if (mockedEvents['message'] && mockedEvents[topic]) {
            mockedEvents['message'](topic, payload)
          }
        },
        subscribe (topic) {
          mockedEvents[topic] = true
        },
        unsubscribe (topic) {
          mockedEvents[topic] = null
          delete mockedEvents[topic]
        }
      }
    }

    customEvent = CustomEvent(mqttAdapter, '1234')
  })

  describe('#publishEvent', () => {
    it('should throw error when roomId are not provided', () => {
      const fn = () => customEvent.publishEvent()
      expect(fn).to.throw('`roomId` required')
    })
    it('should throw error when payload are not provided', () => {
      const fn = () => customEvent.publishEvent('123')
      expect(fn).to.throw('`payload` required')
    })
    it('should throw error when roomID are not string', () => {
      const fn = () => customEvent.publishEvent(123)
      expect(fn).to.throw(TypeError)
    })
    it('should throw error when payload are not an object', () => {
      const fn = () => customEvent.publishEvent('12345', 'payload-here')
      expect(fn).to.throw(TypeError)
    })
  })

  describe('#subscribeEvent', () => {
    it('should throw error when roomId are not provided', () => {
      const fn = () => customEvent.subscribeEvent()
      expect(fn).to.throw(Error, '`roomId` required')
    })
    it('should throw error when callback are not provided', () => {
      const fn = () => customEvent.subscribeEvent('123')
      expect(fn).to.throw(Error, '`callback` required')
    })
    it('should throw error when roomId are not string', () => {
      const fn = () => customEvent.subscribeEvent(123)
      expect(fn).to.throw(TypeError, '`roomId` must have type of string')
    })
    it('should throw error when callback are not function', () => {
      const fn = () => customEvent.subscribeEvent('123', {})
      expect(fn).to.throw(TypeError, '`callback` must have type of function')
    })

    it('should receive data from with the correct data', () => {
      const userId = 'user123'
      const roomId = '12345'
      const realPayload = { event: 'playing music', active: true }
      const payload = { sender: userId, data: realPayload }
      const cb = chai.spy(() => {})

      customEvent.subscribeEvent(roomId, cb)
      mqttAdapter.mqtt.sendEvent(roomId, JSON.stringify({
        sender: userId,
        data: realPayload
      }))

      expect(cb).to.be.called.once
      expect(cb).to.be.called.with(payload)
    })
  })

  describe('#unsubscribeEvent', () => {
    it('should throw error when roomId are not provided', () => {
      const fn = () => customEvent.unsubscribeEvent()
      expect(fn).to.throw(Error, '`roomId` required')
    })
    it('should throw error when roomId are not string', () => {
      const fn = () => customEvent.unsubscribeEvent(123)
      expect(fn).to.throw(TypeError, '`roomId` must have type of string')
    })
    it('should not calling callback after unsubscribe', () => {
      const roomId = '12345'
      const callback = chai.spy(() => {})
      customEvent.subscribeEvent(roomId, callback)
      customEvent.unsubscribeEvent(roomId)
      mqttAdapter.mqtt.sendEvent(roomId, { s: 'something' })
      expect(callback).to.not.be.called()
    })
  })
})
