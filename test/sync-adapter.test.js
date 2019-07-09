import chai, { expect } from 'chai'
import spy from 'chai-spies'
import SyncAdapter from '../lib/adapters/sync'

chai.use(spy)

describe('SyncAdapter', function () {
  let syncAdapter = null
  let httpAdapter = null
  beforeEach(() => {
    httpAdapter = {
      get() { }
    }

    syncAdapter = new SyncAdapter(httpAdapter)
  })

})
