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
      token: this.token, comment: commentMessage, 
      topic_id: topicId, unique_temp_id: uniqueId,
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
    }
    if(lastReadCommentId) body.last_comment_read_id = lastReadCommentId;
    if(lastReceivedCommentId) body.last_comment_received_id = lastReceivedCommentId;

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

  uploadFile (file) {
    const body = {
      token: this.token,
      file: file
    };
    return this.HTTPAdapter
      .post(`api/v2/sdk/upload`, body)
      .then(res => Promise.resolve(res.body))
      .catch(error => Promise.reject(error))
  }

  getRoomsInfo(opts) {
    const body = {
      token: this.token,
      show_participants: true,
      show_removed: false,
    }
    if(opts.room_ids) body.room_id = opts.room_ids;
    if(opts.room_unique_ids) body.room_unique_id = opts.room_unique_ids;
    if(opts.show_participants) body.show_participants = opts.show_participants;
    if(opts.show_removed) body.show_removed = opts.show_removed;
    return this.HTTPAdapter.post(`api/v2/mobile/rooms_info`, body)
      .then(res => Promise.resolve(res.body))
      .catch(error => Promise.reject(error));
  }

  loadComments(topic_id, last_comment_id=0, timestamp, after, limit) {
    let params = `token=${this.token}&topic_id=${topic_id}&last_comment_id=${last_comment_id}`;
    if(timestamp) params += `&timestamp=${timestamp}`;
    if(after) params.after += `&after=${after}`;
    if(limit) params.limit += `&limit=${limit}`;
    return this.HTTPAdapter.get(`api/v2/sdk/load_comments?${params}`)
    .then((res) => {
      return new Promise((resolve, reject) => {
        if(res.status != 200) return new Promise((resolve, reject) => reject(res));
        const data = res.body.results.comments;
        return resolve(data);
      })
    }, (error) => {
      // console.info('failed loading comments', error);
      return new Promise((resolve, reject) => {
        return reject(error);
      });
    })
  }

}
