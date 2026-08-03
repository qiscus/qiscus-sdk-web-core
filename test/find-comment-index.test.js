import { expect } from 'chai'
import { findCommentIndex } from '../src/lib/utils'

describe('findCommentIndex', function () {
  it('should return -1 when comments or message are not provided', () => {
    expect(findCommentIndex(null, { id: 1 })).to.equal(-1)
    expect(findCommentIndex([{ id: 1 }], null)).to.equal(-1)
  })

  it('should return -1 when the message has not been received yet', () => {
    const comments = [
      { id: 1, unique_id: 'javascript-aaa' },
      { id: 2, unique_id: 'javascript-bbb' },
    ]

    expect(
      findCommentIndex(comments, { id: 3, unique_temp_id: 'javascript-ccc' })
    ).to.equal(-1)
  })

  it('should match by comment id', () => {
    const comments = [
      { id: 1, unique_id: 'javascript-aaa' },
      { id: 2, unique_id: 'javascript-bbb' },
    ]

    expect(
      findCommentIndex(comments, { id: 2, unique_temp_id: 'other-id' })
    ).to.equal(1)
  })

  it('should match pending comment by unique_temp_id', () => {
    // this is the MQTT echo of our own message: the pending comment does not
    // have an id yet, the echo carries the client generated id on
    // `unique_temp_id`
    const comments = [
      { id: 1, unique_id: 'javascript-aaa' },
      { id: undefined, unique_id: 'javascript-bbb', isPending: true },
    ]

    expect(
      findCommentIndex(comments, { id: 99, unique_temp_id: 'javascript-bbb' })
    ).to.equal(1)
  })

  it('should fall back to unique_id when unique_temp_id is absent', () => {
    const comments = [{ id: 1, unique_id: 'javascript-aaa' }]

    expect(findCommentIndex(comments, { unique_id: 'javascript-aaa' })).to.equal(
      0
    )
  })

  it('should not match two different comments that both have no id', () => {
    const comments = [{ id: undefined, unique_id: 'javascript-aaa' }]

    expect(
      findCommentIndex(comments, { unique_temp_id: 'javascript-bbb' })
    ).to.equal(-1)
  })
})
