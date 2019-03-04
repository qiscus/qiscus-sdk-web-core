// import store from 'store';

export default class User {
  /**
  * Params used in this class
  * @method constructor
  * @param  {Object}    HTTPAdapter [Qiscus HTTP adapter]
  * @return {void}                Returns nothing
  */
  constructor (HTTPAdapter) {
    this.HTTPAdapter = HTTPAdapter
    this.token = HTTPAdapter.token
  }

  postComment (topicId, commentMessage, uniqueId, type, payload, extras) {
    return this.HTTPAdapter.post(`api/v2/sdk/post_comment`, {
      token: this.token,
      comment: commentMessage,
      topic_id: topicId,
      unique_temp_id: uniqueId,
      type: type,
      payload: payload,
      extras
    })
      .then((res) => {
        return new Promise((resolve, reject) => {
          if (res.body.status !== 200) return reject(res)
          const data = res.body.results.comment
          return resolve(data)
        })
      }, (error) => {
        return Promise.reject(error)
      })
  }

  sync (id = 0) {
    return this.HTTPAdapter.get(`api/v2/sdk/sync?token=${this.token}&last_received_comment_id=${id}`)
      .then((res, err) => {
        if (err) return Promise.reject(err)
        return new Promise((resolve, reject) => {
          if (res.body.status !== 200) return reject(res)
          const data = res.body.results.comments
          return resolve(data)
        })
      })
      .catch(error => console.log(error))
  }

  syncEvent (id = 0) {
    return this.HTTPAdapter.get(`api/v2/sdk/sync_event?token=${this.token}&start_event_id=${id}`)
      .then((res, err) => {
        if (err) return Promise.reject(err)
        return new Promise((resolve, reject) => {
          if (res.statusCode !== 200) return reject(res)
          const data = res.body
          return resolve(data)
        })
      })
      .catch((error) => console.log(error))
  }

  updateCommentStatus (roomId, lastReadCommentId, lastReceivedCommentId) {
    const body = {
      token: this.token,
      room_id: roomId
    }
    if (lastReadCommentId) body.last_comment_read_id = lastReadCommentId
    if (lastReceivedCommentId) body.last_comment_received_id = lastReceivedCommentId

    return this.HTTPAdapter
      .post('api/v2/mobile/update_comment_status', body)
      .then((res) => Promise.resolve(res))
      .catch((error) => console.log(error))
  }

  loadRoomList (params = {}) {
    let body = `?token=${this.token}`

    if (params.page) body += `&page=${params.page}`
    if (params.show_participants) body += `&show_participants=${params.show_participants || true}`
    if (params.limit) body += `&limit=${params.limit}`
    if (params.show_empty) body += `&show_empty=${params.show_empty}`

    return this.HTTPAdapter.get(`api/v2/sdk/user_rooms${body}`)
      .then((res) => {
        return new Promise((resolve, reject) => {
          if (res.body.status !== 200) return reject(res)
          const data = res.body.results.rooms_info
          return resolve(data)
        })
      }, (error) => {
        return Promise.reject(error)
      })
  }

  searchMessages (params) {
    const body = {
      token: this.token,
      query: params.query || null,
      room_id: params.room_id || null,
      last_comment_id: params.last_comment_id || null
    }
    return this.HTTPAdapter
      .post('api/v2/sdk/search_messages', body)
      .then((res) => Promise.resolve(res.body.results.comments))
      .catch((error) => Promise.reject(error))
  }

  updateProfile (params) {
    const body = {
      token: this.token,
      name: params.name || null,
      avatar_url: params.avatar_url || null,
      extras: params.extra ? JSON.stringify(params.extras) : null
    }
    return this.HTTPAdapter
      .patch('api/v2/sdk/my_profile', body)
      .then((res) => Promise.resolve(res.body.results.user))
      .catch((error) => Promise.reject(error))
  }

  uploadFile (file) {
    const body = {
      token: this.token,
      file: file
    }
    return this.HTTPAdapter
      .post(`api/v2/sdk/upload`, body)
      .then(res => Promise.resolve(res.body))
      .catch(error => Promise.reject(error))
  }

  getRoomsInfo (opts) {
    const body = {
      token: this.token,
      show_participants: true,
      show_removed: false
    }
    if (opts.room_ids) body.room_id = opts.room_ids
    if (opts.room_unique_ids) body.room_unique_id = opts.room_unique_ids
    if (opts.show_participants) body.show_participants = opts.show_participants
    if (opts.show_removed) body.show_removed = opts.show_removed
    return this.HTTPAdapter.post_json(`api/v2/mobile/rooms_info`, body)
      .then(res => Promise.resolve(res.body))
      .catch(error => Promise.reject(error))
  }

  loadComments (topicId, options) {
    let params = `token=${this.token}&topic_id=${topicId}`
    if (options.last_comment_id) params += `&last_comment_id=${options.last_comment_id}`
    if (options.timestamp) params += `&timestamp=${options.timestamp}`
    if (options.after) params += `&after=${options.after}`
    if (options.limit) params += `&limit=${options.limit}`
    return this.HTTPAdapter.get(`api/v2/sdk/load_comments?${params}`)
      .then((res) => {
        return new Promise((resolve, reject) => {
          if (res.status !== 200) return new Promise((resolve, reject) => reject(res))
          const data = res.body.results.comments
          return resolve(data)
        })
      }, (error) => {
      // console.info('failed loading comments', error);
        return new Promise((resolve, reject) => {
          return reject(error)
        })
      })
  }

  deleteComment (roomId, commentUniqueIds, isForEveryone = true, isHard = true) {
    if (isForEveryone === false) console.warn('Deprecated: delete comment for me will be removed on next release')
    if (isHard === false) console.warn('Deprecated: soft delete will be removed on next release')
    const body = {
      token: this.token,
      unique_ids: commentUniqueIds,
      is_delete_for_everyone: isForEveryone,
      is_hard_delete: isHard
    }
    return this.HTTPAdapter
      .del(`api/v2/sdk/delete_messages`, body)
      .then(res => Promise.resolve(res.body))
      .catch(error => Promise.reject(error))
  }

  clearRoomMessages (roomIds) {
    const body = {
      token: this.token,
      room_channel_ids: roomIds
    }
    return this.HTTPAdapter.del(`api/v2/sdk/clear_room_messages`, body)
      .then(res => Promise.resolve(res.body))
      .catch(error => Promise.reject(error))
  }

  getCommentReceiptStatus (id) {
    return this.HTTPAdapter.get(`api/v2/sdk/comment_receipt?token=${this.token}&comment_id=${id}`)
      .then(res => Promise.resolve(res.body))
      .catch(error => Promise.reject(error))
  }

  getBlockedUser (page = 1, limit = 20) {
    const url = `api/v2/mobile/get_blocked_users?token=${this.token}&page=${page}&limit=${limit}`
    return this.HTTPAdapter.get(url)
      .then((res) => {
        if (res.body.status !== 200) return Promise.reject(res)
        return Promise.resolve(res.body.results.blocked_users)
      }, (err) => {
        return Promise.reject(err)
      })
  }

  blockUser (email) {
    if (!email) throw new Error('email is required')
    let params = {
      token: this.token,
      user_email: email
    }

    return this.HTTPAdapter.post(`api/v2/mobile/block_user`, params)
      .then((res) => {
        if (res.body.status !== 200) return Promise.reject(res)
        return Promise.resolve(res.body.results.user)
      }, (err) => {
        return Promise.reject(err)
      })
  }

  unblockUser (email) {
    if (!email) throw new Error('email is required')
    let params = {
      token: this.token,
      user_email: email
    }

    return this.HTTPAdapter.post(`api/v2/mobile/unblock_user`, params)
      .then((res) => {
        if (res.body.status !== 200) return Promise.reject(res)
        return Promise.resolve(res.body.results.user)
      }, (err) => {
        return Promise.reject(err)
      })
  }
}
