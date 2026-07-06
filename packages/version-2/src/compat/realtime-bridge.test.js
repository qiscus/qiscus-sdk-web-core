import { expect } from 'chai'
import { makeRealtimeParser } from './realtime-bridge'

/**
 * Phase 4b parse-core test: driving the bridge's `route(topic, payload)` (which
 * would be fed by core-v3's `onMessage` firehose) reproduces v2 MqttAdapter's
 * exact mitt emits (pinned in phase4.mqtt-characterization.test.js). This
 * proves the firehose -> v2-matcher -> v2-handler -> emit path routes every
 * topic correctly and preserves the emit shapes byte-for-byte.
 *
 * NOT picked up by `pnpm test`; run directly:
 * `npx mocha --require esbuild-register 'src/compat/*.test.js'`.
 */

function recordEmits(parser) {
  const events = []
  parser.on('*', (type, payload) => events.push({ type, payload }))
  return events
}

describe('compat/realtime-bridge parse core (firehose -> v2 emits)', () => {
  it('routes new-message topics to a "new-message" emit with parsed payload', () => {
    const p = makeRealtimeParser({ debugMQTTMode: false })
    const events = recordEmits(p)
    p.route('room-token/c', JSON.stringify({ id: 5, message: 'hi' }))
    expect(events).to.deep.equal([{ type: 'new-message', payload: { id: 5, message: 'hi' } }])
  })

  it('routes notification deletes to comment-deleted + room-cleared', () => {
    const p = makeRealtimeParser({ debugMQTTMode: false })
    const events = recordEmits(p)
    p.route('token/n', JSON.stringify({ payload: { data: {
      deleted_messages: [{ room_id: '10', message_unique_ids: ['u1'] }],
      deleted_rooms: [{ id: 3, unique_id: 'uq-3' }],
    } } }))
    expect(events).to.deep.equal([
      { type: 'comment-deleted', payload: { roomId: '10', commentUniqueIds: ['u1'], isForEveryone: true, isHard: true } },
      { type: 'room-cleared', payload: { id: 3, unique_id: 'uq-3' } },
    ])
  })

  it('routes r/{id}/typing to "room-typing" with topic room_id', () => {
    const p = makeRealtimeParser({ debugMQTTMode: false })
    const events = recordEmits(p)
    p.route('r/123/typing', JSON.stringify({ status: 'typing_on', sender_id: 'bot' }))
    expect(events).to.deep.equal([{ type: 'room-typing', payload: { status: 'typing_on', sender_id: 'bot', room_id: '123' } }])
  })

  it('routes typing topics to "typing" (string ids) and self-filters', () => {
    const p = makeRealtimeParser({ debugMQTTMode: false, user_id: 'me', selected: null })
    const events = recordEmits(p)
    p.route('r/5/5/other/t', '1')
    p.route('r/5/5/me/t', '1') // self -> filtered
    expect(events).to.deep.equal([{ type: 'typing', payload: { message: '1', userId: 'other', roomId: '5' } }])
  })

  it('routes delivery/read receipts with numeric commentId + split payload', () => {
    const p = makeRealtimeParser({ debugMQTTMode: false })
    const events = recordEmits(p)
    p.route('r/5/5/other/d', '42:uniq-42')
    p.route('r/5/5/other/r', '43:uniq-43')
    expect(events).to.deep.equal([
      { type: 'message-delivered', payload: { commentId: 42, commentUniqueId: 'uniq-42', userId: 'other' } },
      { type: 'message-read', payload: { commentId: 43, commentUniqueId: 'uniq-43', userId: 'other' } },
    ])
  })

  it('routes presence to "presence" with the raw payload string', () => {
    const p = makeRealtimeParser({ debugMQTTMode: false })
    const events = recordEmits(p)
    p.route('u/guest-1002/s', '1:1693999999')
    expect(events).to.deep.equal([{ type: 'presence', payload: { message: '1:1693999999', userId: 'guest-1002' } }])
  })

  it('routes update topics to "message:updated" with parsed payload', () => {
    const p = makeRealtimeParser({ debugMQTTMode: false })
    const events = recordEmits(p)
    p.route('token/update', JSON.stringify({ id: 9, message: 'edited' }))
    expect(events).to.deep.equal([{ type: 'message:updated', payload: { id: 9, message: 'edited' } }])
  })

  it('propagates the isTypingStatus side effect for the selected room', () => {
    const core = { debugMQTTMode: false, user_id: 'me', selected: { id: '5', participants: [{ email: 'other', username: 'Alice' }] }, isTypingStatus: '' }
    const p = makeRealtimeParser(core)
    p.route('r/5/5/other/t', '1')
    expect(core.isTypingStatus).to.equal('Alice is typing ...')
  })

  it('ignores unhandled topics without throwing', () => {
    const p = makeRealtimeParser({ debugMQTTMode: false })
    const events = recordEmits(p)
    p.route('some/weird/topic', 'x')
    expect(events).to.deep.equal([])
  })
})
