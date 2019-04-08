"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.searchAndReplace = searchAndReplace;
exports.escapeHTML = escapeHTML;
exports.scrollToBottom = scrollToBottom;
exports.GroupChatBuilder = void 0;

var _classCallCheck2 = _interopRequireDefault(require("@babel/runtime/helpers/classCallCheck"));

var _createClass2 = _interopRequireDefault(require("@babel/runtime/helpers/createClass"));

function searchAndReplace(str, find, replace) {
  return str.split(find).join(replace);
}

function escapeHTML(text) {
  var comment;
  comment = searchAndReplace(text, '<', '&lt;');
  comment = searchAndReplace(comment, '>', '&gt;');
  return comment;
}

var GroupChatBuilder =
/*#__PURE__*/
function () {
  /**
   * Create a group chat room builder.
   * @constructs
   * @param {RoomAdapter} roomAdapter - Room adapter to be used to call backend
   *  API.
   */
  function GroupChatBuilder(roomAdapter) {
    (0, _classCallCheck2.default)(this, GroupChatBuilder);
    this.roomAdapter = roomAdapter;
    this.name = null;
    this.emails = [];
    this.options = {};
  }
  /**
   * Set the room name
   * @param {string} name - Room name
   * @returns {GroupChatBuilder}
   */


  (0, _createClass2.default)(GroupChatBuilder, [{
    key: "withName",
    value: function withName(name) {
      this.name = name;
      return this;
    }
    /**
     * Add an options to this room.
     * @param {object} options - Any data that is `JSON.stringify` able
     * @returns {GroupChatBuilder}
     */

  }, {
    key: "withOptions",
    value: function withOptions(options) {
      this.options = options;
      return this;
    }
    /**
     * Add more participants to the room.
     * This method use javascript rest operator, which mean you can add as many as
     * you want.
     * eg: addParticipants('email1@gg.com', 'email2@gg.com')
     * @param {string} emails - Email of participant to be added.
     */

  }, {
    key: "addParticipants",
    value: function addParticipants() {
      var _this$emails$filter;

      for (var _len = arguments.length, emails = new Array(_len), _key = 0; _key < _len; _key++) {
        emails[_key] = arguments[_key];
      }

      this.emails = (_this$emails$filter = this.emails.filter(function (email) {
        return emails.indexOf(email) === -1;
      })).concat.apply(_this$emails$filter, emails);
      return this;
    }
    /**
     * Real create group chat room by calling the backend API.
     * @returns {Promise.<Room, Error>}
     */

  }, {
    key: "create",
    value: function create() {
      var name = this.name;
      var emails = this.emails;
      var options = this.options;
      return this.roomAdapter.createRoom(name, emails, {}, options);
    }
  }]);
  return GroupChatBuilder;
}();

exports.GroupChatBuilder = GroupChatBuilder;

function scrollToBottom(latestCommentId) {
  requestAnimationFrame(function () {
    if (latestCommentId > 0) {
      var elementToScroll = document.getElementById(latestCommentId);
      if (!elementToScroll) return false;
      elementToScroll.scrollIntoView({
        block: 'end',
        behavior: 'smooth'
      });
    } // on entering the room, wait for data processed then focus on comment form


    document.getElementsByClassName('qcw-comment-form').item(0).getElementsByTagName('textarea').item(0).focus();
  });
}