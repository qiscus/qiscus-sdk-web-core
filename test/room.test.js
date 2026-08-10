import { expect } from 'chai'
import Room from '../src/lib/Room'
import Comment from '../src/lib/Comment'

const ROOM_ID = 464173163

function comment(overrides = {}) {
  return new Comment({
    id: 1,
    room_id: ROOM_ID,
    message: 'halo',
    type: 'text',
    timestamp: '2026-08-08T10:26:53Z',
    unix_timestamp: 1786314413,
    ...overrides,
  })
}

describe('Room', function () {
  describe('#receiveComment', function () {
    it('should ignore a comment that belongs to another room', function () {
      const room = new Room({ id: ROOM_ID, comments: [] })
      room.receiveComment(comment({ room_id: ROOM_ID + 1 }))
      expect(room.comments).to.have.lengthOf(0)
    })

    it('should add a comment it has never seen', function () {
      const room = new Room({ id: ROOM_ID, comments: [] })
      room.receiveComment(comment({ id: 1, unique_id: 'javascript-aaa' }))
      room.receiveComment(comment({ id: 2, unique_id: 'javascript-bbb' }))
      expect(room.comments).to.have.lengthOf(2)
    })

    it('should update the existing comment when the unique id matches', function () {
      const room = new Room({ id: ROOM_ID, comments: [] })
      room.receiveComment(
        comment({ id: undefined, unique_id: 'javascript-aaa' })
      )

      room.receiveComment(
        comment({ id: 42, unique_id: 'javascript-aaa', message: 'halo kak' })
      )

      expect(room.comments).to.have.lengthOf(1)
      expect(room.comments[0].id).to.equal(42)
      expect(room.comments[0].message).to.equal('halo kak')
    })

    it('should update the existing comment when only the id matches', function () {
      const room = new Room({ id: ROOM_ID, comments: [] })
      room.receiveComment(comment({ id: 42, unique_id: 'javascript-aaa' }))

      // Pesan yang sama datang lagi sesudah unique id-nya diganti backend.
      room.receiveComment(comment({ id: 42, unique_id: 'wamid.HBgMNjI4MQ==' }))

      expect(room.comments).to.have.lengthOf(1)
      expect(room.comments[0].id).to.equal(42)
    })

    it('should not merge two comments that have neither id nor unique id', function () {
      const room = new Room({ id: ROOM_ID, comments: [] })
      room.receiveComment(comment({ id: undefined, unique_id: undefined }))
      room.receiveComment(comment({ id: undefined, unique_id: undefined }))
      expect(room.comments).to.have.lengthOf(2)
    })
  })
})
