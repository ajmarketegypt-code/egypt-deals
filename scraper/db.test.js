import { describe, test, expect, beforeEach, afterEach } from '@jest/globals'
import { initDb, upsertProduct, recordPrice, getMinPrice, getPriceCount, getPriceHistory, getAvgPrice, getSecondLowestPrice, getExpiredProductIds } from './db.js'
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
