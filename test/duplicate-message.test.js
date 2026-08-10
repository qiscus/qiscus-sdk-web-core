import { expect } from 'chai'
import QiscusSDK from '../src/index'
import Room from '../src/lib/Room'

const ROOM_ID = 464173163
const SERVER_COMMENT_ID = 987654321
// Begitu pesannya sampai ke WhatsApp, backend nulis ulang `unique_id`-nya jadi
// wamid. Sejak saat itu, `unique_id` yang digenerate client waktu kirim udah
// beda sama yang dikirim balik server.
const WAMID = 'wamid.HBgMNjI4MTIzNDU2Nzg5FQIAERgSNzhBQ0Y0RDk2QjJDMjEzQjY0AA=='

/**
 * Bikin instance SDK yang bisa jalan tanpa koneksi ke server. Yang di-stub cuma
 * adapter yang kepakai di alur kirim dan load pesan.
 */
function createQiscus({ postComment, loadComments }) {
  const qiscus = new QiscusSDK()
  qiscus.username = 'Agent Satu'
  qiscus.user_id = 'agent@qiscus.com'
  qiscus.selected = new Room({ id: ROOM_ID, comments: [] })
  qiscus.userAdapter = { postComment, loadComments }
  return qiscus
}

/** Payload pesan, bentuknya sama kayak yang dikirim balik server. */
function serverComment(overrides = {}) {
  return {
    id: SERVER_COMMENT_ID,
    comment_before_id: SERVER_COMMENT_ID - 1,
    room_id: ROOM_ID,
    message: 'halo kak, ada yang bisa kami bantu?',
    type: 'text',
    username: 'Agent Satu',
    email: 'agent@qiscus.com',
    timestamp: '2026-08-08T10:26:53Z',
    unix_timestamp: 1786314413,
    status: 'sent',
    ...overrides,
  }
}

describe('Duplicate message on inbox v1', function () {
  it('should not show the message twice when the server rewrites its unique id', async function () {
    let sentUniqueId = null
    const qiscus = createQiscus({
      postComment: (roomId, message, uniqueId) => {
        sentUniqueId = uniqueId
        // Response POST cuma bawa `unique_temp_id`, yaitu unique id yang
        // digenerate client barusan.
        return Promise.resolve(
          serverComment({ unique_temp_id: uniqueId, unique_id: uniqueId })
        )
      },
      // Load ulang isi room, misal sesudah realtime reconnect. Waktu ini jalan,
      // unique id di server udah keburu diganti wamid.
      loadComments: () =>
        Promise.resolve([
          serverComment({ unique_temp_id: WAMID, unique_id: WAMID }),
        ]),
    })

    await qiscus.sendComment(ROOM_ID, 'halo kak, ada yang bisa kami bantu?')
    expect(qiscus.selected.comments).to.have.lengthOf(1)

    await qiscus.loadComments(ROOM_ID)

    expect(qiscus.selected.comments).to.have.lengthOf(1)
    const [comment] = qiscus.selected.comments
    expect(comment.id).to.equal(SERVER_COMMENT_ID)
    expect(sentUniqueId).to.not.equal(WAMID)
  })

  it('should keep both messages when they are two different messages', async function () {
    const qiscus = createQiscus({
      postComment: (roomId, message, uniqueId) =>
        Promise.resolve(
          serverComment({
            message,
            unique_temp_id: uniqueId,
            unique_id: uniqueId,
          })
        ),
      loadComments: () =>
        Promise.resolve([
          serverComment({ unique_temp_id: WAMID, unique_id: WAMID }),
          serverComment({
            id: SERVER_COMMENT_ID + 1,
            comment_before_id: SERVER_COMMENT_ID,
            message: 'ada lagi yang bisa dibantu?',
            unique_temp_id: `${WAMID}-2`,
            unique_id: `${WAMID}-2`,
          }),
        ]),
    })

    await qiscus.sendComment(ROOM_ID, 'halo kak, ada yang bisa kami bantu?')
    await qiscus.loadComments(ROOM_ID)

    expect(qiscus.selected.comments).to.have.lengthOf(2)
  })
})
