"use strict";

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = CustomEventAdapter;

var _is_js = _interopRequireDefault(require("is_js"));

var _events = require("events");

function CustomEventAdapter(mqttAdapter, userId) {
  var events = new _events.EventEmitter();
  var subscribedTopics = {};
  var reTopic = /^r\/[\w]+\/[\w]+\/e$/i;
  mqttAdapter.mqtt.on('message', function (topic, payload) {
    if (reTopic.test(topic)) events.emit(topic, payload);
  });

  var getTopic = function getTopic(roomId) {
    return "r/".concat(roomId, "/").concat(roomId, "/e");
  };

  return {
    publishEvent: function publishEvent(roomId, payload) {
      if (_is_js.default.undefined(roomId)) throw new Error('`roomId` required');
      if (_is_js.default.not.string(roomId)) throw new TypeError('`roomId` must have type of string');
      if (_is_js.default.undefined(payload)) throw new Error('`payload` required');
      if (_is_js.default.not.object(payload)) throw new TypeError('`payload` must have type of object');

      var _payload = JSON.stringify({
        sender: userId,
        // ?
        data: payload
      });

      mqttAdapter.mqtt.publish(getTopic(roomId), _payload);
    },
    subscribeEvent: function subscribeEvent(roomId, callback) {
      if (_is_js.default.undefined(roomId)) throw new Error('`roomId` required');
      if (_is_js.default.not.string(roomId)) throw new TypeError('`roomId` must have type of string');
      if (_is_js.default.undefined(callback)) throw new Error('`callback` required');
      if (_is_js.default.not.function(callback)) throw new TypeError('`callback` must have type of function');
      var topic = getTopic(roomId); // Only allow 1 subcription for now

      if (subscribedTopics[topic]) return;
      mqttAdapter.mqtt.subscribe(topic);

      var cb = function cb(payload) {
        var parsedPayload = JSON.parse(payload);
        callback(parsedPayload);
      };

      events.addListener(topic, cb);
      subscribedTopics[topic] = cb;
    },
    unsubscribeEvent: function unsubscribeEvent(roomId) {
      if (_is_js.default.undefined(roomId)) throw new Error('`roomId` required');
      if (_is_js.default.not.string(roomId)) throw new TypeError('`roomId` must have type of string');
      var topic = getTopic(roomId);
      if (!subscribedTopics[topic]) return;
      mqttAdapter.mqtt.unsubscribe(topic);
      events.removeListener(topic, subscribedTopics[topic]);
      subscribedTopics[topic] = null;
      delete subscribedTopics[topic];
    }
  };
}

module.exports = exports.default;