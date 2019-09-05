import { format } from 'date-fns'
import { escapeHTML } from './utils.js'

class Comment {
  constructor (comment) {
    this.id = comment.id
    this.before_id = comment.comment_before_id
    this.message = escapeHTML(comment.message)
    this.username_as = comment.username_as || comment.username
    this.username_real = comment.username_real || comment.email
    this.date = format(comment.timestamp, 'YYYY-MM-DD')
    this.time = format(comment.timestamp, 'HH:mm')
    this.timestamp = comment.timestamp
    this.unique_id = comment.unique_temp_id || comment.unique_id
    this.avatar = comment.user_avatar_url
    this.room_id = comment.room_id
    this.isChannel = comment.is_public_channel
    this.unix_timestamp = comment.unix_timestamp
    /* comment status */
    this.is_deleted = comment.is_deleted
    this.isPending = false
    this.isFailed = false
    this.isDelivered = false
    this.isRead = false
    this.isSent = false
    this.attachment = null
    this.payload = comment.payload
    this.status = comment.status

    // manage comment type
    if (comment.type === 'reply') {
      comment.payload.replied_comment_message = escapeHTML(comment.payload.replied_comment_message)
      comment.payload.text = escapeHTML(comment.payload.text)
    }

    // supported comment type text, account_linking, buttons
    // let supported_comment_type = [
    //   'text','account_linking','buttons','reply','system_event','card', 'custom', 'contact_person', 'location',
    //   'carousel'
    // ];
    this.type = comment.type
    this.subtype = (comment.type === 'custom') ? comment.payload.type : null
    // comment status
    // comment status
    if (comment.status === 'sent') {
      this.markAsSent()
    } else if (comment.status === 'delivered') {
      this.markAsDelivered()
    } else if (comment.status === 'read') {
      this.markAsRead()
    };
  }
  isAttachment (message) {
    return (message.substring(0, '[file]'.length) === '[file]')
  }
  isImageAttachment (message) {
    return (this.isAttachment(message) && message.match(/\.(jpg|jpeg|gif|png)/i) != null)
  }
  attachUniqueId (uniqueId) {
    this.unique_id = uniqueId
  }
  getAttachmentURI (message) {
    if (!this.isAttachment(message)) return
    const messageLength = message.length
    const beginIndex = '[file]'.length
    const endIndex = messageLength - '[/file]'.length
    return message.substring(beginIndex, endIndex).trim()
  }
  setAttachment (attachment) {
    this.attachment = attachment
  }
  markAsPending () {
    this.isPending = true
    this.isDelivered = false
    this.status = 'pending'
  }
  markAsSent () {
    this.isSent = true
    this.isPending = false
    this.isFailed = false
    this.status = 'sent'
  }
  markAsDelivered (options = {}) {
    if (Object.keys(options).length === 0) {
      this.isSent = true
      this.isRead = false
      this.isDelivered = true
      this.status = 'delivered'
      return
    }

    const participants = options.participants
    const actorId = options.actor
    const commentId = options.comment_id
    const activeActorId = options.activeActorId

    const actor = participants.find(it => it.email === actorId)

    if (actor) {
      actor.last_comment_received_id = commentId
      actor.last_comment_received_id_str = commentId
    }

    // Get list of participants that has not receive the message
    // excluding current active user
    const unreceivedParticipants = participants
      .map((it) => ({
        commentId: it.last_comment_received_id,
        userId: it.email
      }))
      .filter(it => it.userId !== activeActorId)
      .filter(it => it.commentId < this.id)

    if (unreceivedParticipants.length === 0) {
      this.isSent = true
      this.isRead = false
      this.isDelivered = true
      this.status = 'delivered'
    }
  }
  markAsRead (options = {}) {
    if (Object.keys(options).length === 0) {
      this.isPending = false
      this.isSent = true
      this.isDelivered = true
      this.isRead = true
      this.status = 'read'
      return
    }

    const participants = options.participants
    const actorId = options.actor
    const commentId = options.comment_id
    const activeActorId = options.activeActorId

    const actor = participants.find(p => p.email === actorId)
    if (actor != null) {
      actor.last_comment_read_id = commentId
      actor.last_comment_read_id_str = commentId.toString()
      actor.last_comment_received_id = commentId
      actor.last_comment_received_id_str = commentId.toString()
    }

    if (activeActorId === actorId) return

    // Get list of participants that has not read the message
    // excluding current active user
    const unreadParticipants = participants
      .map(it => ({
        commentId: it.last_comment_read_id,
        userId: it.email
      }))
      .filter(it => it.userId !== options.activeActorId)
      .filter(it => it.commentId < this.id)

    // If all participants already read the message, mark message as read
    if (unreadParticipants.length === 0) {
      this.isPending = false
      this.isSent = true
      this.isDelivered = true
      this.isRead = true
      this.status = 'read'
    }
  }
  markAsFailed () {
    this.isFailed = true
    this.isPending = false
    this.isStatus = 'failed'
  }
  // usually called when there's new comment with the same id
  // we just need to update its content
  update (data) {
    // update properties that usually change
    this.id = data.id
    this.before_id = data.comment_before_id
    this.message = escapeHTML(data.message)
    /* comment status */
    if (data.payload) this.payload = data.payload
    if (data.status) this.status = data.status

    // manage comment type
    if (data.type === 'reply') {
      this.payload.replied_comment_message = escapeHTML(data.payload.replied_comment_message)
      this.payload.text = escapeHTML(data.payload.text)
    }

    // comment status
    if (data.status === 'sent') {
      this.markAsSent()
    } else if (data.status === 'delivered') {
      this.markAsDelivered()
    } else if (data.status === 'read') {
      this.markAsRead()
    };
  }
}

export default Comment
