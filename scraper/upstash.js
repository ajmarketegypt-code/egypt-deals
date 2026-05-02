import { Redis } from '@upstash/redis'
import 'dotenv/config'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

export const KEYS = {
  PUSH_SUBSCRIPTION: 'push_subscription',
  DEALS_SNAPSHOT: 'deals_snapshot',
  SCRAPE_REQUESTED: 'scrape_requested',
  LAST_SCRAPE: 'last_scrape_ts',
  NOTIFIED_DEAL_IDS: 'notified_deal_ids', // SET of deal IDs already notified
  // Wishlist mirror written by the frontend (/api/wishlist). Scraper reads
  // these each run to match saved products against the current scrape.
  SAVED_DEAL_IDS: 'saved_deal_ids',
  SAVED_DEAL_META: 'saved_deal_meta',
  SAVED_NOTIFIED: 'saved_notified',
}

export async function getPushSubscription() {
  return redis.get(KEYS.PUSH_SUBSCRIPTION)
}

export async function setDealsSnapshot(payload) {
  return redis.set(KEYS.DEALS_SNAPSHOT, JSON.stringify(payload))
}

export async function getScrapeRequested() {
  return redis.get(KEYS.SCRAPE_REQUESTED)
}

export async function clearScrapeRequested() {
  return redis.del(KEYS.SCRAPE_REQUESTED)
}

export async function setLastScrapeTs() {
  return redis.set(KEYS.LAST_SCRAPE, Date.now())
}

// Notification de-duping: tracks which deal IDs have already triggered a push.
// IDs roll off after 30 days so that re-listed items can re-notify.
export async function getNotifiedDealIds() {
  const ids = await redis.smembers(KEYS.NOTIFIED_DEAL_IDS)
  return new Set(ids || [])
}

export async function addNotifiedDealIds(ids) {
  if (!ids?.length) return
  await redis.sadd(KEYS.NOTIFIED_DEAL_IDS, ...ids)
  // Refresh TTL on every write so the set reflects the rolling 30-day window
  await redis.expire(KEYS.NOTIFIED_DEAL_IDS, 60 * 60 * 24 * 30)
}

// Read all saved-deal metadata as { [id]: { savedAtPrice, ... } }. Returns {}
// when nothing has ever been saved.
export async function getSavedDeals() {
  const meta = await redis.hgetall(KEYS.SAVED_DEAL_META)
  if (!meta) return {}
  // hgetall in @upstash/redis auto-parses JSON when it can; values may be
  // either strings or already-parsed objects depending on payload size.
  // Normalise to objects.
  const out = {}
  for (const [id, raw] of Object.entries(meta)) {
    if (!raw) continue
    if (typeof raw === 'string') {
      try { out[id] = JSON.parse(raw) } catch { /* skip corrupt */ }
    } else {
      out[id] = raw
    }
  }
  return out
}

// Read/write the "we've already pushed about this saved deal at price X" map.
// Keyed by saved deal ID, value is the last-pushed price. We re-push only
// when the new current price is strictly below the last-pushed price.
export async function getSavedNotifiedMap() {
  const map = await redis.hgetall(KEYS.SAVED_NOTIFIED)
  if (!map) return {}
  const out = {}
  for (const [id, v] of Object.entries(map)) out[id] = Number(v)
  return out
}

export async function setSavedNotifiedPrice(id, price) {
  await redis.hset(KEYS.SAVED_NOTIFIED, { [id]: price })
}
