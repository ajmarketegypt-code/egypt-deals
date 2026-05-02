import { describe, test, expect, beforeEach, afterEach } from '@jest/globals'
import { initDb, upsertProduct, recordPrice, getMinPrice, getPriceCount, getPriceHistory, getAvgPrice, getSecondLowestPrice, getExpiredProductIds, getPercentileRank, getRunLength, getFreqAtOrBelow, getStaleProductsForWatch } from './db.js'
import fs from 'fs'

const TEST_DB = './data/test.db'
let db

beforeEach(() => { db = initDb(TEST_DB) })
afterEach(() => { db.close(); if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB) })

const PRODUCT = { id: 'amz-B001', name: 'Test Product', store: 'amazon', url: 'https://amazon.eg/dp/B001', imageUrl: '', category: 'electronics' }

describe('upsertProduct', () => {
  test('inserts new product and reads it back', () => {
    upsertProduct(db, PRODUCT)
    const row = db.prepare('SELECT * FROM products WHERE id = ?').get('amz-B001')
    expect(row.name).toBe('Test Product')
    expect(row.store).toBe('amazon')
  })
})

describe('recordPrice + getMinPrice', () => {
  test('records prices and returns the minimum', () => {
    upsertProduct(db, PRODUCT)
    recordPrice(db, 'amz-B001', 200, 350)
    recordPrice(db, 'amz-B001', 180, 350)
    recordPrice(db, 'amz-B001', 210, 350)
    expect(getMinPrice(db, 'amz-B001')).toBe(180)
  })
})

describe('getPriceCount', () => {
  test('counts recorded prices', () => {
    upsertProduct(db, PRODUCT)
    recordPrice(db, 'amz-B001', 100, 200)
    recordPrice(db, 'amz-B001', 110, 200)
    expect(getPriceCount(db, 'amz-B001')).toBe(2)
  })
})

describe('getExpiredProductIds', () => {
  test('returns products whose current price is above their all-time low', () => {
    upsertProduct(db, PRODUCT)
    recordPrice(db, 'amz-B001', 100, 200)
    recordPrice(db, 'amz-B001', 120, 200)
    // ATL is 100, current is 120 → expired
    const expired = getExpiredProductIds(db, [{ id: 'amz-B001', currentPrice: 120 }])
    expect(expired).toContain('amz-B001')
  })

  test('does not flag products at their all-time low', () => {
    upsertProduct(db, PRODUCT)
    recordPrice(db, 'amz-B001', 100, 200)
    recordPrice(db, 'amz-B001', 90, 200)
    const expired = getExpiredProductIds(db, [{ id: 'amz-B001', currentPrice: 90 }])
    expect(expired).not.toContain('amz-B001')
  })
})

describe('getPercentileRank', () => {
  test('current price at the lowest gives ~1.0 (beats everyone)', () => {
    upsertProduct(db, PRODUCT)
    ;[100, 110, 120, 130, 140].forEach(p => recordPrice(db, 'amz-B001', p, 200))
    // current=100 ties with one sample, beats 4. midrank: (4 + 0.5*1) / 5 = 0.9
    expect(getPercentileRank(db, 'amz-B001', 100)).toBeCloseTo(0.9, 2)
  })

  test('current price at the highest gives ~0', () => {
    upsertProduct(db, PRODUCT)
    ;[100, 110, 120].forEach(p => recordPrice(db, 'amz-B001', p, 200))
    // current=120: 0 strictly higher, 1 tie. midrank: 0.5/3 ≈ 0.167
    expect(getPercentileRank(db, 'amz-B001', 120)).toBeCloseTo(0.5 / 3, 3)
  })

  test('returns null with no history', () => {
    expect(getPercentileRank(db, 'unknown', 100)).toBeNull()
  })
})

describe('getRunLength', () => {
  test('counts trailing samples within ±0.5% of current', () => {
    upsertProduct(db, PRODUCT)
    recordPrice(db, 'amz-B001', 200, 300) // older — different price
    recordPrice(db, 'amz-B001', 100, 300)
    recordPrice(db, 'amz-B001', 100, 300)
    recordPrice(db, 'amz-B001', 100.4, 300) // within 0.5%
    expect(getRunLength(db, 'amz-B001', 100)).toBe(3)
  })

  test('breaks the run on the first out-of-band sample', () => {
    upsertProduct(db, PRODUCT)
    recordPrice(db, 'amz-B001', 100, 300)
    recordPrice(db, 'amz-B001', 200, 300) // big break
    recordPrice(db, 'amz-B001', 100, 300)
    expect(getRunLength(db, 'amz-B001', 100)).toBe(1)
  })

  test('zero history returns 0', () => {
    expect(getRunLength(db, 'unknown', 100)).toBe(0)
  })
})

describe('getFreqAtOrBelow', () => {
  test('counts samples ≤ current price', () => {
    upsertProduct(db, PRODUCT)
    ;[100, 110, 120, 130, 140].forEach(p => recordPrice(db, 'amz-B001', p, 200))
    expect(getFreqAtOrBelow(db, 'amz-B001', 110)).toEqual({ atOrBelow: 2, total: 5 })
  })
})

describe('getStaleProductsForWatch', () => {
  test('returns oldest first, filtered by min samples', () => {
    upsertProduct(db, { ...PRODUCT, id: 'p1', name: 'P1' })
    upsertProduct(db, { ...PRODUCT, id: 'p2', name: 'P2' })
    upsertProduct(db, { ...PRODUCT, id: 'p3', name: 'P3' })
    // p1: 1 sample (excluded), p2: 3 (eligible), p3: 5 (eligible)
    recordPrice(db, 'p1', 100)
    ;[100, 110, 120].forEach(v => recordPrice(db, 'p2', v))
    ;[100, 110, 120, 130, 140].forEach(v => recordPrice(db, 'p3', v))
    // touch updatedAt order
    db.prepare('UPDATE products SET updatedAt = 1000 WHERE id = ?').run('p2')
    db.prepare('UPDATE products SET updatedAt = 2000 WHERE id = ?').run('p3')
    const out = getStaleProductsForWatch(db, { limit: 5, minSamples: 3, maxStaleDays: 100000 })
    expect(out.map(r => r.id)).toEqual(['p2', 'p3'])
  })

  test('excludes ids already touched this run', () => {
    upsertProduct(db, { ...PRODUCT, id: 'p1', name: 'P1' })
    ;[100, 110, 120].forEach(v => recordPrice(db, 'p1', v))
    const out = getStaleProductsForWatch(db, { excludeIds: ['p1'], minSamples: 3, maxStaleDays: 100000 })
    expect(out.length).toBe(0)
  })
})
