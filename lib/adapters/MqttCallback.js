export default {
  typing: function(topic, message){
    vStore.dispatch('setTyping', {topic, message});
  },
  read: function(topic, message) {
    vStore.dispatch('setRead', {topic, message});
  },
  delivered: function(topic, message) {}
}