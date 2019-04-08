"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = exports.Room = void 0;

var _classCallCheck2 = _interopRequireDefault(require("@babel/runtime/helpers/classCallCheck"));

var _createClass2 = _interopRequireDefault(require("@babel/runtime/helpers/createClass"));

var _Comment = _interopRequireDefault(require("./Comment"));

/**
 * Holds chat rooms for qiscus chat sdk
 *
 * @example
 * let Room = new Room(roomData);
 * @export
 * @class Room
 */
var Room =
/*#__PURE__*/
function () {
  /**
   * Creates an instance of Room.
   * @param {any} roomData
   * @param {int} id    Room ID
   * @param {int} last_comment_id      Last comment id
   * @param {string} last_comment_message
   * @memberof Room
   */
  function Room(roomData) {
    (0, _classCallCheck2.default)(this, Room);
    this.id = roomData.id;
    this.last_comment_id = roomData.last_comment_id;
    this.last_comment_message = roomData.last_comment_message;
    this.last_comment_message_created_at = roomData.last_comment_message_created_at;
    this.last_comment_topic_title = roomData.last_comment_topic_title;
    this.avatar = roomData.room_avatar || roomData.avatarURL || roomData.avatar_url;
    this.name = roomData.room_name;
    this.room_type = roomData.room_type || roomData.chat_type;
    this.secret_code = roomData.secret_code;
    this.participants = roomData.participants;
    this.options = roomData.options;
    this.topics = [];
    this.comments = [];
    this.count_notif = roomData.unread_count;
    this.isLoaded = false;
    this.unread_comments = [];
    this.custom_title = null;
    this.custom_subtitle = null;
    this.options = roomData.options;
    this.unique_id = roomData.unique_id;
    this.isChannel = roomData.is_public_channel;
    this.participantNumber = roomData.room_total_participants;
    if (roomData.comments) this.receiveComments(roomData.comments);
  }

  (0, _createClass2.default)(Room, [{
    key: "isCurrentlySelected",
    value: function isCurrentlySelected(selected) {
      return this.id === selected.id;
    }
  }, {
    key: "getParticipantCount",
    value: function getParticipantCount() {
      if (this.participants == null) {
        return this.participantNumber;
      } else {
        return this.participants.length;
      }
    }
  }, {
    key: "setTitle",
    value: function setTitle(title) {
      this.custom_title = title;
    }
  }, {
    key: "setSubTitle",
    value: function setSubTitle(subtitle) {
      this.custom_subtitle = subtitle;
    }
    /**
     * Receive a single comment
     *
     * @param {Comment} comment
     * @memberof Room
     */

  }, {
    key: "receiveComment",
    value: function receiveComment(comment) {
      // let's check first whether this room already has this specific comment
      var commentToFind = this.comments.find(function (cmt) {
        return cmt.unique_id === comment.unique_id;
      });

      if (commentToFind) {
        commentToFind.id = comment.id;
        commentToFind.message = comment.message;
        commentToFind.date = comment.date;
        commentToFind.time = comment.time;
        commentToFind.unix_timestamp = comment.unix_timestamp;
      } else {
        this.comments.push(comment);
      }
    }
  }, {
    key: "receiveComments",
    value: function receiveComments(comments) {
      var _this = this;

      comments.forEach(function (comment) {
        _this.receiveComment(new _Comment.default(comment));
      });
    }
  }, {
    key: "getParticipant",
    value: function getParticipant(participantEmail) {
      return this.participants.find(function (p) {
        return p.email === participantEmail;
      }) || null;
    }
  }, {
    key: "addParticipant",
    value: function addParticipant(participant) {
      // get if there's existing participant, if any then push
      var participantToFind = this.getParticipant(participant.email);
      if (!participantToFind) this.participants.push(participant);
    }
  }]);
  return Room;
}();

exports.Room = Room;
var _default = Room;
exports.default = _default;