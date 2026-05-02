import { Redis } from '@upstash/redis'

const url = process.env.UPSTASH_REDIS_REST_URL
const token = process.env.UPSTASH_REDIS_REST_TOKEN

if (!url || !token) {
  throw new Error('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN')
}

export const redis = new Redis({ url, token })

export const KEYS = {
  PUSH_SUBSCRIPTION: 'push_subscription',
  DEALS_SNAPSHOT: 'deals_snapshot',
  SCRAPE_REQUESTED: 'scrape_requested',
  LAST_SCRAPE: 'last_scrape_ts',
} as const
