import is from 'is_js'
export const every = <T>(...checkers: Array<Function>) => (item: T) => checkers.every(check => check(item))
export const some = <T>(...checkers: Array<Function>) => (item: T) => checkers.some(check => check(item))
export const compose = <T>(msg: string, checker: (it: T) => boolean) => (item: T) => {
  const isFullfiled = checker(item)
  if (isFullfiled) return item
  throw new TypeError(msg)
}

const getName = (item) => Object.keys(item).shift()
const getMsg = (item, msg) => `\`${getName(item)}\` ${msg}`

export const isReqString = (item: any) => {
  const msg = getMsg(item, 'are required and need to be string')
  return compose(msg, every(is.not.null, is.not.undefined, is.string))
}
export const isReqNumber = (item: any) => {
  const msg = getMsg(item, 'are required and need to be number')
  return compose(msg, every(is.not.null, is.not.undefined, is.number))
}
export const isReqJson = (item: any) => {
  const msg = getMsg(item, 'are required and need to be object')
  return compose(msg, every(is.not.null, is.not.undefined, is.json))
}
export const isReqArrayNumber = (item: any) => {
  const msg = getMsg(item, 'are required and need to be array of number')
  return compose(msg, every(is.not.null, is.not.undefined, is.array, is.all.number))
}
export const isReqArrayString = (item: any) => {
  const msg = getMsg(item, 'are required and need to be array of string')
  return compose(msg, every(is.not.null, is.not.undefined, is.array, is.all.string))
}
export const isOptString = (item: any) => {
  const msg = getMsg(item, 'are required and need to be string or null')
  return compose(msg, some(is.null, is.undefined, is.string))
}
export const isOptNumber = (item: any) => {
  const msg = getMsg(item, 'are required and need to be number or null')
  return compose(msg, some(is.null, is.undefined, is.number))
}
export const isOptJson = (item: any) => {
  const msg = getMsg(item, 'are required and need to be object or null')
  return compose(msg, some(is.null, is.undefined, is.json))
}
export const isOptCallback = (item: any) => {
  const msg = getMsg(item, 'are required and need to be function or null')
  return compose(msg, some(is.null, is.undefined, is.function))
}
export const isOptBoolean = (item: any) => {
  const msg = getMsg(item, 'are required and need to be boolean or null')
  return compose(msg, some(is.null, is.undefined, is.boolean))
}
