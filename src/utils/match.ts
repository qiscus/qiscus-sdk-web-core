// @ts-nocheck
// Taken from https://github.com/FGRibreau/match-when/blob/master/match.js
// @ts-ignore
// import Symbol from "es6-symbol";
const _catchAllSymbol = Symbol('match.pattern.catchAll')
const _patternOR = Symbol('match.pattern.OR')
const _patternORStr = _patternOR.toString() // Dirty hack
const _patternAND = Symbol('match.pattern.AND')
const _patternANDStr = _patternAND.toString() // Dirty hack
const _patternRANGE = Symbol('match.pattern.RANGE')
const _patternRANGEStr = _patternRANGE.toString() // Dirty hack

const _patternREGEXP = Symbol('match.pattern.REGEXP')
const _patternREGEXPStr = _patternREGEXP.toString() // Dirty hack
const EXTRACT_PATTERN_AND_FLAGS = /\/(.*)\/(.*)/

function MissingCatchAllPattern() {
  Error.call(
    this,
    'Missing when() catch-all pattern as last match argument, add [when()]: void 0'
  )
  if (!('stack' in this)) {
    this.stack = new Error().stack
  }
}

MissingCatchAllPattern.prototype = Object.create(Error.prototype)

export function match(...args) {
  const obj = args[args.length - 1]

  // Pre-compute matchers
  const matchers = []

  for (const key in obj) {
    matchers.push(when.unserialize(key, obj[key]))
  }

  // Since JS objects are unordered we need to reorder what for..in give us even if the order was already right
  // because it depends on the JS engine implementation. See #2
  matchers.sort((a, b) => {
    return a.position < b.position ? -1 : 1
  })

  // noinspection TypeScriptValidateTypes
  if (Object.getOwnPropertySymbols(obj).indexOf(_catchAllSymbol) !== -1) {
    matchers.push(when.unserialize(_catchAllSymbol, obj[_catchAllSymbol]))
  }

  const calculateResult = function(input) {
    const matched = matchers.find(matcher => matcher.match(input))

    if (!matched) {
      throw new MissingCatchAllPattern()
    }

    return typeof matched.result === 'function'
      ? matched.result(input)
      : matched.result
  }

  return args.length === 2 ? calculateResult(args[0]) : calculateResult
}

export function when(props?: any) {
  if (props === undefined) {
    return _catchAllSymbol
  }

  if (props instanceof RegExp) {
    return _serialize([_patternREGEXP.toString(), props.toString()])
  }

  return _serialize(props)
}

when.__uid = 0

// Any -> String
function _serialize(mixed) {
  return JSON.stringify([when.__uid++, mixed])
}

// String -> [Number, Any]
function _unserialize(str) {
  return JSON.parse(str)
}

function _true() {
  return true
}

// Any -> String
function _match(props) {
  if (Array.isArray(props)) {
    if (props[0] === _patternORStr) {
      props.shift()
      return function(input) {
        return props[0].some(prop => _matching(prop, input))
      }
    }

    if (props[0] === _patternANDStr) {
      props.shift()
      return function(input) {
        return props[0].every(prop => _matching(prop, input))
      }
    }

    if (props[0] === _patternRANGEStr) {
      props.shift()
      return function(input) {
        return props[0] <= input && input <= props[1]
      }
    }

    if (props[0] === _patternREGEXPStr) {
      const res = EXTRACT_PATTERN_AND_FLAGS.exec(props[1])
      return _matching.bind(null, new RegExp(res[1], res[2]))
    }
  }

  function _matching(props, input) {
    // Implement array matching
    if (Array.isArray(input)) {
      // @todo yes this is a quick and dirty way, optimize this
      return JSON.stringify(props) === JSON.stringify(input)
    }

    if (props instanceof RegExp) {
      return props.test(input)
    }

    if (typeof input === 'object') {
      for (const prop in props) {
        if (input[prop] !== props[prop]) {
          return false
        }
      }

      return true
    }

    return props === input
  }

  return input => _matching(props, input)
}

// Mixed -> String
when.or = function(...args) {
  return _serialize([_patternOR.toString(), args])
}

// Mixed -> String
// upcoming...
when.and = function(...args) {
  return _serialize([_patternAND.toString(), args])
}

when.range = function(start, end) {
  return _serialize([_patternRANGE.toString(), start, end])
}

when.unserialize = function(serializedKey, value) {
  if (serializedKey === _catchAllSymbol) {
    return {
      match: _true,
      result: value,
      position: Infinity,
    }
  }

  // Const {position, matcherConfiguration} = _unserialize(serializedKey);
  const deserialized = _unserialize(serializedKey)
  const matcherConfiguration = deserialized[1]
  const position = deserialized[0]

  return {
    match: _match(matcherConfiguration),
    result: value,
    position,
  }
}
