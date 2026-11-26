import { expect } from 'chai'
import { DEFAULT_BROKER_LB_URL, isCustomBrokerLbUrl } from '../src/lib/utils'

describe('isCustomBrokerLbUrl', function () {
  it("should accept an app's own broker lb url", () => {
    expect(
      isCustomBrokerLbUrl('https://multichannel-indonesia-lb.qiscus.com')
    ).to.equal(true)
  })

  it('should reject the shared default, however it is spelled', () => {
    expect(isCustomBrokerLbUrl(DEFAULT_BROKER_LB_URL)).to.equal(false)
    expect(isCustomBrokerLbUrl(`${DEFAULT_BROKER_LB_URL}/`)).to.equal(false)
    expect(isCustomBrokerLbUrl(` ${DEFAULT_BROKER_LB_URL} `)).to.equal(false)
  })

  it('should reject a value the backend never filled in', () => {
    expect(isCustomBrokerLbUrl('')).to.equal(false)
    expect(isCustomBrokerLbUrl('   ')).to.equal(false)
    expect(isCustomBrokerLbUrl(null)).to.equal(false)
    expect(isCustomBrokerLbUrl(undefined)).to.equal(false)
  })

  it('should reject a non-string', () => {
    expect(isCustomBrokerLbUrl(0)).to.equal(false)
    expect(isCustomBrokerLbUrl(true)).to.equal(false)
    expect(isCustomBrokerLbUrl({})).to.equal(false)
  })
})
