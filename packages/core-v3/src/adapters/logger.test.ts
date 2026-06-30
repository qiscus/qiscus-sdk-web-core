import { beforeEach, test } from 'vitest'
import { Storage, storageFactory } from '../storage'
import { getLogger } from './logger'

let storage: Storage
let logger: ReturnType<typeof getLogger>

beforeEach(() => {
  storage = storageFactory()
  logger = getLogger(storage)
})

test('logger.skip', () => {})
