import { expect } from 'chai'
import { resolveEnableLb } from '../src/lib/utils'

const build = (overrides = {}) =>
  resolveEnableLb({
    hasCustomBaseUrl: false,
    hasCustomMqttUrl: false,
    hasCustomBrokerLbUrl: false,
    enableRealtimeLB: null,
    currentEnableLb: true,
    ...overrides,
  })

describe('resolveEnableLb', function () {
  it('should keep an explicit true even when the heuristic would disable the lb', () => {
    const result = build({
      hasCustomBaseUrl: true,
      enableRealtimeLB: true,
    })

    expect(result).to.deep.equal({ enableLb: true, disabledByGuess: false })
  })

  it('should keep an explicit true when the heuristic condition is not met', () => {
    const result = build({
      enableRealtimeLB: true,
    })

    expect(result).to.deep.equal({ enableLb: true, disabledByGuess: false })
  })

  it('should keep an explicit false even when the heuristic condition is met', () => {
    const result = build({
      hasCustomBaseUrl: true,
      enableRealtimeLB: false,
    })

    expect(result).to.deep.equal({ enableLb: false, disabledByGuess: false })
  })

  it('should keep an explicit false when the heuristic condition is not met', () => {
    const result = build({
      enableRealtimeLB: false,
    })

    expect(result).to.deep.equal({ enableLb: false, disabledByGuess: false })
  })

  it('should disable the lb by guess when nothing was set explicitly and the heuristic fires', () => {
    const result = build({
      hasCustomBaseUrl: true,
    })

    expect(result).to.deep.equal({ enableLb: false, disabledByGuess: true })
  })

  it('should leave the current enableLb untouched when nothing was set and the heuristic does not fire', () => {
    const result = build({
      currentEnableLb: true,
    })

    expect(result).to.deep.equal({ enableLb: true, disabledByGuess: false })
  })

  it('should treat a custom brokerLbURL as settling the guess even with a custom baseURL', () => {
    const result = build({
      hasCustomBaseUrl: true,
      hasCustomBrokerLbUrl: true,
    })

    expect(result).to.deep.equal({ enableLb: true, disabledByGuess: false })
  })
})
