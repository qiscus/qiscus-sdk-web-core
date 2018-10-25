import {expect} from 'chai'
import CustomEvent from '../lib/adapters/custom-event'


describe('CustomEvent', function () {
  let customEvent = null
  let mqttAdapter = null
  beforeEach(() => {
    const mockedEvents = {}
    mqttAdapter = {
      mqtt: {
        _resubscribeTopics: [],
        on(type, callback) {
          mockedEvents[type] = callback
        },
        sendEvent(roomId, payload) {
          mockedEvents['message'](`r/${roomId}/${roomId}/e`, payload)
        },
        publish(topic, payload) {
          if (mockedEvents['message'] && mockedEvents[topic]) {
            mockedEvents['message'](topic, payload)
          }
        },
        subscribe(topic) {
          mockedEvents[topic] = true
        },
        unsubscribe(topic) {
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

    it('should receive data from with the correct data', (done) => {
      const realPayload = { event: 'playing music', active: true }
      const roomId = '12345'
      customEvent.subscribeEvent(roomId, (payload) => {
        expect(payload).to.deep.equal(realPayload)
        done()
      })
      mqttAdapter.mqtt.sendEvent(roomId, JSON.stringify({
        sender: 'user123',
        data: realPayload
      }))
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
  })
})
