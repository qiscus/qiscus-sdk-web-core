import mqtt from 'mqtt';
import {format} from 'date-fns';

export default class MqttAdapter {
  constructor(url, callbacks, context) {
    const self = this;
    this.context = context;
    this.mqtt = mqtt.connect(url, {
      will: {
        topic: `u/${self.context.userData.email}/s`,
        payload: `0:${format(new Date(), 'x')}`,
        retain: true
      }
    })
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
        if (presencePayload[1].length > 13) return;
        self.context.emit('presence', message);
      } else if(topic[0] == 'r' && topic[4] == 't') {
        // it's a typing message
        self.context.emit('typing', {
          message,
          username:topic[3], 
          room_id: topic[1]
        });
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
  publish(topic, payload) {
    this.mqtt.publish(topic, payload);
  }
  subscribeUserChannel(channel) {
    this.subscribe(`${this.context.userData.token}/c`)
  }
  publishPresence(unique_id){
    this.publish(`u/${unique_id}/s`, `1:${format(new Date(), 'x')}`)
  }
  publishTyping(status) {
    this.publish(`r/${this.context.selected.id}/${this.context.selected.last_comment_topic_id}/${this.context.userdata.email}/t`, status);
  }
}