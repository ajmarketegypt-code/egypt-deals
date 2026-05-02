import { NextResponse } from 'next/server'
import { redis, KEYS } from '@/lib/upstash'

export const dynamic = 'force-dynamic'

// Hourly cadence — the Task Scheduler entry on Ahmed's PC is :00 every hour.
const SCRAPE_INTERVAL_MS = 60 * 60 * 1000

// Scraper writes the timestamp via `setLastScrapeTs` after every run, success
// or zero-deals. We surface it separately from the snapshot timestamp because
// they can diverge (zero-deals scrape touches LAST_SCRAPE but skips snapshot).
export async function GET() {
  const raw = await redis.get(KEYS.LAST_SCRAPE)
  const lastScrapeTs = typeof raw === 'number' ? raw : raw ? Number(raw) : 0

  const nextEstimateTs = lastScrapeTs ? lastScrapeTs + SCRAPE_INTERVAL_MS : 0

  return NextResponse.json({
    lastScrapeTs,
    nextEstimateTs,
    intervalMs: SCRAPE_INTERVAL_MS,
  })
}
