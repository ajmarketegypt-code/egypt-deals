import { describe, test, expect } from '@jest/globals'
import { isAllTimeLow, buildSmartVerdict } from './atl.js'

describe('isAllTimeLow', () => {
  test('false when fewer than 5 records (prevents new-product false positives)', () => {
    expect(isAllTimeLow({ currentPrice: 100, minPrice: 100, priceCount: 4 })).toBe(false)
  })
  test('true when current equals min and count >= 5', () => {
    expect(isAllTimeLow({ currentPrice: 100, minPrice: 100, priceCount: 5 })).toBe(true)
  })
  test('true when current is below historical min', () => {
    expect(isAllTimeLow({ currentPrice: 89, minPrice: 100, priceCount: 5 })).toBe(true)
  })
  test('false when current is above historical min', () => {
    expect(isAllTimeLow({ currentPrice: 110, minPrice: 100, priceCount: 5 })).toBe(false)
  })
})

describe('buildSmartVerdict', () => {
  test('below 90% of previous low → great time to buy', () => {
    const v = buildSmartVerdict({ currentPrice: 67, prevLow: 79, recentPrices: [90, 80, 79, 67], seenAtThisPrice: 0 })
    expect(v).toContain('great time to buy')
  })
  test('90-99% of previous low → solid deal', () => {
    const v = buildSmartVerdict({ currentPrice: 75, prevLow: 79, recentPrices: [90, 85, 80, 75], seenAtThisPrice: 1 })
    expect(v).toContain('solid deal')
  })
  test('all prices falling → falling note appended', () => {
    const v = buildSmartVerdict({ currentPrice: 67, prevLow: 79, recentPrices: [90, 80, 74, 67], seenAtThisPrice: 0 })
    expect(v).toContain('falling')
  })
  test('prices rising then dropping → limited time appended', () => {
    const v = buildSmartVerdict({ currentPrice: 67, prevLow: 79, recentPrices: [60, 70, 80, 67], seenAtThisPrice: 0 })
    expect(v).toContain('limited time')
  })
  test('never seen at this price → never been seen appended', () => {
    const v = buildSmartVerdict({ currentPrice: 67, prevLow: 79, recentPrices: [90, 80, 79, 67], seenAtThisPrice: 0 })
    expect(v).toContain('never been seen')
  })
})
