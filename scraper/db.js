import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

export function initDb(dbPath = './data/prices.db') {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  db.prepare(`CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    store TEXT NOT NULL,
    url TEXT NOT NULL,
    imageUrl TEXT,
    category TEXT,
    updatedAt INTEGER DEFAULT (unixepoch())
  )`).run()

  db.prepare(`CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    productId TEXT NOT NULL REFERENCES products(id),
    price REAL NOT NULL,
    originalPrice REAL,
    scrapedAt INTEGER DEFAULT (unixepoch())
  )`).run()

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_ph_product ON price_history(productId)`).run()

  return db
}

export function upsertProduct(db, { id, name, store, url, imageUrl, category }) {
  db.prepare(`
    INSERT INTO products (id, name, store, url, imageUrl, category, updatedAt)
    VALUES (@id, @name, @store, @url, @imageUrl, @category, unixepoch())
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name, url = excluded.url,
      imageUrl = excluded.imageUrl, category = excluded.category,
      updatedAt = unixepoch()
  `).run({ id, name, store, url: url || '', imageUrl: imageUrl || '', category: category || '' })
}

export function recordPrice(db, productId, price, originalPrice) {
  db.prepare(`INSERT INTO price_history (productId, price, originalPrice) VALUES (?, ?, ?)`)
    .run(productId, price, originalPrice ?? null)
}

export function getMinPrice(db, productId) {
  const row = db.prepare('SELECT MIN(price) as min FROM price_history WHERE productId = ?').get(productId)
  return row?.min ?? null
}

export function getPriceCount(db, productId) {
  const row = db.prepare('SELECT COUNT(*) as cnt FROM price_history WHERE productId = ?').get(productId)
  return row?.cnt ?? 0
}

export function getPriceHistory(db, productId, limit = 180) {
  return db.prepare(`
    SELECT price, originalPrice, scrapedAt FROM price_history
    WHERE productId = ? ORDER BY scrapedAt ASC LIMIT ?
  `).all(productId, limit)
}

export function getAvgPrice(db, productId) {
  const row = db.prepare('SELECT AVG(price) as avg FROM price_history WHERE productId = ?').get(productId)
  return row?.avg ?? null
}

export function getMaxPrice(db, productId) {
  const row = db.prepare('SELECT MAX(price) as max FROM price_history WHERE productId = ?').get(productId)
  return row?.max ?? null
}

export function getFirstSeenTs(db, productId) {
  const row = db.prepare('SELECT MIN(scrapedAt) as ts FROM price_history WHERE productId = ?').get(productId)
  return row?.ts ?? null
}

export function getSecondLowestPrice(db, productId) {
  const rows = db.prepare(`
    SELECT DISTINCT price FROM price_history WHERE productId = ? ORDER BY price ASC LIMIT 2
  `).all(productId)
  return rows.length >= 2 ? rows[1].price : rows[0]?.price ?? null
}

export function getExpiredProductIds(db, currentScrapeItems) {
  const expired = []
  for (const { id, currentPrice } of currentScrapeItems) {
    const min = getMinPrice(db, id)
    if (min !== null && currentPrice > min) expired.push(id)
  }
  return expired
}
