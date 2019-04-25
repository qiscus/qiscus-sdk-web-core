// Taken from https://github.com/FGRibreau/match-when/blob/master/match.js
'use strict';

var _interopRequireDefault = require("@babel/runtime/helpers/interopRequireDefault");

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.match = match;
exports.when = when;

var _typeof2 = _interopRequireDefault(require("@babel/runtime/helpers/typeof"));

var _catchAllSymbol = Symbol('match.pattern.catchAll');

var _patternOR = Symbol('match.pattern.OR');

var _patternORStr = _patternOR.toString(); // dirty hack


var _patternAND = Symbol('match.pattern.AND');

var _patternANDStr = _patternAND.toString(); // dirty hack


var _patternRANGE = Symbol('match.pattern.RANGE');

var _patternRANGEStr = _patternRANGE.toString(); // dirty hack


var _patternREGEXP = Symbol('match.pattern.REGEXP');

var _patternREGEXPStr = _patternREGEXP.toString(); // dirty hack


var EXTRACT_PATTERN_AND_FLAGS = /\/(.*)\/(.*)/;

function MissingCatchAllPattern() {
  Error.call(this, 'Missing when() catch-all pattern as last match argument, add [when()]: void 0');

  if (!('stack' in this)) {
    this.stack = new Error().stack;
  }
}

MissingCatchAllPattern.prototype = Object.create(Error.prototype);

function match() {
  var _ref;

  var obj = (_ref = arguments.length - 1, _ref < 0 || arguments.length <= _ref ? undefined : arguments[_ref]); // pre-compute matchers

  var matchers = [];

  for (var key in obj) {
    matchers.push(when.unserialize(key, obj[key]));
  } // since JS objects are unordered we need to reorder what for..in give us even if the order was already right
  // because it depends on the JS engine implementation. See #2


  matchers.sort(function (a, b) {
    return a.position < b.position ? -1 : 1;
  });

  if (Object.getOwnPropertySymbols(obj).indexOf(_catchAllSymbol) !== -1) {
    matchers.push(when.unserialize(_catchAllSymbol, obj[_catchAllSymbol]));
  }

  var calculateResult = function calculateResult(input) {
    var matched = matchers.find(function (matcher) {
      return matcher.match(input);
    });

    if (!matched) {
      throw new MissingCatchAllPattern();
    }

    return typeof matched.result === 'function' ? matched.result(input) : matched.result;
  };

  return arguments.length === 2 ? calculateResult(arguments.length <= 0 ? undefined : arguments[0]) : calculateResult;
}

function when(props) {
  if (props === undefined) {
    return _catchAllSymbol;
  }

  if (props instanceof RegExp) {
    return _serialize([_patternREGEXP.toString(), props.toString()]);
  }

  return _serialize(props);
}

when.__uid = 0; // Any -> String

function _serialize(mixed) {
  return JSON.stringify([when.__uid++, mixed]);
} // String -> [Number, Any]


function _unserialize(str) {
  return JSON.parse(str);
}

function _true() {
  return true;
} // Any -> String


function _match(props) {
  if (Array.isArray(props)) {
    if (props[0] === _patternORStr) {
      props.shift();
      return function (input) {
        return props[0].some(function (prop) {
          return _matching(prop, input);
        });
      };
    }

    if (props[0] === _patternANDStr) {
      props.shift();
      return function (input) {
        return props[0].every(function (prop) {
          return _matching(prop, input);
        });
      };
    }

    if (props[0] === _patternRANGEStr) {
      props.shift();
      return function (input) {
        return props[0] <= input && input <= props[1];
      };
    }

    if (props[0] === _patternREGEXPStr) {
      var res = EXTRACT_PATTERN_AND_FLAGS.exec(props[1]);
      return _matching.bind(null, new RegExp(res[1], res[2]));
    }
  }

  function _matching(props, input) {
    // implement array matching
    if (Array.isArray(input)) {
      // @todo yes this is a quick and dirty way, optimize this
      return JSON.stringify(props) === JSON.stringify(input);
    }

    if (props instanceof RegExp) {
      return props.test(input);
    }

    if ((0, _typeof2.default)(input) === 'object') {
      for (var prop in props) {
        if (input[prop] !== props[prop]) {
          return false;
        }
      }

      return true;
    }

    return props === input;
  }

  return function (input) {
    return _matching(props, input);
  };
} // mixed -> String


when.or = function () {
  for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
    args[_key] = arguments[_key];
  }

  return _serialize([_patternOR.toString(), args]);
}; // mixed -> String
// upcoming...


when.and = function () {
  for (var _len2 = arguments.length, args = new Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
    args[_key2] = arguments[_key2];
  }

  return _serialize([_patternAND.toString(), args]);
};

when.range = function (start, end) {
  return _serialize([_patternRANGE.toString(), start, end]);
};

when.unserialize = function (serializedKey, value) {
  if (serializedKey === _catchAllSymbol) {
    return {
      match: _true,
      result: value,
      position: Infinity
    };
  } // const {position, matcherConfiguration} = _unserialize(serializedKey);


  var deserialized = _unserialize(serializedKey);

  var matcherConfiguration = deserialized[1];
  var position = deserialized[0];
  return {
    match: _match(matcherConfiguration),
    result: value,
    position: position
  };
};