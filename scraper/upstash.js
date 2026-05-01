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
