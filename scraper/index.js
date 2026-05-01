import 'dotenv/config'
import { initDb, upsertProduct, recordPrice, getMinPrice, getPriceCount, getPriceHistory, getAvgPrice, getSecondLowestPrice, getMaxPrice, getFirstSeenTs } from './db.js'
import { isAllTimeLow, buildSmartVerdict } from './atl.js'
import { scrapeAmazon } from './amazon.js'
import { scrapeNoon } from './noon.js'
import { sendDealNotification, sendDigestNotification } from './push.js'
import {
  getPushSubscription, setDealsSnapshot, setLastScrapeTs,
  getNotifiedDealIds, addNotifiedDealIds,
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

    console.log(`[scraper] done — ${top50.length} ATL deals uploaded, ${newDeals.length} new (notified)`)
  } finally {
    db.close()
  }
}

runScrape().catch(err => {
  console.error('[scraper] fatal:', err)
  process.exit(1)
})
