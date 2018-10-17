import mqtt from 'mqtt';
import {format} from 'date-fns';

export default class MqttAdapter {
  constructor(url, callbacks, context) {
    const self = this;
    this.context = context;
    if(this.context.mqttURL) url = this.context.mqttURL;
    this.mqtt = mqtt.connect(url, {
      will: {
        topic: `u/${self.context.userData.email}/s`,
        payload: 0,
        retain: true
      }
    })
    // console.log('connect mqtt');
    this.mqtt.on('message', function(topic, message) {

      if (self.context.debugMQTTMode) {
        console.log("get mqtt message topic", topic);
        console.log("get mqtt message message", message.toString());
      }
      // set the message to readable string
      message = message.toString();
      topic = topic.split("/");
      // set event handler
      if(topic.length == 2) {
        // it's a comment message -> {token}/c
        if(topic[1] == 'c') {
          self.context.emit('newmessages', [JSON.parse(message)]);
        } else if(topic[1] == 'n') {
          // notifications event (delete room)
          handleDeletedEvents(topic, message, self.context);
        }
      } else if(topic[0] == 'u' && topic[2] == 's') {
        // it's a user status message -> u/{user}/s (online / offline)
        const presencePayload = message.split(":");
        self.context.emit('presence', message);
      } else if (topic[2] == 'c') {
        // this one is for channel subscribing
        self.context.emit('newmessages', [JSON.parse(message)]);
      } else if(topic[0] == 'r' && topic[4] == 't') {
        if(self.context.selected && self.context.singleRoomSubscribe) {
          // it's a typing message
          if (topic[3] != self.context.user_id){
            self.context.emit('typing', {
              message,
              username:topic[3],
              room_id: topic[1]
            });
            // if (self.context.selected.id == topic[1]) self.context.isTypingStatus = `${topic[3]} is typing ...`;
            if(message == "1" && topic[1] == self.context.selected.id){
              // ambil dulu usernya
              const participantIndex = self.context.selected.participants.findIndex(p => p.email === topic[3]);
              if (participantIndex < 0) return;
              const username = self.context.selected.participants[participantIndex].username;
              self.context.isTypingStatus = `${username} is typing ...`;
            } else {
              self.context.isTypingStatus = null;
            }
          }
        } else if(!self.context.singleRoomSubscribe) {
          if (!self.context.typingStatus[topic[1]]) self.context.typingStatus[topic[1]] = '';
          if (topic[3] != self.context.user_id){
            // emit typing event
            self.context.emit('typing', {
              message,
              username:topic[3],
              room_id: topic[1]
            });
            // get username of the one who's typing now
            const room = self.getRoom(topic[1]);
            const participant = self.getParticipant(room, topic[3]);
            if(message == "1" && topic[3] != self.context.user_id) self.context.typingStatus[topic[1]] = `${participant} is typing ...`;
            if(message == "0") self.context.typingStatus[topic[1]] = '';
          }
        }
      } else if(topic[0] == 'r' && topic[4] == 'r') {
        // if (!self.context.selected) return false;
        // it's a read event
        // find the comment that need to be altered
        const room = self.getRoom(topic[1]);
        if (room) {
          const commentToFind = room.comments.find(selectedComment => {
            return (
              message.split(":")[1]
                ? selectedComment.unique_id === message.split(":")[1]
                : selectedComment.id === message.split(":")[0]
            )
          })
          if(!commentToFind || commentToFind.isRead) {
            // console.log('comment not found', message);
            return false;
          }
          if(topic[3] == commentToFind.username_real) return false;
          const options = {
            participants: room.participants,
            actor: topic[3],
            comment_id: message.split(":")[0]
          }
          // room.comments.forEach(comment => {
          //   if(comment.status != 'read' && comment.id <= commentToFind.id) {
          //     comment.status = 'read';
          //     comment.markAsRead(options);
          //   }
          // });
          commentToFind.status = 'read';
          commentToFind.markAsRead(options);
          if(!self.context.selected) return false;
          // if(self.context.selected.id.toString() === room.id.toString()) self.context.emit('comment-read', {
          if(!commentToFind.room_id) commentToFind.room_id = room.id;
          if(self.context.user_id == commentToFind.username_real) {
            // console.info(room.id, commentToFind.username_real, topic[3]);
            self.context.emit('comment-read', {
              comment: commentToFind
            });
          }
        }
      } else if(topic[0] == 'r' && topic[4] == 'd') {
        // if (!self.context.selected) return false;
        // it's a delivered event
        // find the comment that need to be altered
        const room = self.getRoom(topic[1]);

        if (room){
          const commentToFind = room.comments.find(selectedComment => {
            return (
              message.split(":")[1]
                ? selectedComment.unique_id === message.split(":")[1]
                : selectedComment.id === message.split(":")[0]
            )
          })
          if(!commentToFind || commentToFind.isDelivered || commentToFind.isRead) return false;
          // debugger;
          if(topic[3] == commentToFind.username_real) return false;
          const options = {
            participants: room.participants,
            actor: topic[3],
            comment_id: message.split(":")[0]
          }
          // room.comments.forEach(comment => {
          //   if(comment.status != 'read' && comment.id <= commentToFind.id) comment.markAsDelivered(options)
          // });
          commentToFind.markAsDelivered(options);
          if(!commentToFind.room_id) commentToFind.room_id = room.id;
          self.context.emit('comment-delivered', {
            comment: commentToFind
          })
        }
        // callbacks.delivered(topic[3], message);
      }
    })

    this.mqtt.on('reconnect', function() {
      context.disableSync();
      // call sync once again
      context.synchronize();
      context.synchronizeEvent();
    })
    this.mqtt.on('close', function() {
      context.activateSync();
    })
    this.mqtt.on('error', function() {
      context.activateSync();
    })
  }
  getRoom(roomId) {
    return this.context.rooms
      .find(room => room.id.toString() === roomId.toString());
  }
  getParticipant(room, userId) {
    if(!room) return userId;
    const participant = room.participants.find(p => p.email.toString() === userId.toString())
    return participant ? participant.username : userId;
  }
  subscribe(topic) {
    this.mqtt.subscribe(topic);
  }
  unsubscribe(topic) {
    this.mqtt.unsubscribe(topic);
  }
  subscribeChannel(appId, roomUniqueId) {
    this.subscribe(`${appId}/${roomUniqueId}/c`);
  }
  subscribeTyping(roomId) {
    // console.info('subscribing typing from room ', roomId);
    this.subscribe(`r/${roomId}/${roomId}/+/t`);
    this.subscribe(`r/${roomId}/${roomId}/+/d`);
    this.subscribe(`r/${roomId}/${roomId}/+/r`);
  }
  unsubscribeTyping() {
    // this.unsubscribe(`r/+/+/+/t`);
    if (!this.context.selected) return false;
    const roomId = this.context.selected.id;
    this.unsubscribe(`r/${roomId}/${roomId}/+/t`);
    // titip sekalian untuk read dan delivered
    this.unsubscribe(`r/${roomId}/${roomId}/+/d`);
    this.unsubscribe(`r/${roomId}/${roomId}/+/r`);
  }
  publish(topic, payload, options = {}) {
    this.mqtt.publish(topic, payload.toString(), options);
  }
  subscribeUserChannel(channel) {
    this.subscribe(`${this.context.userData.token}/c`)
    this.subscribe(`${this.context.userData.token}/n`)
  }
  publishPresence(userId){
    this.context.logging('emitting presence status for user', userId);
    this.publish(`u/${userId}/s`, 1, {retain: true});
  }
  subscribeRoomPresence(userId) {
    this.subscribe(`u/${userId}/s`);
  }
  unsubscribeRoomPresence(userId) {
    // ambil semua yang mau di unsubscribe
    this.unsubscribe(`u/${userId}/s`);
    // Object.keys(this.mqtt._subscribedTopics)
    //   .filter(filteredList => filteredList.slice(-2) === '/s')
    //   .forEach(unlist => {
    //     this.unsubscribe(unlist);
    //   })
  }
  publishTyping(status) {
    this.publish(`r/${this.context.selected.id}/${this.context.selected.id}/${this.context.user_id}/t`, status);
  }
}

function handleDeletedEvents(topic, message, context) {
  const parsedMessage = JSON.parse(message);
  if('deleted_messages' in parsedMessage.payload.data) {
    parsedMessage.payload.data.deleted_messages.map(msgRoom => {
      context.emit('comment-deleted', {roomId: msgRoom.room_id, commentUniqueIds: msgRoom.message_unique_ids, isForEveryone: true, isHard: parsedMessage.payload.data.is_hard_delete});
    })
  } else if('deleted_rooms' in parsedMessage.payload.data) {
    // get id of all rooms available
    parsedMessage.payload.data.deleted_rooms.forEach(room => {
      context.emit('room-cleared', room);
    });
  }
}