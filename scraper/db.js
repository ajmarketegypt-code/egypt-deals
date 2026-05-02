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

// Percentile rank: fraction of recorded samples STRICTLY higher than the
// current price, using strict-greater + 0.5 × ties (the standard "midrank"
// definition — keeps "you're at the lowest" reading as 100% and "you're at
// the highest" as 0%, with ties splitting the difference rather than
// over-claiming).
//
// Returned as a 0..1 fraction; the caller multiplies and rounds for display.
// Returns null when there's no history (caller should fall back).
export function getPercentileRank(db, productId, currentPrice) {
  const row = db.prepare(`
    SELECT
      SUM(CASE WHEN price > ? THEN 1 ELSE 0 END) AS hi,
      SUM(CASE WHEN price = ? THEN 1 ELSE 0 END) AS eq,
      COUNT(*) AS total
    FROM price_history WHERE productId = ?
  `).get(currentPrice, currentPrice, productId)
  if (!row?.total) return null
  return (row.hi + row.eq * 0.5) / row.total
}

// Run length: how many trailing samples (most recent first) sit within ±0.5%
// of the current price. We use a fractional band, not exact equality, because
// price formatting + rounding causes 1-EGP wiggles that aren't real moves.
// Returned in samples (not days) — caller can divide by samples-per-day if
// it wants days. Includes the most recent sample itself (so a fresh price
// always has run=1 minimum, assuming it was just recorded).
export function getRunLength(db, productId, currentPrice, tolerance = 0.005) {
  // Order by id DESC (AUTOINCREMENT) instead of scrapedAt — multiple rows can
  // share the same unix-second when the scraper writes them back-to-back, but
  // the AUTOINCREMENT id is strictly monotonic with insertion order.
  const rows = db.prepare(`
    SELECT price FROM price_history WHERE productId = ?
    ORDER BY id DESC
  `).all(productId)
  if (!rows.length) return 0
  const lo = currentPrice * (1 - tolerance)
  const hi = currentPrice * (1 + tolerance)
  let n = 0
  for (const r of rows) {
    if (r.price >= lo && r.price <= hi) n++
    else break
  }
  return n
}

// Frequency at-or-below: how many of N total samples were ≤ currentPrice.
// Returns { atOrBelow, total }.
export function getFreqAtOrBelow(db, productId, currentPrice) {
  const row = db.prepare(`
    SELECT
      SUM(CASE WHEN price <= ? THEN 1 ELSE 0 END) AS atOrBelow,
      COUNT(*) AS total
    FROM price_history WHERE productId = ?
  `).get(currentPrice, productId)
  return { atOrBelow: row?.atOrBelow ?? 0, total: row?.total ?? 0 }
}

// Watcher pool: oldest-stale-first product IDs eligible for a watch refresh.
// Filters:
//   - product has at least `minSamples` history rows (we only watch things we
//     already know — avoids wasting requests on items that fell out of /deals
//     after a single appearance)
//   - product has been scraped at least once in the last `maxStaleDays` days
//     (a product that hasn't shown up in deals for >90 days is likely
//     discontinued or out of stock; stop hammering it)
//   - excludes any IDs in `excludeIds` (e.g. items already touched this run)
//
// Returns full product rows, oldest `updatedAt` first, capped at `limit`.
export function getStaleProductsForWatch(db, { excludeIds = [], limit = 15, minSamples = 3, maxStaleDays = 90 } = {}) {
  const placeholders = excludeIds.length ? `AND id NOT IN (${excludeIds.map(() => '?').join(',')})` : ''
  const minSeenTs = Math.floor(Date.now() / 1000) - maxStaleDays * 86400
  const sql = `
    SELECT * FROM (
      SELECT p.id, p.name, p.store, p.url, p.imageUrl, p.category, p.updatedAt,
             (SELECT COUNT(*) FROM price_history WHERE productId = p.id) AS samples
      FROM products p
      WHERE p.updatedAt >= ?
        ${placeholders}
    )
    WHERE samples >= ?
    ORDER BY updatedAt ASC
    LIMIT ?
  `
  return db.prepare(sql).all(minSeenTs, ...excludeIds, minSamples, limit)
}

export function getExpiredProductIds(db, currentScrapeItems) {
  const expired = []
  for (const { id, currentPrice } of currentScrapeItems) {
    const min = getMinPrice(db, id)
    if (min !== null && currentPrice > min) expired.push(id)
  }
  return expired
}
