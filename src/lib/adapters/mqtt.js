import { match, when } from '../match'
import mitt from 'mitt'
import connect from 'mqtt/lib/connect'

export default class MqttAdapter {
  constructor (url, core) {
    const emitter = mitt()
    const mqtt = connect(url, {
      will: {
        topic: `u/${core.userData.email}/s`,
        payload: 0,
        retain: true
      }
    })
    // Define a read-only property so user cannot accidentially
    // overwrite it's value
    Object.defineProperties(this, {
      core: { value: core },
      emitter: { value: emitter },
      mqtt: { value: mqtt }
    })

    const matcher = match({
      [when(this.reNewMessage)]: (topic) => this.newMessageHandler.bind(this, topic),
      [when(this.reNotification)]: (topic) => this.notificationHandler.bind(this, topic),
      [when(this.reTyping)]: (topic) => this.typingHandler.bind(this, topic),
      [when(this.reDelivery)]: (topic) => this.deliveryReceiptHandler.bind(this, topic),
      [when(this.reRead)]: (topic) => this.readReceiptHandler.bind(this, topic),
      [when(this.reOnlineStatus)]: (topic) => this.onlinePresenceHandler.bind(this, topic),
      [when(this.reChannelMessage)]: (topic) => this.channelMessageHandler.bind(this, topic),
      [when()]: (topic) => this.logger('topic not handled', topic)
    })

    this.mqtt.on('message', (t, m) => {
      const message = m.toString()
      const func = matcher(t)
      if (func != null) func(message)
    })

    this.mqtt.on('reconnect', () => {
      this.logger('reconnect')
      this.emit('reconnect')

      core.disableSync()
      core.synchronize()
      core.synchronizeEvent()
    })
    this.mqtt.on('close', () => {
      this.logger('close')
      this.emit('close')

      core.activateSync()
    })
    this.mqtt.on('error', () => {
      this.logger('error')
      this.emit('error')

      core.activateSync()
    })

    // TODO: Update core to use latest emitter
    // #region backward-compatible
    this.on('new-message', (message) => {
      core.events.emit('newmessages', [message])
    })
    this.on('presence', (data) => {
      core.events.emit('presence', data)
    })
    this.on('comment-deleted', (data) => {
      core.events.emit('comment-deleted', data)
    })
    this.on('room-cleared', (data) => {
      core.events.emit('room-cleared', data)
    })
    this.on('typing', (data) => {
      core.events.emit('typing', {
        message: data.message,
        username: data.userId,
        room_id: data.roomId
      })
    })
    this.on('comment-delivered', (data) => {
      this.logger('emitting comment-delivered', data)
      core.events.emit('comment-delivered', {
        actor: data.userId,
        comment: data.comment
      })
    })
    this.on('comment-read', (data) => {
      core.events.emit('comment-read', {
        comment: data.comment,
        actor: data.userId
      })
    })
    // #endregion
  }
  get subscribe () {
    return this.mqtt.subscribe.bind(this.mqtt)
  }
  get unsubscribe () {
    return this.mqtt.unsubscribe.bind(this.mqtt)
  }
  publish (topic, payload, options = {}) {
    return this.mqtt.publish(topic, payload.toString(), options)
  }
  get emit () {
    return this.emitter.emit.bind(this.emitter)
  }
  get on () {
    return this.emitter.on.bind(this.emitter)
  }
  get logger () {
    if (!this.core.debugMQTTMode) return this.noop
    return console.log.bind(console, 'MQTT ->')
  }

  // #region regexp
  get reNewMessage () { return /^([\w]+)\/c/i }
  get reNotification () { return /^([\w]+)\/n/i }
  get reTyping () { return /^r\/([\d]+)\/([\d]+)\/([\S]+)\/t$/i }
  get reDelivery () { return /^r\/([\d]+)\/([\d]+)\/([\S]+)\/d$/i }
  get reRead () { return /^r\/([\d]+)\/([\d]+)\/([\S]+)\/r$/i }
  get reOnlineStatus () { return /^u\/([\S]+)\/s$/i }
  get reChannelMessage () { return /^([\S]+)\/([\S]+)\/c/i }
  // #endregion

  noop () {}

  newMessageHandler (topic, message) {
    message = JSON.parse(message)
    this.logger('on:new-message', message)
    this.emit('new-message', message)
  }

  notificationHandler (topic, message) {
    this.logger('on:notification', message)
    message = JSON.parse(message)
    const data = message.payload.data
    if ('deleted_messages' in data) {
      data.deleted_messages.forEach((message) => {
        this.emit('comment-deleted', {
          roomId: message.room_id,
          commentUniqueIds: message.message_unique_ids,
          isForEveryone: true,
          isHard: true
        })
      })
    }

    if ('deleted_rooms' in data) {
      data.deleted_rooms.forEach((room) => {
        this.emit('room-cleared', room)
      })
    }
  }

  typingHandler (t, message) {
    this.logger('on:typing', t)
    // r/{roomId}/{roomId}/{userId}/t
    const topic = t.match(this.reTyping)
    if (topic[3] === this.core.user_id) return

    const userId = topic[3]
    const roomId = topic[1]

    this.emit('typing', {
      message,
      userId,
      roomId
    })

    // TODO: Don't allow side-effect
    // it should be handled in the UI not core
    if (message === '1' && roomId === this.core.selected.id) {
      const actor = this.core.selected.participants
        .find(it => it.email === userId)
      if (actor == null) return
      const displayName = actor.username
      this.core.isTypingStatus = `${displayName} is typing ...`
    } else {
      this.core.isTypingStatus = null
    }
  }

  deliveryReceiptHandler (t, message) {
    this.logger('on:delivered', t, message)
    // r/{roomId}/{roomId}/{userId}/d
    const topic = t.match(this.reDelivery)
    const data = message.split(':')
    const commentId = data[0]
    const commentUniqueId = data[1]
    const userId = topic[3]
    if (this.core.selected == null) return

    const room = this.core.selected
    const comment = room.comments
      .find(it => it.id === commentId || it.unique_id === commentUniqueId)
    if (comment == null) return
    if (comment.status === 'read') return
    if (comment.username_real === userId) return

    const options = {
      participants: room.participants,
      actor: userId,
      comment_id: commentId
    }
    room.comments.forEach((it) => {
      if (it.status !== 'read' && it.id <= comment.id) {
        comment.markAsDelivered(options)
      }
    })
    if (comment.room_id == null) comment.room_id = room.id
    this.emit('comment-delivered', {
      userId,
      comment
    })
  }

  // Todo only emit if the comment are realy read
  readReceiptHandler (t, message) {
    this.logger('on:read', t, message)
    // r/{roomId}/{roomId}/{userId}/r
    const topic = t.match(this.reRead)
    const data = message.split(':')
    const commentId = data[0]
    const commentUniqueId = data[1]
    const userId = topic[3]
    if (this.core.selected == null) return

    const room = this.core.selected
    const comment = room.comments
      .find(it => it.unique_id === commentUniqueId || it.id === commentId)
    if (comment == null) return

    const isOwnedComment = comment.username_real === this.core.user_id
    const isOwnedEvent = userId === this.core.user_id
    const isRead = comment.status === 'read'

    if (!isRead && isOwnedComment && !isOwnedEvent) {
      const options = {
        participants: room.participants,
        actor: userId,
        comment_id: Number(commentId),
        activeActorId: this.core.user_id
      }
      room.comments.forEach((it) => {
        if (it.id <= comment.id) {
          it.markAsRead(options)
        }
      })

      if (comment.room_id == null) comment.room_id = room.id
      // Only emit if comment are read
      if (!comment.isRead) return
      this.emit('comment-read', {
        comment,
        userId
      })
    }
  }

  onlinePresenceHandler (topic, message) {
    this.logger('on:online-presence', topic)
    this.emit('presence', message)
  }

  channelMessageHandler (topic, message) {
    this.logger('on:channel-message', topic, message)
    this.emit('new-message', JSON.parse(message))
  }

  // #region old-methods
  subscribeChannel (appId, uniqueId) {
    this.subscribe(`${appId}/${uniqueId}/c`)
  }
  subscribeRoom (roomId) {
    if (roomId == null) return
    this.subscribe(`r/${roomId}/${roomId}/+/t`)
    this.subscribe(`r/${roomId}/${roomId}/+/d`)
    this.subscribe(`r/${roomId}/${roomId}/+/r`)
  }
  unsubscribeRoom (roomId) {
    if (this.core.selected == null) return
    roomId = roomId || this.core.selected.id
    this.unsubscribe(`r/${roomId}/${roomId}/+t`)
    this.unsubscribe(`r/${roomId}/${roomId}/+d`)
    this.unsubscribe(`r/${roomId}/${roomId}/+r`)
  }
  get subscribeTyping () { return this.subscribeRoom.bind(this) }
  get unsubscribeTyping () { return this.unsubscribeRoom.bind(this) }
  subscribeUserChannel () {
    this.subscribe(`${this.core.userData.token}/c`)
    this.subscribe(`${this.core.userData.token}/n`)
  }
  publishPresence (userId) {
    this.core.logging('emitting presence status for user', userId)
    this.publish(`u/${userId}/s`, 1, { retain: true })
  }
  subscribeUserPresence (userId) { this.subscribe(`u/${userId}/s`) }
  unsubscribeUserPresence (userId) { this.unsubscribe(`u/${userId}/s`) }
  get subscribeRoomPresence () { return this.subscribeUserPresence.bind(this) }
  get unsubscribeRoomPresence () { return this.unsubscribeUserPresence.bind(this) }
  publishTyping (status) {
    if (this.core.selected == null) return
    const roomId = this.core.selected.id
    const userId = this.core.user_id
    this.publish(`r/${roomId}/${roomId}/${userId}/t`, status)
  }
  // #endregion
}
