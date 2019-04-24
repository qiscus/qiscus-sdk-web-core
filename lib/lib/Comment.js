"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports["default"] = void 0;

var _classCallCheck2 = _interopRequireDefault(require("@babel/runtime/helpers/classCallCheck"));

var _createClass2 = _interopRequireDefault(require("@babel/runtime/helpers/createClass"));

var _format = _interopRequireDefault(require("date-fns/format"));

var _utils = require("./utils.js");

var Comment =
/*#__PURE__*/
function () {
  function Comment(comment) {
    (0, _classCallCheck2["default"])(this, Comment);
    this.id = comment.id;
    this.before_id = comment.comment_before_id;
    this.message = (0, _utils.escapeHTML)(comment.message);
    this.username_as = comment.username_as || comment.username;
    this.username_real = comment.username_real || comment.email;
    this.date = (0, _format["default"])(comment.timestamp, 'YYYY-MM-DD');
    this.time = (0, _format["default"])(comment.timestamp, 'HH:mm');
    this.timestamp = comment.timestamp;
    this.unique_id = comment.unique_temp_id || comment.unique_id;
    this.avatar = comment.user_avatar_url;
    this.room_id = comment.room_id;
    this.isChannel = comment.is_public_channel;
    this.unix_timestamp = comment.unix_timestamp;
    /* comment status */

    this.is_deleted = comment.is_deleted;
    this.isPending = false;
    this.isFailed = false;
    this.isDelivered = false;
    this.isRead = false;
    this.isSent = false;
    this.attachment = null;
    this.payload = comment.payload;
    this.status = comment.status; // manage comment type

    if (comment.type === 'reply') {
      comment.payload.replied_comment_message = (0, _utils.escapeHTML)(comment.payload.replied_comment_message);
      comment.payload.text = (0, _utils.escapeHTML)(comment.payload.text);
    } // supported comment type text, account_linking, buttons
    // let supported_comment_type = [
    //   'text','account_linking','buttons','reply','system_event','card', 'custom', 'contact_person', 'location',
    //   'carousel'
    // ];


    this.type = comment.type;
    this.subtype = comment.type === 'custom' ? comment.payload.type : null; // comment status
    // comment status

    if (comment.status === 'sent') {
      this.markAsSent();
    } else if (comment.status === 'delivered') {
      this.markAsDelivered();
    } else if (comment.status === 'read') {
      this.markAsRead();
    }

    ;
  }

  (0, _createClass2["default"])(Comment, [{
    key: "isAttachment",
    value: function isAttachment(message) {
      return message.substring(0, '[file]'.length) === '[file]';
    }
  }, {
    key: "isImageAttachment",
    value: function isImageAttachment(message) {
      return this.isAttachment(message) && message.match(/\.(jpg|jpeg|gif|png)/i) != null;
    }
  }, {
    key: "attachUniqueId",
    value: function attachUniqueId(uniqueId) {
      this.unique_id = uniqueId;
    }
  }, {
    key: "getAttachmentURI",
    value: function getAttachmentURI(message) {
      if (!this.isAttachment(message)) return;
      var messageLength = message.length;
      var beginIndex = '[file]'.length;
      var endIndex = messageLength - '[/file]'.length;
      return message.substring(beginIndex, endIndex).trim();
    }
  }, {
    key: "setAttachment",
    value: function setAttachment(attachment) {
      this.attachment = attachment;
    }
  }, {
    key: "markAsPending",
    value: function markAsPending() {
      this.isPending = true;
      this.isDelivered = false;
      this.status = 'pending';
    }
  }, {
    key: "markAsSent",
    value: function markAsSent() {
      this.isSent = true;
      this.isPending = false;
      this.isFailed = false;
      this.status = 'sent';
    }
  }, {
    key: "markAsDelivered",
    value: function markAsDelivered() {
      var _this = this;

      var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

      if (Object.keys(options).length === 0) {
        this.isSent = true;
        this.isRead = false;
        this.isDelivered = true;
        this.status = 'delivered';
        return;
      }

      var participants = options.participants;
      var actorId = options.actor;
      var commentId = options.comment_id;
      var activeActorId = options.activeActorId;
      var actor = participants.find(function (it) {
        return it.email === actorId;
      });

      if (actor) {
        actor.last_comment_received_id = commentId;
        actor.last_comment_received_id_str = commentId;
      } // Get list of participants that has not receive the message
      // excluding current active user


      var unreceivedParticipants = participants.map(function (it) {
        return {
          commentId: it.last_comment_received_id,
          userId: it.email
        };
      }).filter(function (it) {
        return it.userId !== activeActorId;
      }).filter(function (it) {
        return it.commentId < _this.id;
      });

      if (unreceivedParticipants.length === 0) {
        this.isSent = true;
        this.isRead = false;
        this.isDelivered = true;
        this.status = 'delivered';
      }
    }
  }, {
    key: "markAsRead",
    value: function markAsRead() {
      var _this2 = this;

      var options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

      if (Object.keys(options).length === 0) {
        this.isPending = false;
        this.isSent = true;
        this.isDelivered = true;
        this.isRead = true;
        this.status = 'read';
        return;
      }

      var participants = options.participants;
      var actorId = options.actor;
      var commentId = options.comment_id;
      var actor = participants.find(function (p) {
        return p.email === actorId;
      });

      if (actorId != null) {
        actor.last_comment_read_id = commentId;
        actor.last_comment_read_id_str = commentId.toString();
        actor.last_comment_received_id = commentId;
        actor.last_comment_received_id_str = commentId.toString();
      } // Get list of participants that has not read the message
      // excluding current active user


      var unreadParticipants = participants.map(function (it) {
        return {
          commentId: it.last_comment_read_id,
          userId: it.email
        };
      }).filter(function (it) {
        return it.userId !== options.activeActorId;
      }).filter(function (it) {
        return it.commentId < _this2.id;
      }); // If all participants already read the message, mark message as read

      if (unreadParticipants.length === 0) {
        this.isPending = false;
        this.isSent = true;
        this.isDelivered = true;
        this.isRead = true;
        this.status = 'read';
      }
    }
  }, {
    key: "markAsFailed",
    value: function markAsFailed() {
      this.isFailed = true;
      this.isPending = false;
      this.isStatus = 'failed';
    } // usually called when there's new comment with the same id
    // we just need to update its content

  }, {
    key: "update",
    value: function update(data) {
      // update properties that usually change
      this.id = data.id;
      this.before_id = data.comment_before_id;
      this.message = (0, _utils.escapeHTML)(data.message);
      /* comment status */

      if (data.payload) this.payload = data.payload;
      if (data.status) this.status = data.status; // manage comment type

      if (data.type === 'reply') {
        this.payload.replied_comment_message = (0, _utils.escapeHTML)(data.payload.replied_comment_message);
        this.payload.text = (0, _utils.escapeHTML)(data.payload.text);
      } // comment status


      if (data.status === 'sent') {
        this.markAsSent();
      } else if (data.status === 'delivered') {
        this.markAsDelivered();
      } else if (data.status === 'read') {
        this.markAsRead();
      }

      ;
    }
  }]);
  return Comment;
}();

var _default = Comment;
exports["default"] = _default;
module.exports = exports.default;