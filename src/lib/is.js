// Minimal internal replacement for the `is_js` package.
//
// We only port the handful of type predicates the SDK actually uses, with the
// exact same semantics as `is_js@0.9.0`. The prototype-pollution surface of
// is_js (CVE-2020-26302) lives in unused helpers (`propertyDefined`,
// `propertyCount`, the regex-namespace plumbing), which are intentionally not
// reimplemented here.

const toString = Object.prototype.toString

const is = {}

is.array = Array.isArray
is.undefined = (value) => value === undefined
is.string = (value) => toString.call(value) === '[object String]'
is.object = (value) => Object(value) === value
is['function'] = (value) =>
  toString.call(value) === '[object Function]' || typeof value === 'function'
is.json = (value) => toString.call(value) === '[object Object]'

is.not = {
  array: (value) => !is.array(value),
  string: (value) => !is.string(value),
  object: (value) => !is.object(value),
  function: (value) => !is['function'](value),
  json: (value) => !is.json(value),
}

export default is
