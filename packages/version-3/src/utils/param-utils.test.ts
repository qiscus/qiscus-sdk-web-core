import { test, expect } from 'vitest'
import * as P from './param-utils'
import { isReqArrayOfStringOrNumber } from './param-utils'

test('isArrayOfNumber', () => {
  let r1 = P.isArrayOfNumber([1, 2, 3, 4])
  let r2 = P.isArrayOfNumber(['1', '2', '3'])

  expect(r1).toEqual(true)
  expect(r2).toEqual(false)
})

test('isArrayOfString', () => {
  let r1 = P.isArrayOfString([1, 2, 3, 4, 5])
  let r2 = P.isArrayOfString(['1', '2', '3', '4'])

  expect(r1).toEqual(false)
  expect(r2).toEqual(true)
})

test('isCallback1', () => {
  let r1 = P.isCallback1(function (_1: any) {})
  let r2 = P.isCallback1(function () {})

  expect(r1).toEqual(true)
  expect(r2).toEqual(false)
})

test('isCallback2', () => {
  let r1 = P.isCallback2(function (_1: any, _2: any) {})
  let r2 = P.isCallback2(function () {})

  expect(r1).toEqual(true)
  expect(r2).toEqual(false)
})

test('isRequired', () => {
  const data1 = 'some-data'
  const data2 = null
  const data3 = null
  const r1 = P.isRequired({ data1 })
  const r2 = P.isRequired({ data2 })
  const r3 = P.isRequired({ data3 })

  // expect(r2()).toThrow(TypeError('Cannot convert undefined or null to object'))

  expect(r1(data1)).toBe(data1)
  expect(() => r2(data2)).toThrow(TypeError('`data2` are required'))
  expect(() => r3(data3)).toThrow(TypeError('`data3` are required'))
})

test('isReqString', () => {
  const data1 = 'some-string'
  const data2 = null
  const data3 = undefined

  expect(P.isReqString({ data1 })(data1)).toBe('some-string')
  expect(() => P.isReqString({ data1 })(data1)).not.toThrow(TypeError('`data1` are required and need to be string'))
  expect(() => P.isReqString({ data2 })(data2)).toThrow(TypeError('`data2` are required and need to be string'))
  expect(() => P.isReqString({ data3 })(data3)).toThrow(TypeError('`data3` are required and need to be string'))
})
test('isReqNumber', () => {
  const data1 = 12
  const data2 = null
  const data3 = undefined

  expect(P.isReqNumber({ data1 })(data1)).toBe(12)
  expect(() => P.isReqNumber({ data1 })(data1)).not.toThrow(TypeError('`data1` are required and need to be number'))
  expect(() => P.isReqNumber({ data2 })(data2)).toThrow(TypeError('`data2` are required and need to be number'))
  expect(() => P.isReqNumber({ data3 })(data3)).toThrow(TypeError('`data3` are required and need to be number'))
})
test('isReqBoolean', () => {
  const data1 = true
  const data2 = null
  const data3 = undefined

  expect(P.isReqBoolean({ data1 })(data1)).toBe(true)
  expect(() => P.isReqBoolean({ data1 })(data1)).not.toThrow(TypeError('`data1` are required and need to be boolean'))
  expect(() => P.isReqBoolean({ data2 })(data2)).toThrow(TypeError('`data2` are required and need to be boolean'))
  expect(() => P.isReqBoolean({ data3 })(data3)).toThrow(TypeError('`data3` are required and need to be boolean'))
})
test('isReqJson', () => {
  const data1 = { data: true }
  const data2 = null
  const data3 = undefined

  expect(P.isReqJson({ data1 })(data1)).toStrictEqual({ data: true })
  expect(() => P.isReqJson({ data1 })(data1)).not.toThrow(TypeError('`data1` are required and need to be object'))
  expect(() => P.isReqJson({ data2 })(data2)).toThrow(TypeError('`data2` are required and need to be object'))
  expect(() => P.isReqJson({ data3 })(data3)).toThrow(TypeError('`data3` are required and need to be object'))
})
test('isReqArrayNumber', () => {
  const data1 = [1, 2, 3, 4, 5]
  const data4 = ['1', '2', '3']
  const data2 = null
  const data3 = undefined

  expect(P.isReqArrayNumber({ data1 })(data1)).toStrictEqual([1, 2, 3, 4, 5])
  expect(() => P.isReqArrayNumber({ data1 })(data1)).not.toThrow(
    TypeError('`data1` are required and need to be array of number')
  )
  expect(() => P.isReqArrayNumber({ data2 })(data2)).toThrow(
    TypeError('`data2` are required and need to be array of number')
  )
  expect(() => P.isReqArrayNumber({ data3 })(data3)).toThrow(
    TypeError('`data3` are required and need to be array of number')
  )
  expect(() => P.isReqArrayNumber({ data4 })(data4)).toThrow(
    TypeError('`data4` are required and need to be array of number')
  )
})
test('isReqArrayString', () => {
  const data1 = ['1', '2', '3']
  const data4 = [1, 2, 3, 4]
  const data2 = null
  const data3 = undefined

  expect(P.isReqArrayString({ data1 })(data1)).toStrictEqual(['1', '2', '3'])
  expect(() => P.isReqArrayString({ data1 })(data1)).not.toThrow(
    TypeError('`data1` are required and need to be array of string')
  )
  expect(() => P.isReqArrayString({ data2 })(data2)).toThrow(
    TypeError('`data2` are required and need to be array of string')
  )
  expect(() => P.isReqArrayString({ data3 })(data3)).toThrow(
    TypeError('`data3` are required and need to be array of string')
  )
  expect(() => P.isReqArrayString({ data4 })(data4)).toThrow(
    TypeError('`data4` are required and need to be array of string')
  )
})

test('isOptArrayNumber', () => {
  const data1 = [1, 2, 3, 4]
  const data2 = ['1', '2', '3']
  const data3 = null
  const data4 = undefined

  expect(P.isOptArrayNumber({ data1 })(data1)).toStrictEqual(data1)
  expect(() => P.isOptArrayNumber({ data2 })(data2)).toThrow(TypeError('`data2` need to be array of number or null'))
  expect(() => P.isOptArrayNumber({ data3 })(data3)).not.toThrow(TypeError)
  expect(() => P.isOptArrayNumber({ data4 })(data4)).not.toThrow(TypeError)
})
test('isOptArrayString', () => {
  const data1 = ['1', '2', '3']
  const data2 = [1, 2, 3, 4]
  const data3 = null
  const data4 = undefined

  expect(P.isOptArrayString({ data1 })(data1)).toStrictEqual(data1)
  expect(() => P.isOptArrayString({ data2 })(data2)).toThrow(TypeError('`data2` need to be array of string or null'))
  expect(() => P.isOptArrayString({ data3 })(data3)).not.toThrow(TypeError)
  expect(() => P.isOptArrayString({ data4 })(data4)).not.toThrow(TypeError)
})
test('isOptString', () => {
  const data1 = '123'
  const data2 = ['1', '2', '3']
  const data3 = null
  const data4 = undefined

  expect(P.isOptString({ data1 })(data1)).toStrictEqual(data1)
  expect(() => P.isOptString({ data2 })(data2)).toThrow(TypeError('`data2` need to be string or null'))
  expect(() => P.isOptString({ data3 })(data3)).not.toThrow(TypeError)
  expect(() => P.isOptString({ data4 })(data4)).not.toThrow(TypeError)
})
test('isOptNumber', () => {
  const data1 = 1234
  const data2 = ['1', '2', '3']
  const data3 = null
  const data4 = undefined

  expect(P.isOptNumber({ data1 })(data1)).toStrictEqual(data1)
  expect(() => P.isOptNumber({ data2 })(data2)).toThrow(TypeError('`data2` need to be number or null'))
  expect(() => P.isOptNumber({ data3 })(data3)).not.toThrow(TypeError)
  expect(() => P.isOptNumber({ data4 })(data4)).not.toThrow(TypeError)
})
test('isOptJson', () => {
  const data1 = { name: true }
  const data2 = ['1', '2', '3']
  const data3 = null
  const data4 = undefined

  expect(P.isOptJson({ data1 })(data1)).toStrictEqual(data1)
  expect(() => P.isOptJson({ data2 })(data2)).toThrow(TypeError('`data2` need to be object or null'))
  expect(() => P.isOptJson({ data3 })(data3)).not.toThrow(TypeError)
  expect(() => P.isOptJson({ data4 })(data4)).not.toThrow(TypeError)
})
test('isOptCallback', () => {
  const data1 = () => {}
  const data2 = 123
  const data3 = null
  const data4 = undefined

  expect(P.isOptCallback({ data1 })(data1)).toStrictEqual(data1)
  expect(() => P.isOptCallback({ data2 })(data2)).toThrow(TypeError('`data2` need to be function or null'))
  expect(() => P.isOptCallback({ data3 })(data3)).not.toThrow(TypeError)
  expect(() => P.isOptCallback({ data4 })(data4)).not.toThrow(TypeError)
})
test('isOptBoolean', () => {
  const data1 = false
  const data1_1 = true
  const data2 = 123
  const data3 = null
  const data4 = undefined

  expect(P.isOptBoolean({ data1 })(data1)).toStrictEqual(data1)
  expect(P.isOptBoolean({ data1_1 })(data1_1)).toStrictEqual(data1_1)
  expect(() => P.isOptBoolean({ data2 })(data2)).toThrow(TypeError('`data2` need to be boolean or null'))
  expect(() => P.isOptBoolean({ data3 })(data3)).not.toThrow(TypeError)
  expect(() => P.isOptBoolean({ data4 })(data4)).not.toThrow(TypeError)
})

test('isReqArrayOfStringOrNumber', () => {
  const data1 = [1, 2, 3, 4, 5]
  const data2 = ['1', '2', '3']
  const data3 = [true, false]
  const data4 = undefined
  const data5 = null

  expect(isReqArrayOfStringOrNumber({ data1 })(data1)).toStrictEqual(data1)
  expect(isReqArrayOfStringOrNumber({ data2 })(data2)).toStrictEqual(data2)
  expect(() => isReqArrayOfStringOrNumber({ data1 })(data1)).not.toThrow(TypeError)
  expect(() => isReqArrayOfStringOrNumber({ data2 })(data2)).not.toThrow(TypeError)
  expect(() => isReqArrayOfStringOrNumber({ data3 })(data3)).toThrow(
    TypeError('`data3` are required and need to be array of string or array of number')
  )
  expect(() => isReqArrayOfStringOrNumber({ data4 })(data4)).toThrow(
    TypeError('`data4` are required and need to be array of string or array of number')
  )
  expect(() => isReqArrayOfStringOrNumber({ data5 })(data5)).toThrow(
    TypeError('`data5` are required and need to be array of string or array of number')
  )
})
