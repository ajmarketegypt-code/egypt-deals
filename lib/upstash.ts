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
  // Wishlist mirror — frontend POSTs here when the user stars/unstars; scraper
  // reads on each run to decide which products to push for. Set holds IDs;
  // hash holds the saved metadata (price/name/url/...) keyed by ID.
  SAVED_DEAL_IDS: 'saved_deal_ids',
  SAVED_DEAL_META: 'saved_deal_meta',
  // Last-pushed price per saved ID, so we don't re-push every hour while the
  // price stays low.
  SAVED_NOTIFIED: 'saved_notified',
} as const
