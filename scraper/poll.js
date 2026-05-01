import 'dotenv/config'
import { getScrapeRequested, clearScrapeRequested } from './upstash.js'
import { runScrape } from './index.js'

const INTERVAL_MS = 60_000
let inFlight = false

async function tick() {
  if (inFlight) return
  inFlight = true
  try {
    const requested = await getScrapeRequested()
    if (requested) {
      console.log('[poll] scrape requested — running now')
      await clearScrapeRequested()
      await runScrape()
    }
  } catch (err) {
    console.error('[poll] tick error:', err.message)
  } finally {
    inFlight = false
  }
}

console.log(`[poll] watching for on-demand scrape requests every ${INTERVAL_MS / 1000}s...`)
tick().catch(err => console.error('[poll] startup error:', err.message))
setInterval(tick, INTERVAL_MS)
