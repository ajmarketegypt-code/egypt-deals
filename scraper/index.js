import 'dotenv/config'
import { initDb, upsertProduct, recordPrice, getMinPrice, getPriceCount, getPriceHistory, getAvgPrice, getSecondLowestPrice } from './db.js'
import { isAllTimeLow, buildSmartVerdict } from './atl.js'
import { scrapeAmazon } from './amazon.js'
import { scrapeNoon } from './noon.js'
import { sendDealNotification } from './push.js'
import { getPushSubscription, setDealsSnapshot, setLastScrapeTs } from './upstash.js'

const DB_PATH = './data/prices.db'

export async function runScrape() {
  console.log(`[scraper] run started ${new Date().toISOString()}`)
  const db = initDb(DB_PATH)

  const [amazonDeals, noonDeals] = await Promise.all([scrapeAmazon(), scrapeNoon()])
  const allDeals = [...amazonDeals, ...noonDeals]
  console.log(`[scraper] total deals: ${allDeals.length}`)

  for (const deal of allDeals) {
    upsertProduct(db, deal)
    recordPrice(db, deal.id, deal.currentPrice, deal.originalPrice)
  }

  const subscription = await getPushSubscription()
  const atlDeals = []

  for (const deal of allDeals) {
    const minPrice = getMinPrice(db, deal.id)
    const priceCount = getPriceCount(db, deal.id)

    if (!isAllTimeLow({ currentPrice: deal.currentPrice, minPrice, priceCount })) continue

    const history = getPriceHistory(db, deal.id)
    const recentPrices = history.slice(-4).map(h => h.price)
    const prevLow = getSecondLowestPrice(db, deal.id) ?? deal.currentPrice
    const avgPrice = getAvgPrice(db, deal.id)
    const discountPct = deal.originalPrice > 0
      ? Math.round((1 - deal.currentPrice / deal.originalPrice) * 100)
      : 0
    const seenAtThisPrice = history.filter(h => h.price === deal.currentPrice).length - 1
    const verdict = buildSmartVerdict({ currentPrice: deal.currentPrice, prevLow, recentPrices, seenAtThisPrice })

    atlDeals.push({
      ...deal,
      minPrice,
      prevLow,
      avgPrice: Math.round(avgPrice),
      discountPct,
      verdict,
      priceHistory: recentPrices,
      scrapedAt: Date.now(),
    })

    await sendDealNotification(subscription, { ...deal, discountPct })
  }

  const top50 = atlDeals.sort((a, b) => b.discountPct - a.discountPct).slice(0, 50)
  await setDealsSnapshot({ deals: top50, updatedAt: Date.now() })
  await setLastScrapeTs()

  console.log(`[scraper] done — ${atlDeals.length} ATL deals uploaded`)
  db.close()
}

runScrape().catch(err => {
  console.error('[scraper] fatal:', err)
  process.exit(1)
})
