import { expect } from 'chai'
import mitt from 'mitt'
import MqttAdapter from '../lib/adapters/mqtt'

/**
 * Phase 4 characterization tests (docs/v2-on-core-v3-plan.md §7; Fable review
 * 2026-07-06). Before re-platforming v2 realtime onto core-v3, pin the EXACT
 * mitt emit shapes v2's `MqttAdapter` produces for each MQTT topic/payload —
 * these raw shapes are the customer contract (`index.js` `init()` consumers +
 * `options.*Callback`), and there was no test protecting them. The Phase 4b
 * bridge must reproduce these byte-for-byte.
 *
 * We exercise the handlers on an `Object.create(MqttAdapter.prototype)` shell
 * (prototype methods + regex getters, minus the constructor's real MQTT
 * `connect()`), setting only the instance fields the handlers touch
 * (`emitter`, `core`). This characterizes the parse→emit logic in isolation.
 *
 * NOT picked up by `pnpm test`; run directly:
 * `npx mocha --require esbuild-register 'src/compat/*.test.js'`.
 */

function makeAdapter(core = {}) {
  const a = Object.create(MqttAdapter.prototype)
  a.emitter = mitt()
  a.core = { debugMQTTMode: false, ...core }
  return a
}

// Record every emit (event name + payload) on the adapter's mitt emitter.
function recordEmits(adapter) {
  const events = []
  adapter.emitter.on('*', (type, payload) => events.push({ type, payload }))
  return events
}

describe('compat/phase4 v2 MqttAdapter emit characterization', () => {
  it('newMessageHandler emits "new-message" with the parsed raw payload', () => {
    const a = makeAdapter()
    const events = recordEmits(a)
    a.newMessageHandler('room-token/c', JSON.stringify({ id: 5, message: 'hi', room_id: 9 }))
    expect(events).to.deep.equal([{ type: 'new-message', payload: { id: 5, message: 'hi', room_id: 9 } }])
  })

  it('channelMessageHandler emits "new-message" with the parsed raw payload', () => {
    const a = makeAdapter()
    const events = recordEmits(a)
    a.channelMessageHandler('appid/uniqueid/c', JSON.stringify({ id: 7, message: 'ch' }))
    expect(events).to.deep.equal([{ type: 'new-message', payload: { id: 7, message: 'ch' } }])
  })

  it('notificationHandler emits one "comment-deleted" per deleted message (array uniqueIds, string room_id)', () => {
    const a = makeAdapter()
    const events = recordEmits(a)
    const payload = {
      payload: {
        data: {
          deleted_messages: [
            { room_id: '10', message_unique_ids: ['u1', 'u2'] },
            { room_id: '11', message_unique_ids: ['u3'] },
          ],
        },
      },
    }
    a.notificationHandler('token/n', JSON.stringify(payload))
    expect(events).to.deep.equal([
      { type: 'comment-deleted', payload: { roomId: '10', commentUniqueIds: ['u1', 'u2'], isForEveryone: true, isHard: true } },
      { type: 'comment-deleted', payload: { roomId: '11', commentUniqueIds: ['u3'], isForEveryone: true, isHard: true } },
    ])
  })

  it('notificationHandler emits one "room-cleared" per deleted room (full room object)', () => {
    const a = makeAdapter()
    const events = recordEmits(a)
    const payload = { payload: { data: { deleted_rooms: [{ id: 3, unique_id: 'uq-3', room_name: 'R' }] } } }
    a.notificationHandler('token/n', JSON.stringify(payload))
    expect(events).to.deep.equal([{ type: 'room-cleared', payload: { id: 3, unique_id: 'uq-3', room_name: 'R' } }])
  })

  it('roomTypingHandler emits "room-typing" with parsed payload + room_id from the topic', () => {
    const a = makeAdapter()
    const events = recordEmits(a)
    a.roomTypingHandler('r/123/typing', JSON.stringify({ status: 'typing_on', sender_id: 'bot', sender_name: 'Bot', text: 'hi' }))
    expect(events).to.deep.equal([
      { type: 'room-typing', payload: { status: 'typing_on', sender_id: 'bot', sender_name: 'Bot', text: 'hi', room_id: '123' } },
    ])
  })

  it('typingHandler emits "typing" with string roomId/userId; self-typing is filtered out', () => {
    const a = makeAdapter({ user_id: 'me', selected: null })
    const events = recordEmits(a)
    a.typingHandler('r/5/5/other/t', '1')
    expect(events).to.deep.equal([{ type: 'typing', payload: { message: '1', userId: 'other', roomId: '5' } }])

    // self-typing (topic userId === core.user_id) emits nothing
    const a2 = makeAdapter({ user_id: 'me', selected: null })
    const events2 = recordEmits(a2)
    a2.typingHandler('r/5/5/me/t', '1')
    expect(events2).to.deep.equal([])
  })

  it('typingHandler sets core.isTypingStatus when the typing is for the selected room', () => {
    const core = { user_id: 'me', selected: { id: '5', participants: [{ email: 'other', username: 'Alice' }] }, isTypingStatus: '' }
    const a = makeAdapter(core)
    a.typingHandler('r/5/5/other/t', '1')
    expect(a.core.isTypingStatus).to.equal('Alice is typing ...')

    // message !== '1' (typing off) clears it
    a.typingHandler('r/5/5/other/t', '0')
    expect(a.core.isTypingStatus).to.equal(null)
  })

  it('deliveryReceiptHandler emits "message-delivered" (numeric commentId, split payload)', () => {
    const a = makeAdapter()
    const events = recordEmits(a)
    a.deliveryReceiptHandler('r/5/5/other/d', '42:uniq-42')
    expect(events).to.deep.equal([{ type: 'message-delivered', payload: { commentId: 42, commentUniqueId: 'uniq-42', userId: 'other' } }])
  })

  it('readReceiptHandler emits "message-read" (numeric commentId, split payload)', () => {
    const a = makeAdapter()
    const events = recordEmits(a)
    a.readReceiptHandler('r/5/5/other/r', '42:uniq-42')
    expect(events).to.deep.equal([{ type: 'message-read', payload: { commentId: 42, commentUniqueId: 'uniq-42', userId: 'other' } }])
  })

  it('onlinePresenceHandler emits "presence" with the raw payload string + userId', () => {
    const a = makeAdapter()
    const events = recordEmits(a)
    a.onlinePresenceHandler('u/guest-1002/s', '1:1693999999')
    expect(events).to.deep.equal([{ type: 'presence', payload: { message: '1:1693999999', userId: 'guest-1002' } }])
  })

  it('messageUpdatedHandler emits "message:updated" with the parsed raw payload', () => {
    const a = makeAdapter()
    const events = recordEmits(a)
    a.messageUpdatedHandler('token/update', JSON.stringify({ id: 9, message: 'edited' }))
    expect(events).to.deep.equal([{ type: 'message:updated', payload: { id: 9, message: 'edited' } }])
  })

  describe('topic matcher regexes (routing contract)', () => {
    const a = makeAdapter()
    const cases = [
      ['room-token/c', a.reNewMessage, true],
      ['appid/uniqueid/c', a.reNewMessage, true], // greedy .+ also matches 3-segment /c (new-message wins over channel by matcher order)
      ['token/n', a.reNotification, true],
      ['r/5/5/other/t', a.reTyping, true],
      ['r/123/typing', a.reRoomTyping, true],
      ['r/5/5/other/d', a.reDelivery, true],
      ['r/5/5/other/r', a.reRead, true],
      ['u/guest-1002/s', a.reOnlineStatus, true],
      ['token/update', a.reMessageUpdated, true],
    ]
    cases.forEach(([topic, re, expected]) => {
      it(`${topic} matches its regex`, () => {
        expect(re.test(topic)).to.equal(expected)
      })
    })
  })
})
