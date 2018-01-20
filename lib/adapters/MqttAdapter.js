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
    console.log('connect mqtt');
    this.mqtt.on('message', function(topic, message) {
      // set the message to readable string
      message = message.toString();
      topic = topic.split("/");
      console.info('incoming message', topic, message);
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
        self.context.emit('typing', {
          message,
          username:topic[3], 
          room_id: topic[1]
        });
        // if (self.context.selected.id == topic[1]) self.context.isTypingStatus = `${topic[3]} is typing ...`;
        console.info(topic[3], 'typing ...');
        self.context.isTypingStatus = `${topic[3]} is typing ...`;
      } else if(topic[0] == 'r' && topic[4] == 'r') {
        // it's a read event
        // find the comment that need to be altered
        const commentToFind = self.context.selected.comments.find(selectedComment => {
          return (
            message.unique_temp_id
              ? selectedComment.unique_id === message.unique_temp_id
              : selectedComment.id === message.id
          )
        })
        if (commentToFind){
          commentToFind.markAsRead()
        }
        self.context.emit('comment-read', {
          room: topic[3],
          message
        })
      } else if(topic[0] == 'r' && topic[4] == 'd') {
        // it's a delivered event
        // find the comment that need to be altered
        const commentToFind = self.context.selected.comments.find(selectedComment => {
          return (
            message.unique_temp_id
              ? selectedComment.unique_id === message.unique_temp_id
              : selectedComment.id === message.id
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
    this.mqtt.on('offline', function() {
      // context.activateSync();
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
  }
  unsubscribeTyping() {
    this.unsubscribe(`r/+/+/+/t`);
  }
  publish(topic, payload, options = {}) {
    this.mqtt.publish(topic, payload, options);
  }
  subscribeUserChannel(channel) {
    this.subscribe(`${this.context.userData.token}/c`)
  }
  publishPresence(userId){
    this.publish(`u/${userId}/s`, 1, {retain: true});
  }
  publishTyping(status) {
    this.publish(`r/${this.context.selected.id}/${this.context.selected.last_comment_topic_id}/${this.context.user_id}/t`, status);
  }
}