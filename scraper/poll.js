import 'dotenv/config'
import { getScrapeRequested, clearScrapeRequested } from './upstash.js'
import { runScrape } from './index.js'

const INTERVAL_MS = 60_000

async function tick() {
  const requested = await getScrapeRequested()
  if (requested) {
    console.log('[poll] scrape requested — running now')
    await clearScrapeRequested()
    await runScrape()
  }
}

console.log('[poll] watching for on-demand scrape requests every 60s...')
tick()
setInterval(tick, INTERVAL_MS)
