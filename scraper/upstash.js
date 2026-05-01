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
