import Comment from './Comment';
/**
 * Holds chat rooms for qiscus chat sdk
 * 
 * @example
 * let Room = new Room(roomData);
 * @export
 * @class Room
 */
export class Room {
  /**
   * Creates an instance of Room.
   * @param {any} roomData 
   * @param {int} id    Room ID
   * @param {int} last_comment_id      Last comment id
   * @param {string} last_comment_message        
   * @memberof Room
   */
  constructor(roomData) {
    this.id = roomData.id
    this.last_comment_id = roomData.last_comment_id
    this.last_comment_message = roomData.last_comment_message
    this.last_comment_message_created_at = roomData.last_comment_message_created_at
    this.last_comment_topic_title = roomData.last_comment_topic_title
    this.avatar = roomData.room_avatar || roomData.avatarURL || roomData.avatar_url
    this.name = roomData.name
    this.room_type = roomData.room_type
    this.secret_code = roomData.secret_code
    this.participants = roomData.participants
    this.topics = []
    this.comments = []
    this.count_notif = roomData.count_notif
    this.isLoaded = false
    this.code_en = roomData.code_en
    this.unread_comments = []
    this.custom_title = null
    this.custom_subtitle = null
    this.receiveComments(roomData.comments)
  }

  isCurrentlySelected(selected) {
    return this.id == selected.id
  }

  setTitle(title) {
    this.custom_title = title
  }

  setSubTitle(subtitle) {
    this.custom_subtitle = subtitle
  }

  /**
   * Receive a single comment
   * 
   * @param {Comment} comment 
   * @memberof Room
   */
  receiveComment(comment) {
    // let's check first whether this room already has this specific comment
    const commentToFind = this.comments.find(cmt => cmt.unique_id == comment.unique_id);
    if (commentToFind) {
      commentToFind.id = comment.id;
      commentToFind.date = comment.date;
      commentToFind.time = comment.time;
    } else {
      this.comments.push(comment);
    }
  }

  receiveComments(comments) {
    comments.forEach(comment => {
      this.receiveComment(new Comment(comment))
    });
  }

  countUnreadComments() {
    if (this.topics.length == 0) {
      // means that this is not loaded yet, just return the notif
      return this.count_notif
    } else {
      return compose(
        value,
        reduce((totalUnreadComment, unreadComment) => totalUnreadComment + unreadComment, 0),
        map(topic => topic.comment_unread)
      )(this.topics)
    }
  }

  addTopic(Topic) {
    // Check if we got the topic in the list
    let topic = this.getTopic(Topic.id)
    if (topic) {
      // let's update the topic with new data
      topic = Object.assign({}, topic, Topic)
    } else {
      this.topics.push(Topic)
    }
  }

  getTopic(topicId) {
    return find(topic => topic.id === topicId)(this.topics)
  }

  removeTopic(Topic) {
    const index = this.getTopicIndex(Topic.id)
    if (index < 0) return false
    this.topics.splice(index, 1)
  }

  getParticipant(participantEmail) {
    const existingParticipant = find({ email: participantEmail })(this.participants)

    if (existingParticipant) return existingParticipant
    return null
  }

  addParticipant(participant) {
    // get if there's existing participant, if any then push
    let participantToFind = this.getParticipant(participant.email)
    if (!participantToFind) this.participants.push(participant)
  }
}

module.exports = Room;