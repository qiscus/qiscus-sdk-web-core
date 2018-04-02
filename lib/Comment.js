import {format} from 'date-fns';
import {escapeHTML} from './utils.js';

class Comment {

  constructor (comment) {
    this.id                    = comment.id
    this.before_id             = comment.comment_before_id
    this.message               = escapeHTML(comment.message)
    this.username_as           = comment.username_as || comment.username
    this.username_real         = comment.username_real || comment.email
    this.date                  = format(comment.timestamp, 'YYYY-MM-DD')
    this.time                  = format(comment.timestamp, 'HH:mm A')
    this.timestamp             = comment.timestamp
    this.unique_id             = comment.unique_temp_id || comment.unique_id
    this.avatar                = comment.user_avatar_url
    this.room_id               = comment.room_id
    /* comment status */
    this.is_deleted            = comment.is_deleted
    this.isPending             = false
    this.isFailed              = false
    this.isDelivered           = false
    this.isRead                = false
    this.isSent                = false
    this.attachment            = null
    this.payload               = comment.payload
    this.status                = comment.status

    // manage comment type
    if(comment.type === 'reply') {
      comment.payload.replied_comment_message = escapeHTML(comment.payload.replied_comment_message);
      comment.payload.text = escapeHTML(comment.payload.text);
    }

    // supported comment type text, account_linking, buttons
    // let supported_comment_type = [
    //   'text','account_linking','buttons','reply','system_event','card', 'custom', 'contact_person', 'location',
    //   'carousel'
    // ];
    this.type = comment.type;
    this.subtype = (comment.type === 'custom') ? comment.payload.type : null;
    // comment status
    // comment status
    if(comment.status == 'sent') {
      this.markAsSent();
    } else if (comment.status == 'delivered') {
      this.markAsDelivered();
    } else if (comment.status == 'read') {
      this.markAsRead();
    };
  }
  isAttachment (message) {
    return (message.substring(0, '[file]'.length) == '[file]')
  }
  isImageAttachment (message) {
    return (this.isAttachment(message) && message.match(/\.(jpg|jpeg|gif|png)/i) != null)
  }
  attachUniqueId (unique_id) {
    this.unique_id = unique_id
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
  }
  markAsSent () {
    this.isSent = true
    this.isPending = false
    this.isFailed = false
  }
  markAsDelivered () {
    this.isSent = true
    this.isRead = false
    this.isDelivered = true
  }
  markAsRead () {
    this.isPending = false
    this.isSent = true
    this.isDelivered = true
    this.isRead = true
  }
  markAsFailed () {
    this.isFailed = true
    this.isPending = false
  }
  // usually called when there's new comment with the same id
  // we just need to update its content
  update(data) {
    // update properties that usually change
    this.id                    = data.id
    this.before_id             = data.comment_before_id
    this.message               = escapeHTML(data.message)
    /* comment status */
    if(data.payload) this.payload = data.payload
    if(data.status) this.status = data.status

    // manage comment type
    if(data.type === 'reply') {
      this.payload.replied_comment_message = escapeHTML(data.payload.replied_comment_message);
      this.payload.text = escapeHTML(comment.payload.text);
    }

    // comment status
    if(data.status == 'sent') {
      this.markAsSent();
    } else if (data.status == 'delivered') {
      this.markAsDelivered();
    } else if (data.status == 'read') {
      this.markAsRead();
    };
  }
}

export default Comment;