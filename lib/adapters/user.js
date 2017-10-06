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

  postComment (topicId, commentMessage, uniqueId, type, payload) {
    return this.HTTPAdapter.post(`api/v2/sdk/post_comment`, {
      token: this.token, comment: commentMessage, 
      topic_id: topicId, unique_temp_id: uniqueId,
      type: type,
      payload: payload
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
    .then((res) => {
      return new Promise((resolve, reject) => {
        if (res.body.status !== 200) return reject(res)
        const data = res.body.results.comments
        return resolve(data)
      })
    }, (error) => {
      return Promise.reject(error)
    })
  }

  updateCommentStatus (roomId, lastReadCommentId, lastReceivedCommentId) {
    const body = {
      token: this.token,
      room_id: roomId,
      last_comment_read_id: lastReadCommentId,
      last_comment_received_id: lastReceivedCommentId
    }
    return this.HTTPAdapter
      .post('api/v2/mobile/update_comment_status', body)
      .then((res) => Promise.resolve(res))
      .catch((error) => Promise.reject(error))
  }

  loadRoomList(params = {}) {
    let body = `?token=${this.token}`;
    (params.page) ? body += '&page' + params.page : null;
    (params.show_participants) ? body += '&show_participants' + params.show_participants : true;
    (params.limit) ? body += '&limit' + params.limit : null;
    return this.HTTPAdapter.get(`api/v2/sdk/user_rooms${body}`)
    .then((res) => {
      return new Promise((resolve, reject) => {
        if (res.body.status !== 200) return reject(res);
        const data = res.body.results.rooms_info;
        return resolve(data);
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
      last_comment_id: params.last_comment_id || null,
    }
    return this.HTTPAdapter
      .post('api/v2/sdk/search_messages', body)
      .then((res) => Promise.resolve(res.body.results.comments))
      .catch((error) => Promise.reject(error))
  }

}
