declare module '@toolbuilder/await-for-it' {
  namespace generators {
    export function from<T>(iterable: Iterable<T> | AsyncIterable<T>): Iterable<T> | AsyncIterable<T>
    export function merge<T>(...iterables: Iterable<T>[] | AsyncIterable<T>[]): AsyncGenerator<T>
    export function zip<T>(...iterables: Iterable<T>[] | AsyncIterable<T>[]): AsyncGenerator<T>
    export function zipAll<T>(...iterables: Iterable<T>[] | AsyncIterable<T>[]): AsyncGenerator<T>
  }
  namespace transforms {
    export function pool<T>(): void
    export function chunk<T>(): void
    export function flattenUnordered<T>(): void
    export function arrayToObject<T>(
      propertyNames: Iterable<T>,
      iterable: Iterable<T> | AsyncIterable<T>
    ): AsyncGenerator<T>
    export function callAwait<T>(
      fn: (t: T) => void | Promise<void>,
      iterable: Iterable<T> | AsyncIterable<T>
    ): AsyncGenerator<T>
    export function callNoAwait<T>(
      fn: (t: T) => void | Promise<void>,
      iterable: Iterable<T> | AsyncIterable<T>
    ): AsyncGenerator<T>
    export function diff<T>(
      fn: (previousValue: T, value: T) => T | Promise<T>,
      iterable: Iterable<T> | AsyncIterable<T>
    ): AsyncGenerator<T>
    export function filter<T>(
      fn: (value: T) => boolean | Promise<boolean>,
      iterable: Iterable<T> | AsyncIterable<T>
    ): AsyncGenerator<T>
    export function flatten<T>(iterable: Iterable<Iterable<T> | AsyncIterable<T>>): AsyncGenerator<T>
    export function flattenRecursive<T>(iterable: Iterable<Iterable<T> | AsyncIterable<T>>): AsyncGenerator<T>
    export function map<T, O>(
      fn: (value: T) => O | Promise<O>,
      iterable: Iterable<T> | AsyncIterable<T>
    ): AsyncGenerator<T>
    export function mapWith<T, O>(
      generatorFn: (t: T) => AsyncGenerator<O, O>,
      iterable: Iterable<T> | AsyncIterable<T>
    ): AsyncGenerator<T>
    export function nth<T>(n: number, iterable: Iterable<T> | AsyncIterable<T>): AsyncGenerator<T>
    export function pluck<T>(propertyName: string, iterable: Iterable<T> | AsyncIterable<T>): AsyncGenerator<T>
    export function reject<T>(fn: (value: T) => boolean, iterable: Iterable<T> | AsyncIterable<T>): AsyncGenerator<T>
    export function take<T>(n: number, iterable: Iterable<T> | AsyncIterable<T>): AsyncGenerator<T>
    export function throttle<T>(
      period: number,
      initialWait: number,
      iterable: Iterable<T> | AsyncIterable<T>
    ): AsyncGenerator<T>
  }

  namespace reducers {
    export function forEach(
      fn: (value: any) => void | Promise<void>,
      iterable: Iterable<any> | AsyncIterable<any>
    ): void
    export function publish<T>(iterable: Iterable<T> | AsyncIterable<T>): {
      stop(): void
      start(): void
      get running(): boolean
      subscribe<T>(fn: (t: T) => void): string
      unsubscribe(key: string): void
    }
  }

  export interface GeneratorClass<T> {
    from(iterable: Iterable<T> | AsyncIterable<T>): Iterable<T> | AsyncIterable<T>
    merge(...iterables: Iterable<T>[] | AsyncIterable<T>[]): AsyncGenerator<T>
    zip(...iterables: Iterable<T>[] | AsyncIterable<T>[]): AsyncGenerator<T>
    zipAll(...iterables: Iterable<T>[] | AsyncIterable<T>[]): AsyncGenerator<T>
  }
  export interface TransformsClass<T> {
    pool(): void
    chunk(): void
    flattenUnordered(): void
    arrayToObject(propertyNames: Iterable<T>, iterable: Iterable<T> | AsyncIterable<T>): AsyncGenerator<T>
    callAwait(fn: (t: T) => void | Promise<void>, iterable: Iterable<T> | AsyncIterable<T>): AsyncGenerator<T>
    callNoAwait(fn: (t: T) => void | Promise<void>, iterable: Iterable<T> | AsyncIterable<T>): AsyncGenerator<T>
    diff(
      fn: (previousValue: T, value: T) => T | Promise<T>,
      iterable: Iterable<T> | AsyncIterable<T>
    ): AsyncGenerator<T>
    filter(fn: (value: T) => boolean | Promise<boolean>, iterable: Iterable<T> | AsyncIterable<T>): AsyncGenerator<T>
    flatten(iterable: Iterable<Iterable<T> | AsyncIterable<T>>): AsyncGenerator<T>
    flattenRecursive(iterable: Iterable<Iterable<T> | AsyncIterable<T>>): AsyncGenerator<T>
    map<O>(fn: (value: T) => O | Promise<O>, iterable: Iterable<T> | AsyncIterable<T>): AsyncGenerator<T>
    mapWith<O>(generatorFn: (t: T) => AsyncGenerator<O, O>, iterable: Iterable<T> | AsyncIterable<T>): AsyncGenerator<T>
  }
  export interface ReducersClass<T> {}

  export interface ChainableClass<T> extends GeneratorClass<T>, TransformsClass<T>, ReducersClass<T> {}

  export class ChainableClass<T> implements ChainableClass<T> {
    constructor(iterable: Iterable<T>)
  }

  export function chainable<T>(iterable: Iterable<T> | AsyncIterable<T>): ChainableClass<T>
}
