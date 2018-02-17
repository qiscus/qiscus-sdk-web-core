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
      // set the message to readable string
      message = message.toString();
      topic = topic.split("/");
      // set event handler
      if(topic.length == 2) {
        // it's a comment message -> {token}/c
        self.context.emit('newmessages', [JSON.parse(message)]);
      } else if(topic.length == 3) {
        // it's a user status message -> u/{user}/s
        const presencePayload = message.split(":");
        self.context.emit('presence', message);
      } else if(topic[0] == 'r' && topic[4] == 't') {
        // it's a typing message
        if (topic[3] != self.context.user_id){
           self.context.emit('typing', {
             message,
             username:topic[3], 
             room_id: topic[1]
           });
           // if (self.context.selected.id == topic[1]) self.context.isTypingStatus = `${topic[3]} is typing ...`;
           if(message == "1"){
             // ambil dulu usernya
             const participantIndex = self.context.selected.participants.findIndex(p => p.email === topic[3]);
             if (participantIndex < 0) return;
             const username = self.context.selected.participants[participantIndex].username;
           	 self.context.isTypingStatus = `${username} is typing ...`;
           } else {
           	self.context.isTypingStatus = null;
           }
	      }
      } else if(topic[0] == 'r' && topic[4] == 'r') {
        // it's a read event
        // find the comment that need to be altered
        const commentToFind = self.context.selected.comments.find(selectedComment => {
          return (
            message.split(":")[1]
              ? selectedComment.unique_id === message.split(":")[1]
              : selectedComment.id === message.split(":")[0]
          )
        })
        if (commentToFind) {
          if(topic[3] == commentToFind.username_real) return false;
          commentToFind.markAsRead()
          self.context.emit('comment-read', {
            room: topic[3],
            message
          })
        }
      } else if(topic[0] == 'r' && topic[4] == 'd') {
        // it's a delivered event
        // find the comment that need to be altered
        const commentToFind = self.context.selected.comments.find(selectedComment => {
          return (
            message.split(":")[1]
              ? selectedComment.unique_id === message.split(":")[1]
              : selectedComment.id === message.split(":")[0]
          )
        })
        if (commentToFind){
          commentToFind.markAsDelivered()
        }
        self.context.emit('comment-delivered', {
          room: topic[3],
          message
        })
        // callbacks.delivered(topic[3], message);
      }
    })
    this.mqtt.on('reconnect', function() {
      context.disableSync();
    })
    this.mqtt.on('offline', function() {
      context.activateSync();
    })
  }
  subscribe(topic) {
    this.mqtt.subscribe(topic);
  }
  unsubscribe(topic) {
    this.mqtt.unsubscribe(topic);
  }
  subscribeTyping(roomId) {
    // console.info('subscribing typing from room ', roomId);
    this.subscribe(`r/${roomId}/${roomId}/+/t`);
    this.subscribe(`r/${roomId}/${roomId}/+/d`);
    this.subscribe(`r/${roomId}/${roomId}/+/r`);
  }
  unsubscribeTyping() {
    // this.unsubscribe(`r/+/+/+/t`);
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
  }
  publishPresence(userId){
    this.publish(`u/${userId}/s`, 1, {retain: true});
  }
  subscribeRoomPresence(userId) {
    this.subscribe(`u/${userId}/s`);
  }
  unsubscribeRoomPresence(userId) {
    this.unsubscribe('u/${userId}/s');
  }
  publishTyping(status) {
    this.publish(`r/${this.context.selected.id}/${this.context.selected.id}/${this.context.user_id}/t`, status);
  }
}
