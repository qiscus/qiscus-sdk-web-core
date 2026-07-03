import { expect } from 'chai'
import { rawRoomToV2 } from './to-v2'

/**
 * Unit parity for `rawRoomToV2` (docs/v2-on-core-v3-plan.md §9 Phase 2b).
 *
 * The room-construction methods re-platform onto core-v3's raw room adapter,
 * which returns the raw `res.body.results.room` WITHOUT the massaging the old
 * `lib/adapters/room.js` did inline before `new Room(...)`. `rawRoomToV2`
 * reproduces that massaging. This suite pins it against verbatim replicas of
 * each old adapter path, so a drift in the normalizer is caught before it
 * reaches a shell method.
 */

// Verbatim replica of lib/adapters/room.js `getOrCreateRoom` massaging (the
// 1-to-1 / target path), operating on copies so fixtures aren't mutated.
function oldTargetMassage(rawRoom, comments, email) {
  const room = { ...rawRoom }
  room.avatar = room.avatar_url
  room.comments = [...comments].reverse()
  const rival = room.participants.find((p) => p.email === email)
  room.name = rival ? rival.username : 'Room name'
  return room
}

// Verbatim replica of lib/adapters/room.js `getOrCreateRoomByUniqueId`
// massaging (the channel / unique-id path).
function oldUniqueIdMassage(rawRoom, comments) {
  const room = { ...rawRoom }
  room.avatar = room.avatar_url
  room.comments = [...comments].reverse()
  room.name = room.room_name
  return room
}

const rawRoom = () => ({
  id: 1,
  room_name: 'Group X',
  avatar_url: 'http://a/x.png',
  participants: [
    { id: 10, email: 'rival@e.com', username: 'Rival' },
    { id: 11, email: 'me@e.com', username: 'Me' },
  ],
})

// API returns comments newest-first; both old adapter and rawRoomToV2 reverse.
const rawComments = () => [{ id: 3 }, { id: 2 }, { id: 1 }]

describe('compat/to-v2 rawRoomToV2', () => {
  it('target mode: matches old getOrCreateRoom massaging (rival username)', () => {
    const email = 'rival@e.com'
    expect(rawRoomToV2(rawRoom(), { comments: rawComments(), targetEmail: email })).to.deep.equal(
      oldTargetMassage(rawRoom(), rawComments(), email)
    )
  })

  it('target mode: no rival match falls back to the LITERAL "Room name"', () => {
    const email = 'ghost@e.com'
    const out = rawRoomToV2(rawRoom(), { comments: rawComments(), targetEmail: email })
    expect(out).to.deep.equal(oldTargetMassage(rawRoom(), rawComments(), email))
    expect(out.name).to.equal('Room name') // NOT room_name ('Group X')
  })

  it('useRoomName mode: matches old getOrCreateRoomByUniqueId massaging (name = room_name)', () => {
    const out = rawRoomToV2(rawRoom(), { comments: rawComments(), useRoomName: true })
    expect(out).to.deep.equal(oldUniqueIdMassage(rawRoom(), rawComments()))
    expect(out.name).to.equal('Group X')
  })

  it('avatar is always overwritten from avatar_url (even if a stale avatar exists)', () => {
    const withStale = { ...rawRoom(), avatar: 'http://old/stale.png' }
    const out = rawRoomToV2(withStale, { comments: rawComments(), useRoomName: true })
    expect(out.avatar).to.equal('http://a/x.png')
  })

  it('comments are reversed into oldest-first order', () => {
    const out = rawRoomToV2(rawRoom(), { comments: rawComments(), useRoomName: true })
    expect(out.comments.map((c) => c.id)).to.deep.equal([1, 2, 3])
  })

  it('does not mutate the input raw room', () => {
    const input = rawRoom()
    rawRoomToV2(input, { comments: rawComments(), targetEmail: 'rival@e.com' })
    expect(input).to.not.have.property('avatar')
    expect(input).to.not.have.property('comments')
    expect(input).to.not.have.property('name')
  })

  it('targetEmail wins over useRoomName when both are given', () => {
    const out = rawRoomToV2(rawRoom(), { comments: rawComments(), targetEmail: 'rival@e.com', useRoomName: true })
    expect(out.name).to.equal('Rival')
  })

  it('returns null/undefined unchanged', () => {
    expect(rawRoomToV2(null)).to.equal(null)
    expect(rawRoomToV2(undefined)).to.equal(undefined)
  })
})
