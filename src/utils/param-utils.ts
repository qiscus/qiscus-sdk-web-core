import { IQCallback1, IQCallback2 } from 'defs'
import is from 'is_js'
export const every = <T>(...checkers: Array<Function>) => (item: T) =>
  checkers.every((check) => check(item))
export const some = <T>(...checkers: Array<Function>) => (item: T) =>
  checkers.some((check) => check(item))
export const compose = <T>(msg: string, checker: (it: T) => boolean) => (
  item: T
) => {
  const isFullfiled = checker(item)
  if (isFullfiled) return item
  throw new TypeError(msg)
}

const getName = (item: string) => Object.keys(item).shift()
const getMsg = (item: string, msg: string) => `\`${getName(item)}\` ${msg}`

export const isRequired = (item: any) => {
  const msg = getMsg(item, 'are required')
  return compose(msg, every(is.not.null, is.not.undefined))
}
export const isReqString = (item: any) => {
  const msg = getMsg(item, 'are required and need to be string')
  return compose(msg, every(is.not.null, is.not.undefined, is.string))
}
export const isReqNumber = (item: any) => {
  const msg = getMsg(item, 'are required and need to be number')
  return compose(msg, every(is.not.null, is.not.undefined, is.number))
}
export const isReqBoolean = (item: any) => {
  const msg = getMsg(item, 'are required and need to be boolean')
  return compose(msg, every(is.not.null, is.not.undefined, is.boolean))
}
export const isReqJson = (item: any) => {
  const msg = getMsg(item, 'are required and need to be object')
  return compose(msg, every(is.not.null, is.not.undefined, is.json))
}
export const isReqArrayNumber = (item: any) => {
  const msg = getMsg(item, 'are required and need to be array of number')
  return compose(
    msg,
    every(is.not.null, is.not.undefined, is.array, is.all.number)
  )
}
export const isReqArrayString = (item: any) => {
  const msg = getMsg(item, 'are required and need to be array of string')
  return compose(
    msg,
    every(is.not.null, is.not.undefined, is.array, is.all.string)
  )
}
export const isReqArrayOfStringOrNumber = (item: any) => {
  const msg = getMsg(
    item,
    'are required and need to be array of string or array of number'
  )
  return compose(
    msg,
    every(
      is.not.null,
      is.not.undefined,
      is.array,
      some(is.all.number, is.all.string)
    )
  )
}
export const isOptArrayNumber = (item: any) => {
  const msg = getMsg(item, 'need to be array of number or null')
  // return compose(msg, some(is.null, is.undefined, is.array, is.all.number))
  return compose(msg, some(is.null, is.undefined, every(is.not.null, is.not.undefined, is.array, is.all.number,)))
}
export const isOptArrayString = (item: any) => {
  const msg = getMsg(item, 'need to be array of string or null')
  return compose(msg, some(is.null, is.undefined, every(is.not.null, is.not.undefined, is.array, is.all.string)))
}
export const isOptString = (item: any) => {
  const msg = getMsg(item, 'need to be string or null')
  return compose(msg, some(is.null, is.undefined, is.string))
}
export const isOptNumber = (item: any) => {
  const msg = getMsg(item, 'need to be number or null')
  return compose(msg, some(is.null, is.undefined, is.number))
}
export const isOptJson = (item: any) => {
  const msg = getMsg(item, 'need to be object or null')
  return compose(msg, some(is.null, is.undefined, is.json))
}
export const isOptCallback = (item: any) => {
  const msg = getMsg(item, 'need to be function or null')
  return compose(msg, some(is.null, is.undefined, is.function))
}
export const isOptBoolean = (item: any) => {
  const msg = getMsg(item, 'need to be boolean or null')
  return compose(msg, some(is.null, is.undefined, is.boolean))
}

export function isArrayOfNumber(ids: number[] | string[]): ids is number[] {
  return is.all.truthy(is.array(ids), is.all.number(ids))
}
export function isArrayOfString(ids: number[] | string[]): ids is string[] {
  return is.all.truthy(is.array(ids), is.all.string(ids))
}
export function isCallback1<T = unknown>(
  cb: IQCallback1 | IQCallback2<T>
): cb is IQCallback1 {
  return cb.length === 1
}
export function isCallback2<T = unknown>(
  cb: IQCallback1 | IQCallback2<T>
): cb is IQCallback2<T> {
  return cb.length === 2
}
