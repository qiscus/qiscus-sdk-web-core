import { expect } from 'chai'
import mitt from 'mitt'
import QiscusSDK from '../index'
import { makeDeps } from './deps'

/**
 * Upload adaptation test (full-shell plan P2). The real multipart transfer is
 * browser-runtime (axios + FormData + onUploadProgress in core-v3's upload
 * primitive) and not unit-testable in node — so this pins the v2 SHELL
 * adaptation with an injected stub uploadAdapter: the progress event re-shaping,
 * the resolve/callback contract of `upload`, and `uploadFile`'s emit +
 * sendComment flow.
 */

function makeSelf(uploadStub, overrides = {}) {
  const self = {
    baseURL: 'https://api.example.com',
    AppId: 'app-1',
    version: '3.0.0',
    mqttURL: 'wss://m',
    _customHeader: {},
    user_id: 'user-1',
    userData: { id: 'user-1', token: 't' },
    HTTPAdapter: { token: 't' },
    refreshAuthToken: async () => {},
    uploadURL: 'https://api.example.com/api/v2/sdk/upload',
    events: mitt(),
    _deps: null,
    ...overrides,
  }
  self._deps = makeDeps(self, {
    uploadAdapter: uploadStub,
    apiAdapter: { request: () => Promise.resolve({}) },
  })
  Object.defineProperty(self, 'deps', { get() { return self._deps } })
  return self
}

describe('compat/upload adaptation', () => {
  it('upload: re-shapes axios progress to superagent shape, resolves url, calls callback', async () => {
    const uploadStub = {
      upload(file, opts) {
        expect(file).to.equal('FILE')
        expect(opts.url).to.equal('https://api.example.com/api/v2/sdk/upload')
        opts.onProgress({ loaded: 50, total: 100 })
        return Promise.resolve({ status: 200, results: { file: { url: 'http://x/f.png' } } })
      },
    }
    const self = makeSelf(uploadStub)
    const calls = []
    const url = await QiscusSDK.prototype.upload.call(self, 'FILE', (...args) => calls.push(args))

    expect(url).to.equal('http://x/f.png')
    // first callback = progress (superagent-shaped), second = completion
    expect(calls[0]).to.deep.equal([
      null,
      { direction: 'upload', loaded: 50, total: 100, percent: 50, lengthComputable: true },
    ])
    expect(calls[1]).to.deep.equal([null, null, 'http://x/f.png'])
  })

  it('upload: on error calls callback(error) and rejects', async () => {
    const boom = new Error('upload failed')
    const uploadStub = { upload: () => Promise.reject(boom) }
    const self = makeSelf(uploadStub)
    const calls = []
    let caught
    try {
      await QiscusSDK.prototype.upload.call(self, 'FILE', (...args) => calls.push(args))
    } catch (e) {
      caught = e
    }
    expect(caught).to.equal(boom)
    expect(calls[0]).to.deep.equal([boom])
  })

  it('uploadFile: uploads, emits fileupload, then sendComment with [file] tag', async () => {
    const uploadStub = { upload: () => Promise.resolve({ status: 200, results: { file: { url: 'http://x/pic.png' } } }) }
    let sentComment
    const self = makeSelf(uploadStub, {
      sendComment: (roomId, msg) => {
        sentComment = { roomId, msg }
        return Promise.resolve({ id: 1 })
      },
    })
    const emitted = []
    self.events.on('fileupload', (url) => emitted.push(url))

    await QiscusSDK.prototype.uploadFile.call(self, 42, 'FILE')

    expect(emitted).to.deep.equal(['http://x/pic.png'])
    expect(sentComment).to.deep.equal({ roomId: 42, msg: '[file] http://x/pic.png [/file]' })
  })
})
