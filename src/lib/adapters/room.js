export default class RoomAdapter {
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

  getOrCreateRoom(email, options, distinctId) {
    let params = { emails: email }
    if (distinctId) params[distinctId] = distinctId
    if (options) params['options'] = JSON.stringify(options)

    return this.HTTPAdapter.post(
      `api/v2/sdk/get_or_create_room_with_target`,
      params
    ).then((res) => {
      if (res.body.status !== 200) return Promise.reject(res)
      const room = res.body.results.room
      room.avatar = room.avatar_url
      room.comments = res.body.results.comments.reverse()
      const rivalUser = room.participants.find((p) => p.email === email)
      room.name = rivalUser ? rivalUser.username : 'Room name'
      return Promise.resolve(room)
    })
  }

  getRoomById(id) {
    return this.HTTPAdapter.get(`api/v2/mobile/get_room_by_id?id=${id}`).then(
      (res) => res.body
    )
  }

  getOrCreateRoomByUniqueId(id, name, avatarURL) {
    let params = {
      unique_id: id,
      name: name,
      avatar_url: avatarURL
    }
    return this.HTTPAdapter.post(
      `api/v2/mobile/get_or_create_room_with_unique_id`,
      params
    ).then((res) => {
      if (res.body.status !== 200) return Promise.reject(res)
      const room = res.body.results.room
      room.avatar = room.avatar_url
      room.comments = res.body.results.comments.reverse()
      room.name = room.room_name
      return Promise.resolve(room)
    })
  }

  createRoom(name, emails, opts = {}, optionalData = {}) {
    const optsData =
      Object.keys(optionalData).length <= 0
        ? null
        : JSON.stringify(optionalData)
    const body = {
      name: name,
      'participants[]': emails,
      avatar_url: opts.avatarURL,
      options: optsData
    }

    return this.HTTPAdapter.post(`api/v2/mobile/create_room`, body).then(
      (res) => {
        if (res.body.status !== 200) return Promise.reject(res)
        const room = res.body.results.room
        room.comments = res.body.results.comments
        return Promise.resolve({
          id: room.id,
          name: room.room_name,
          lastCommentId: room.last_comment_id,
          lastCommentMessage: room.last_comment_message,
          lastTopicId: room.last_topic_id,
          avatarURL: room.avatar_url,
          options: room.options,
          participants: room.participants.map((participant) => ({
            id: participant.id,
            email: participant.email,
            username: participant.username,
            avatarURL: participant.avatar_url
          }))
        })
      }
    )
  }

  updateRoom(args) {
    if (!args.id) throw new Error('id is required')
    let params = { id: args.id }
    if (args.room_name) params['room_name'] = args.room_name
    if (args.avatar_url) params['avatar_url'] = args.avatar_url
    if (args.options) params['options'] = JSON.stringify(args.options)

    return this.HTTPAdapter.post(`api/v2/mobile/update_room`, params).then(
      (res) => {
        if (res.body.status !== 200) return Promise.reject(res)
        return Promise.resolve(res.body.results.room)
      }
    )
  }

  getTotalUnreadCount() {
    return this.HTTPAdapter.get(`api/v2/sdk/total_unread_count`).then(
      (resp) => resp.body.results.total_unread_count
    )
  }

  addParticipantsToGroup(roomId, emails = []) {
    if (!roomId || !emails) throw new Error('room_id and emails is required')
    let params = {
      room_id: roomId,
      'emails[]': emails
    }

    return this.HTTPAdapter.post(
      `api/v2/mobile/add_room_participants`,
      params
    ).then((res) => {
      if (res.body.status !== 200) return Promise.reject(res)
      return Promise.resolve(res.body.results.participants_added)
    })
  }

  removeParticipantsFromGroup(roomId, emails = []) {
    if (!roomId || !emails) throw new Error('room_id and emails is required')
    let params = {
      room_id: roomId,
      'emails[]': emails
    }

    return this.HTTPAdapter.post(
      `api/v2/mobile/remove_room_participants`,
      params
    ).then((res) => {
      if (res.body.status !== 200) return Promise.reject(res)
      return Promise.resolve(res.body.results.participants_removed)
    })
  }
}
