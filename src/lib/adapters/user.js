import throttle from 'lodash.throttle'
import UrlBuilder from '../url-builder'

export default class User {
  /**
   * Params used in this class
   * @method constructor
   * @param  {Object}    HTTPAdapter [Qiscus HTTP adapter]
   * @return {void}                Returns nothing
   */
  constructor(HTTPAdapter) {
    this.HTTPAdapter = HTTPAdapter
    this.token = HTTPAdapter.token
  }

  postComment(topicId, commentMessage, uniqueId, type, payload, extras) {
    return this.HTTPAdapter.post_json(`api/v2/sdk/post_comment`, {
      comment: commentMessage,
      topic_id: topicId,
      unique_temp_id: uniqueId,
      type: type,
      payload: payload,
      extras
    }).then((res) => {
      if (res.body.status !== 200) return Promise.reject(res)
      return Promise.resolve(res.body.results.comment)
    })
  }

  updateCommentStatus = throttle(
    (roomId, lastReadCommentId, lastReceivedCommentId) => {
      const body = {
        room_id: roomId
      }
      if (lastReadCommentId) body.last_comment_read_id = lastReadCommentId
      if (lastReceivedCommentId) {
        body.last_comment_received_id = lastReceivedCommentId
      }

      return this.HTTPAdapter.post('api/v2/mobile/update_comment_status', body)
    },
    300
  )

  loadRoomList(params = {}) {
    const url = UrlBuilder('api/v2/sdk/user_rooms')
      .param('page', params.page)
      .param('show_participants', params.show_participants || true)
      .param('limit', params.limit)
      .param('show_empty', params.show_empty)
      .build()

    return this.HTTPAdapter.get(url).then((res) => {
      if (res.body.status !== 200) return Promise.reject(res)
      return Promise.resolve(res.body.results.rooms_info)
    })
  }

  searchMessages(params) {
    const body = {
      query: params.query || null,
      room_id: params.room_id || null,
      last_comment_id: params.last_comment_id || null
    }
    return this.HTTPAdapter.post('api/v2/sdk/search_messages', body).then(
      (res) => res.body.results.comments
    )
  }

  updateProfile(params) {
    const body = {
      name: params.name || null,
      avatar_url: params.avatar_url || null,
      extras: params.extras ? JSON.stringify(params.extras) : null
    }
    return this.HTTPAdapter.patch('api/v2/sdk/my_profile', body).then(
      (res) => res.body.results.user
    )
  }

  uploadFile(file) {
    const body = {
      file: file
    }
    return this.HTTPAdapter.post(`api/v2/sdk/upload`, body).then(
      (res) => res.body
    )
  }

  getRoomsInfo(opts) {
    const body = {
      show_participants: true,
      show_removed: false
    }
    if (opts.room_ids) body.room_id = opts.room_ids
    if (opts.room_unique_ids) body.room_unique_id = opts.room_unique_ids
    if (opts.show_participants) body.show_participants = opts.show_participants
    if (opts.show_removed) body.show_removed = opts.show_removed
    return this.HTTPAdapter.post_json(`api/v2/mobile/rooms_info`, body).then(
      (res) => res.body
    )
  }

  loadComments(topicId, options) {
    const url = UrlBuilder('api/v2/sdk/load_comments')
      .param('topic_id', topicId)
      .param('last_comment_id', options.last_comment_id)
      .param('timestamp', options.timestamp)
      .param('after', options.after)
      .param('limit', options.limit)
      .build()

    return this.HTTPAdapter.get(url).then((res) => {
      if (res.status !== 200) return Promise.reject(res)
      return Promise.resolve(res.body.results.comments)
    })
  }

  deleteComment(roomId, commentUniqueIds, isForEveryone = true, isHard = true) {
    if (isForEveryone === false) {
      console.warn(
        'Deprecated: delete comment for me will be removed on next release'
      )
    }
    if (isHard === false) {
      console.warn('Deprecated: soft delete will be removed on next release')
    }
    const body = {
      unique_ids: commentUniqueIds,
      is_delete_for_everyone: isForEveryone,
      is_hard_delete: isHard
    }
    return this.HTTPAdapter.del(`api/v2/sdk/delete_messages`, body).then(
      (res) => res.body
    )
  }

  clearRoomMessages(roomIds) {
    const body = {
      room_channel_ids: roomIds
    }
    return this.HTTPAdapter.del(`api/v2/sdk/clear_room_messages`, body).then(
      (res) => res.body
    )
  }

  getCommentReceiptStatus(id) {
    return this.HTTPAdapter.get(
      `api/v2/sdk/comment_receipt?comment_id=${id}`
    ).then((res) => res.body)
  }

  getBlockedUser(page = 1, limit = 20) {
    const url = `api/v2/mobile/get_blocked_users?page=${page}&limit=${limit}`
    return this.HTTPAdapter.get(url).then((res) => {
      if (res.body.status !== 200) return Promise.reject(res)
      return Promise.resolve(res.body.results.blocked_users)
    })
  }

  blockUser(email) {
    if (!email) throw new Error('email is required')
    let params = {
      user_email: email
    }

    return this.HTTPAdapter.post(`api/v2/mobile/block_user`, params).then(
      (res) => {
        if (res.body.status !== 200) return Promise.reject(res)
        return Promise.resolve(res.body.results.user)
      }
    )
  }

  unblockUser(email) {
    if (!email) throw new Error('email is required')
    const params = {
      user_email: email
    }

    return this.HTTPAdapter.post(`api/v2/mobile/unblock_user`, params).then(
      (res) => {
        if (res.body.status !== 200) return Promise.reject(res)
        return Promise.resolve(res.body.results.user)
      }
    )
  }

  getProfile() {
    return this.HTTPAdapter.get(`api/v2/sdk/my_profile`).then(
      (res) => res.body.results.user
    )
  }

  getUserPresences(email) {
    let params = {
      user_ids: email,
    }

    return this.HTTPAdapter.post_json(`api/v2/sdk/users/status`, params).then(
      (res) => {
        if (res.body.status !== 200) return Promise.reject(res)
        return Promise.resolve(res.body.results.user_status)
      }
    )
  }
}
