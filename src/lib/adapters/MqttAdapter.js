import mqtt from 'mqtt'
import mitt from 'mitt'

export default class MqttAdapter {
  constructor (url, callbacks, core) {
    const self = this
    this.core = context
    this.emitter = mitt()
    this.mqtt = mqtt.connect(this.core.mqttURL, {
      will: {
        topic: `u/${this.core.userData.email}/s`,
        payload: 0,
        retain: true
      }
    })
    const reNewMessage = /^[\w]+\/c/i
    const reNotification = /^[\w]+\/n/i
    const reTyping = /^r\/[\d]+\/[\d]+\/([\S]+)\/t$/i
    const reDelivery = /^r\/[\d]+\/[\d]+\/[\S]+\/d$/i
    const reRead = /^r\/[\d]+\/[\d]+\/[\S]+\/r$/i
    const reOnlineStatus = /^u\/[\S]+\/s$/i
    const reChannelMessage = /^[\S]+\/[\S]+\/c/i

    this.mqtt.on('message', (_topic, message) => {
      if (this.core.debugMQTTMode) {
        console.log('get mqtt message topic', topic)
        console.log('get mqtt message message', message.toString())
      }
      // set the message to readable string
      message = message.toString()
      topic = _topic.split('/')
      // set event handler

      switch (true) {
        // new message topic
        // {token}/c
        case reNewMessage.test(_topic):
          this.emitter.emit('new-comment', JSON.parse(message))
        break

        // notification / system event
        // {token}/n
        case reNotification.test(_topic):
          handleDeletedEvents(topic, message, this.core)
        break

        // typing
        // r/{roomId}/{topicId}/{userId}/t
        // r/{roomId}/{topicId}/+/t
        case reTyping.test(_topic): {
          const match = _topic.match(reTyping)
          const username = match[2]
          const roomId = match[1]
          this.emitter.emit('typing', {
            message,
            username,
            roomId
          })
          if (this.core.selected != null
              && roomId === this.core.selected.id
              && message === '1'
          ) {
            const actor = this.core.selected.participants.find(it => it.email === username)
            const displayName = actor != null ? actor.username : null
            if (displayName != null) {
              this.core.isTypingStatus = `${displayName} is typing ...`
            }
          } else {
            this.core.isTypingStatus = null
          }
        }
        break

        // delivery receipt
        // r/{roomId}/{topicId}/{userId}/d
        // r/{roomId}/{topicId}/+/d
        case reDelivery.test(_topic):
        break

        // read receipt
        // r/{roomId}/{topicId}/{userId}/r
        // r/{roomId}/{topicId}/+/r
        case reRead.test(_topic):
        break

        // user online status / precense
        // u/{userId}/s
        case reOnlineStatus.test(_topic):
          this.emitter.emit('presence', message)
        break

        // channel new comment
        // {appId}/{roomId}/c
        case reChannelMessage.test(_topic):
          this.emitter.emit('new-comment')
        break
      }

      if (topic.length === 2) {
        // it's a comment message -> {token}/c
        if (topic[1] === 'c') {
          self.core.events.emit('newmessages', [JSON.parse(message)])
        } else if (topic[1] === 'n') {
          // notifications event (delete room)
          handleDeletedEvents(topic, message, self.core)
        }
      } else if (topic[0] === 'u' && topic[2] === 's') {
        // it's a user status message -> u/{user}/s (online / offline)
        self.core.events.emit('presence', message)
      } else if (topic[2] === 'c') {
        // this one is for channel subscribing
        self.core.events.emit('newmessages', [JSON.parse(message)])
      } else if (topic[0] === 'r' && topic[4] === 't') {
        if (!self.core.selected) return false
        // it's a typing message
        if (topic[3] !== self.core.user_id) {
          self.core.events.emit('typing', {
            message,
            username: topic[3],
            room_id: topic[1]
          })
          // if (self.core.selected.id === topic[1]) self.core.isTypingStatus = `${topic[3]} is typing ...`;
          if (message === '1' && topic[1] === self.core.selected.id) {
            // ambil dulu usernya
            const participantIndex = self.core.selected.participants.findIndex(p => p.email === topic[3])
            if (participantIndex < 0) return
            const username = self.core.selected.participants[participantIndex].username
            self.core.isTypingStatus = `${username} is typing ...`
          } else {
            self.core.isTypingStatus = null
          }
        }
      } else if (topic[0] === 'r' && topic[4] === 'r') {
        if (!self.core.selected) {
          const messageData = message.split(':')
          return self.core.events.emit('comment-read', {
            comment_id: messageData[0],
            comment_unique_id: messageData[1],
            room_id: topic[1],
            actor: topic[3]
          })
        }
        // it's a read event
        // find the comment that need to be altered
        const commentToFind = self.core.selected.comments.find(selectedComment => {
          return (
            message.split(':')[1]
              ? selectedComment.unique_id === message.split(':')[1]
              : selectedComment.id === message.split(':')[0]
          )
        })
        if (commentToFind && commentToFind.status !== 'read' &&
          self.core.user_id === commentToFind.username_real &&
          topic[3] !== self.core.user_id) {
          // if(topic[3] === commentToFind.username_real) return false;
          const options = {
            participants: self.core.selected.participants,
            actor: topic[3],
            comment_id: message.split(':')[0]
          }
          self.core.selected.comments.forEach(comment => {
            if (comment.id <= commentToFind.id) {
              comment.markAsRead(options)
            }
          })
          if (!commentToFind.room_id) commentToFind.room_id = self.core.selected.id
          self.core.events.emit('comment-read', {
            comment: commentToFind,
            actor: topic[3]
          })
        }
      } else if (topic[0] === 'r' && topic[4] === 'd') {
        if (!self.core.selected) {
          const messageData = message.split(':')
          return self.core.events.emit('comment-delivered', {
            comment_id: messageData[0],
            comment_unique_id: messageData[1],
            room_id: topic[1],
            actor: topic[3]
          })
        }
        // it's a delivered event
        // find the comment that need to be altered
        let commentToFind = null
        let commentRoom = self.core.selected
        const messageData = message.split(':')
        for (let j = 0; j < commentRoom.comments.length; j++) {
          let commentData = commentRoom.comments[j]
          if (commentData.id === messageData[0] || commentData.unique_id === messageData[1]) {
            commentToFind = commentData
            break
          }
        }
        if (commentToFind && commentToFind.status !== 'read') {
          if (topic[3] === commentToFind.username_real) return false
          const options = {
            participants: commentRoom.participants,
            actor: topic[3],
            comment_id: message.split(':')[0]
          }
          commentRoom.comments.forEach(comment => {
            if (comment.status !== 'read' && comment.id <= commentToFind.id) comment.markAsDelivered(options)
          })
          if (!commentToFind.room_id) commentToFind.room_id = commentRoom.id
          self.core.events.emit('comment-delivered', {
            actor: topic[3],
            comment: commentToFind
          })
        }
        // callbacks.delivered(topic[3], message);
      }
    })

    this.mqtt.on('reconnect', function () {
      context.disableSync()
      // call sync once again
      context.synchronize()
      context.synchronizeEvent()
    })
    this.mqtt.on('close', function () {
      context.activateSync()
    })
    this.mqtt.on('error', function () {
      context.activateSync()
    })
  }
  subscribe (topic) {
    this.mqtt.subscribe(topic)
  }
  unsubscribe (topic) {
    this.mqtt.unsubscribe(topic)
  }
  subscribeChannel (appId, roomUniqueId) {
    this.subscribe(`${appId}/${roomUniqueId}/c`)
  }
  subscribeTyping (roomId) {
    // console.info('subscribing typing from room ', roomId);
    this.subscribe(`r/${roomId}/${roomId}/+/t`)
    this.subscribe(`r/${roomId}/${roomId}/+/d`)
    this.subscribe(`r/${roomId}/${roomId}/+/r`)
  }
  unsubscribeTyping () {
    // this.unsubscribe(`r/+/+/+/t`);
    if (!this.core.selected) return false
    const roomId = this.core.selected.id
    this.unsubscribe(`r/${roomId}/${roomId}/+/t`)
    // titip sekalian untuk read dan delivered
    this.unsubscribe(`r/${roomId}/${roomId}/+/d`)
    this.unsubscribe(`r/${roomId}/${roomId}/+/r`)
  }
  publish (topic, payload, options = {}) {
    this.mqtt.publish(topic, payload.toString(), options)
  }
  subscribeUserChannel (channel) {
    this.subscribe(`${this.core.userData.token}/c`)
    this.subscribe(`${this.core.userData.token}/n`)
  }
  publishPresence (userId) {
    this.core.logging('emitting presence status for user', userId)
    this.publish(`u/${userId}/s`, 1, { retain: true })
  }
  subscribeRoomPresence (userId) {
    this.subscribe(`u/${userId}/s`)
  }
  unsubscribeRoomPresence (userId) {
    // ambil semua yang mau di unsubscribe
    this.unsubscribe(`u/${userId}/s`)
    // Object.keys(this.mqtt._subscribedTopics)
    //   .filter(filteredList => filteredList.slice(-2) ==== '/s')
    //   .forEach(unlist => {
    //     this.unsubscribe(unlist);
    //   })
  }
  publishTyping (status) {
    this.publish(`r/${this.core.selected.id}/${this.core.selected.id}/${this.core.user_id}/t`, status)
  }
}

function handleDeletedEvents (topic, message, context) {
  const parsedMessage = JSON.parse(message)
  if ('deleted_messages' in parsedMessage.payload.data) {
    parsedMessage.payload.data.deleted_messages.map(msgRoom => {
      context.events.emit('comment-deleted', { roomId: msgRoom.room_id, commentUniqueIds: msgRoom.message_unique_ids, isForEveryone: true, isHard: parsedMessage.payload.data.is_hard_delete })
    })
  } else if ('deleted_rooms' in parsedMessage.payload.data) {
    // get id of all rooms available
    parsedMessage.payload.data.deleted_rooms.forEach(room => {
      context.events.emit('room-cleared', room)
    })
  }
}
