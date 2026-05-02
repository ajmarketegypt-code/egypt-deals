import 'dotenv/config'
import { initDb, upsertProduct, recordPrice, getMinPrice, getPriceCount, getPriceHistory, getAvgPrice, getSecondLowestPrice, getMaxPrice, getFirstSeenTs, getPercentileRank, getRunLength, getFreqAtOrBelow } from './db.js'
import { runWatcher } from './watcher.js'
import { isAllTimeLow, buildSmartVerdict } from './atl.js'
import { scrapeAmazon } from './amazon.js'
import { scrapeNoon } from './noon.js'
import { sendDealNotification, sendDigestNotification } from './push.js'
import {
  getPushSubscription, setDealsSnapshot, setLastScrapeTs,
  getNotifiedDealIds, addNotifiedDealIds,
  getSavedDeals, getSavedNotifiedMap, setSavedNotifiedPrice,
} from './upstash.js'

const DB_PATH = './data/prices.db'

export async function runScrape() {
  console.log(`[scraper] run started ${new Date().toISOString()}`)
  const db = initDb(DB_PATH)

  try {
    const [amazonDeals, noonDeals] = await Promise.all([scrapeAmazon(), scrapeNoon()])
    const allDeals = [...amazonDeals, ...noonDeals]
    console.log(`[scraper] total deals: ${allDeals.length}`)

    for (const deal of allDeals) {
      upsertProduct(db, deal)
      recordPrice(db, deal.id, deal.currentPrice, deal.originalPrice)
    }

    const subscription = await getPushSubscription()
    const alreadyNotified = await getNotifiedDealIds()
    const atlDeals = []

    for (const deal of allDeals) {
      const minPrice = getMinPrice(db, deal.id)
      const priceCount = getPriceCount(db, deal.id)

      if (!isAllTimeLow({ currentPrice: deal.currentPrice, minPrice, priceCount })) continue

      const history = getPriceHistory(db, deal.id)
      const trendPrices = history.slice(-4).map(h => h.price) // for verdict trend analysis
      const chartPrices = history.slice(-30).map(h => h.price) // up to 30 points for the chart
      const prevLow = getSecondLowestPrice(db, deal.id) ?? deal.currentPrice
      const avgPrice = getAvgPrice(db, deal.id)
      const maxPrice = getMaxPrice(db, deal.id) ?? deal.currentPrice
      const firstSeenTs = getFirstSeenTs(db, deal.id) // unix seconds
      const discountPct = deal.originalPrice > 0
        ? Math.round((1 - deal.currentPrice / deal.originalPrice) * 100)
        : 0
      const seenAtThisPrice = Math.max(0, history.filter(h => h.price === deal.currentPrice).length - 1)
      const verdict = buildSmartVerdict({ currentPrice: deal.currentPrice, prevLow, recentPrices: trendPrices, seenAtThisPrice })

      // Learning signal: percentile rank, run length, and frequency-at-or-below.
      // Computed against the FULL price history (not the 30-point chart slice)
      // so the verdict gets sharper as weeks accumulate.
      const percentile = getPercentileRank(db, deal.id, deal.currentPrice)
      const runLength = getRunLength(db, deal.id, deal.currentPrice)
      const freq = getFreqAtOrBelow(db, deal.id, deal.currentPrice)

      atlDeals.push({
        ...deal,
        minPrice,
        maxPrice: Math.round(maxPrice),
        prevLow,
        avgPrice: Math.round(avgPrice ?? 0),
        priceCount,
        firstSeenTs: firstSeenTs ? firstSeenTs * 1000 : Date.now(), // ms
        discountPct,
        verdict,
        priceHistory: chartPrices,
        percentile: percentile ?? 1,
        runLength,
        freqAtOrBelow: freq.atOrBelow,
        scrapedAt: Date.now(),
      })
    }

    // Send AT MOST ONE notification per scrape, only for deals we've never notified about.
    // - 0 new deals: no notification
    // - 1 new deal:  send a single-deal notification (taps to that deal)
    // - 2+ new deals: send a digest "X new ATL deals" (taps to home feed)
    const newDeals = atlDeals.filter(d => !alreadyNotified.has(d.id))
    if (subscription && newDeals.length > 0) {
      try {
        if (newDeals.length === 1) {
          await sendDealNotification(subscription, newDeals[0])
        } else {
          await sendDigestNotification(subscription, newDeals)
        }
        await addNotifiedDealIds(newDeals.map(d => d.id))
      } catch (err) {
        console.error('[scraper] push failed (continuing):', err.message)
      }
    }

    const top50 = atlDeals.sort((a, b) => b.discountPct - a.discountPct).slice(0, 50)
    await setDealsSnapshot({ deals: top50, updatedAt: Date.now() })
    await setLastScrapeTs()

    // Wishlist push: notify the user when a saved product appears in this
    // run AT OR BELOW its saved-when price. We push only when the price
    // strictly drops vs the last price we pushed about, so flat prices don't
    // re-spam every hour. These pushes piggyback on the same subscription as
    // the digest; we send one per saved drop (low volume — Ahmed's wishlist).
    let savedPushed = 0
    if (subscription) {
      const savedMap = await getSavedDeals()
      const lastPushed = await getSavedNotifiedMap()
      const liveById = Object.fromEntries(allDeals.map(d => [d.id, d]))
      for (const [id, saved] of Object.entries(savedMap)) {
        const live = liveById[id]
        if (!live) continue // saved item not in today's scrape — skip
        const target = saved.savedAtPrice
        if (typeof target !== 'number' || live.currentPrice > target) continue
        const prev = lastPushed[id]
        // Re-push only when the price moved further down than last alert.
        // First-ever push: always send.
        if (prev !== undefined && live.currentPrice >= prev) continue
        try {
          await sendDealNotification(subscription, {
            ...live,
            // Use a watchful prefix so the user knows it's a wishlist alert,
            // not the daily digest.
            name: `★ ${live.name}`,
          })
          await setSavedNotifiedPrice(id, live.currentPrice)
          savedPushed++
        } catch (err) {
          console.error(`[scraper] saved push failed for ${id}:`, err.message)
        }
      }
    }

    console.log(`[scraper] done — ${top50.length} ATL deals uploaded, ${newDeals.length} new (notified), ${savedPushed} saved-deal pushes`)

    // Watcher pass: re-check N known products that did NOT appear in today's
    // /deals listing, so their price history keeps growing even after they
    // fall off the deals feed. Writes to SQLite only — does not touch the
    // user-facing snapshot. See scraper/watcher.js.
    try {
      const seenIds = allDeals.map(d => d.id)
      await runWatcher(db, { excludeIds: seenIds, limit: 12 })
    } catch (err) {
      console.error('[scraper] watcher failed (continuing):', err.message)
    }
  } finally {
    db.close()
  }
}

runScrape().catch(err => {
  console.error('[scraper] fatal:', err)
  process.exit(1)
})
