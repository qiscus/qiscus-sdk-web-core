import { expect } from 'chai'
import format from 'date-fns/format'
import QiscusSDK from '../src/index'
import Comment from '../src/lib/Comment'

/**
 * `_reconcilePendingComment` is the healing half of the realtime dedup: the
 * echo is still dropped, but when it matches a comment the agent is still
 * waiting on, the echo is used to settle it.
 */
describe('_reconcilePendingComment', function () {
  let qiscus = null
  let pending = null
  // What the server echoes back over MQTT — carries the client generated id
  // on `unique_temp_id`, plus the real comment id and server timestamps.
  const serverEcho = {
    id: 987654,
    comment_before_id: 987653,
    message: 'halo',
    unique_temp_id: 'javascript-abc',
    timestamp: '2026-08-07T10:13:00Z',
    unix_timestamp: 1786104780,
    status: 'sent',
  }

  beforeEach(() => {
    qiscus = new QiscusSDK()
    qiscus.selected = { id: 1, comments: [] }
    pending = new Comment({
      room_id: 1,
      message: 'halo',
      unique_temp_id: 'javascript-abc',
      // Browser clock at send time — deliberately minutes off the server's so
      // the assertions below can tell the two apart.
      timestamp: '2026-08-07T10:20:07Z',
      unix_timestamp: 1786105207,
    })
    pending.markAsPending()
  })

  it('should settle a pending comment with the server payload', () => {
    const reconciled = qiscus._reconcilePendingComment(pending, serverEcho)

    expect(reconciled).to.equal(true)
    expect(pending.id).to.equal(987654)
    expect(pending.before_id).to.equal(987653)
    expect(pending.isPending).to.equal(false)
    expect(pending.isSent).to.equal(true)
    expect(pending.status).to.equal('sent')
  })

  it('should settle a comment that was marked failed', () => {
    pending.markAsFailed()

    expect(qiscus._reconcilePendingComment(pending, serverEcho)).to.equal(true)
    expect(pending.isFailed).to.equal(false)
    expect(pending.isSent).to.equal(true)
  })

  it('should clear the pending flag even when the echo says delivered', () => {
    // `markAsDelivered`/`markAsRead` bail out when called without an actor, so
    // the flags have to be settled explicitly — otherwise the bubble keeps
    // spinning on a comment the server already delivered.
    qiscus._reconcilePendingComment(pending, {
      ...serverEcho,
      status: 'delivered',
    })

    expect(pending.isPending).to.equal(false)
    expect(pending.isSent).to.equal(true)
    expect(pending.status).to.equal('delivered')
  })

  it('should take the server timestamp so ordering matches other comments', () => {
    const clientTime = pending.time

    qiscus._reconcilePendingComment(pending, serverEcho)

    expect(pending.unix_timestamp).to.equal(1786104780)
    expect(pending.time).to.equal(format(serverEcho.timestamp, 'HH:mm'))
    expect(pending.time).to.not.equal(clientTime)
  })

  it('should leave an already settled comment untouched', () => {
    const settled = new Comment({
      id: 987654,
      room_id: 1,
      message: 'halo',
      unique_temp_id: 'javascript-abc',
      timestamp: '2026-08-07T10:13:00Z',
      status: 'read',
    })
    settled.isRead = true
    settled.status = 'read'

    expect(qiscus._reconcilePendingComment(settled, serverEcho)).to.equal(false)
    expect(settled.status).to.equal('read')
  })

  it('should be a no-op for missing arguments', () => {
    expect(qiscus._reconcilePendingComment(null, serverEcho)).to.equal(false)
    expect(qiscus._reconcilePendingComment(pending, null)).to.equal(false)
    expect(pending.isPending).to.equal(true)
  })
})
