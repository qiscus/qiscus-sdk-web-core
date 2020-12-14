import * as U from './url-builder'

test('URLBuilder without null', () => {
  const url = U.default('base-url').param('key1', 'value1').param('key2', 'value2').build()

  expect(url).toBe('base-url?key1=value1&key2=value2')
})

test('URLBuilder with null', () => {
  const url = U.default('base-url').param('key1', 'value1').param('key2', undefined).param('key3', null).build()

  expect(url).toBe('base-url?key1=value1')
})

test('URLBuilder with array without null', () => {
  const url = U.default('base-url').param('key1', 'value1').param('key2', [1, 2]).build()

  expect(url).toBe('base-url?key1=value1&key2[]=1&key2[]=2')
})

test('URLBuilder with array with null', () => {
  const url = U.default('base-url').param('key1', 'value1').param('key2', [1, null, 2]).build()

  expect(url).toBe('base-url?key1=value1&key2[]=1&key2[]=2')
})
