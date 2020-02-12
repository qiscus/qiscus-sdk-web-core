import is from '@sindresorhus/is'
export const every = <T>(...checkers: Array<Function>) => (item: T) =>
  checkers.every(check => check(item))
export const some = <T>(...checkers: Array<Function>) => (item: T) =>
  checkers.some(check => check(item))
export const compose = <T>(msg: string, checker: (it: T) => boolean) => (
  item: T
) => {
  const isFullfiled = checker(item)
  if (isFullfiled) return item
  throw new TypeError(msg)
}

const getName = (item: Record<string, unknown>) => Object.keys(item).shift()
const getMsg = (item: Record<string, unknown>, msg: unknown) =>
  `\`${getName(item)}\` ${msg}`
const not = <T>(fn: (it: T) => boolean) => (item: T) => !fn(item)
const notNullOrUndefined = not(is.nullOrUndefined)
const allNumber = (item: unknown[]) => is.all(is.number, ...item)
const allString = (item: unknown[]) => is.all(is.string, ...item)

export const isRequired = (item: any) => {
  const msg = getMsg(item, 'are required')
  return compose(msg, notNullOrUndefined)
}
export const isReqString = (item: any) => {
  const msg = getMsg(item, 'are required and need to be string')
  return compose(msg, every(notNullOrUndefined, is.string))
}
export const isReqNumber = (item: any) => {
  const msg = getMsg(item, 'are required and need to be number')
  return compose(msg, every(notNullOrUndefined, is.number))
}
export const isReqBoolean = (item: any) => {
  const msg = getMsg(item, 'are required and need to be boolean')
  return compose(msg, every(notNullOrUndefined, is.boolean))
}
export const isReqJson = (item: any) => {
  const msg = getMsg(item, 'are required and need to be object')
  return compose(msg, every(notNullOrUndefined, is.object))
}
export const isReqArrayNumber = (item: any) => {
  const msg = getMsg(item, 'are required and need to be array of number')
  return compose(msg, every(notNullOrUndefined, is.array, allNumber))
}
export const isReqArrayString = (item: any) => {
  const msg = getMsg(item, 'are required and need to be array of string')
  return compose(msg, every(notNullOrUndefined, is.array, allString))
}
export const isReqArrayOfStringOrNumber = (item: any) => {
  const msg = getMsg(
    item,
    'are required and need to be array of string or array of number'
  )
  return compose(
    msg,
    every(notNullOrUndefined, is.array, some(allNumber, allString))
  )
}
export const isOptArrayNumber = (item: any) => {
  const msg = getMsg(item, 'need to be array of number or null')
  return compose(msg, some(is.nullOrUndefined, is.array, allNumber))
}
export const isOptArrayString = (item: any) => {
  const msg = getMsg(item, 'need to be array of string or null')
  return compose(msg, some(is.nullOrUndefined, is.array, allString))
}
export const isOptString = (item: any) => {
  const msg = getMsg(item, 'need to be string or null')
  return compose(msg, some(is.nullOrUndefined, is.string))
}
export const isOptNumber = (item: any) => {
  const msg = getMsg(item, 'need to be number or null')
  return compose(msg, some(is.nullOrUndefined, is.number))
}
export const isOptJson = (item: any) => {
  const msg = getMsg(item, 'need to be object or null')
  return compose(msg, some(is.nullOrUndefined, is.object))
}
export const isOptCallback = (item: any) => {
  const msg = getMsg(item, 'need to be function or null')
  return compose(msg, some(is.nullOrUndefined, is.function_))
}
export const isOptBoolean = (item: any) => {
  const msg = getMsg(item, 'need to be boolean or null')
  return compose(msg, some(is.nullOrUndefined, is.boolean))
}

export function isArrayOfNumber(ids: number[] | string[]): ids is number[] {
  return is.all(is.truthy, is.array(ids), allNumber(ids))
}
export function isArrayOfString(ids: number[] | string[]): ids is string[] {
  return is.all(is.truthy, is.array(ids), allString(ids))
}
