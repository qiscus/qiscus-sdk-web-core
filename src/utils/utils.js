export function searchAndReplace(str, find, replace) {
  return str.split(find).join(replace)
}

export function escapeHTML(text) {
  let comment
  comment = searchAndReplace(text, '<', '&lt;')
  comment = searchAndReplace(comment, '>', '&gt;')
  return comment
}

export class GroupChatBuilder {
  /**
   * Create a group chat room builder.
   * @constructs
   * @param {RoomAdapter} roomAdapter - Room adapter to be used to call backend
   *  API.
   */
  constructor (roomAdapter) {
    this.roomAdapter = roomAdapter
    this.name = null
    this.emails = []
    this.options = {}
  }

  /**
   * Set the room name
   * @param {string} name - Room name
   * @returns {GroupChatBuilder}
   */
  withName(name) {
    this.name = name
    return this
  }

  /**
   * Add an options to this room.
   * @param {object} options - Any data that is `JSON.stringify` able
   * @returns {GroupChatBuilder}
   */
  withOptions(options) {
    this.options = options
    return this
  }

  /**
   * Add more participants to the room.
   * This method use javascript rest operator, which mean you can add as many as
   * you want.
   * eg: addParticipants('email1@gg.com', 'email2@gg.com')
   * @param {string} emails - Email of participant to be added.
   */
  addParticipants(...emails) {
    this.emails = this.emails
      .filter(email => emails.indexOf(email) === -1)
      .concat(...emails)
    return this
  }

  /**
   * Real create group chat room by calling the backend API.
   * @returns {Promise.<Room, Error>}
   */
  create() {
    const name = this.name
    const emails = this.emails
    const options = this.options
    return this.roomAdapter
      .createRoom(name, emails, { avatarURL: options.avatarURL }, options)
  }
}

export function scrollToBottom(latestCommentId) {
  requestAnimationFrame(function () {
    if (latestCommentId > 0) {
      const elementToScroll = document.getElementById(latestCommentId)
      if (!elementToScroll) return false
      elementToScroll.scrollIntoView({ block: 'end', behavior: 'smooth' })
    }
    // on entering the room, wait for data processed then focus on comment form
    document.getElementsByClassName('qcw-comment-form').item(0).getElementsByTagName('textarea').item(0).focus()
  })
}

export class UrlBuilder {
  constructor (baseUrl) {
    this.baseUrl = baseUrl
    this.params = {}
  }

  param(key, value) {
    this.params[key] = value
    return this
  }

  build() {
    const param = Object.keys(this.params)
      .filter(it => this.params[it] != null)
      .map(key => `${key}=${this.params[key]}`)
      .join('&')
    return [this.baseUrl, param].join('?')
  }
}
