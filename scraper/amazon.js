import { chromium } from 'playwright'

const DEALS_URL = 'https://www.amazon.eg/deals'

export async function scrapeAmazon() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    })

    await page.goto(DEALS_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })

    // scroll to trigger lazy loading
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight))
      await page.waitForTimeout(800)
    }

    const deals = await page.evaluate(() => {
      const cards = document.querySelectorAll('[data-testid="deal-card"], .DealCard, .a-fixed-left-grid-inner')
      const results = []

      cards.forEach(card => {
        try {
          const nameEl = card.querySelector('[data-testid="title"], .a-truncate-full, .dealTitle')
          const curPriceEl = card.querySelector('[data-testid="price-section"] .a-price-whole, .dealPriceText')
          const origPriceEl = card.querySelector('[data-testid="was-price"], .a-text-price .a-offscreen')
          const imageEl = card.querySelector('img')
          const linkEl = card.querySelector('a[href]')

          const name = nameEl?.textContent?.trim()
          const currentPrice = parseFloat(curPriceEl?.textContent?.replace(/[^0-9.]/g, '') || '')
          const originalPrice = parseFloat(origPriceEl?.textContent?.replace(/[^0-9.]/g, '') || '')

          if (!name || isNaN(currentPrice)) return

          const href = linkEl?.getAttribute('href') || ''
          const url = href.startsWith('http') ? href : `https://www.amazon.eg${href}`
          const asinMatch = url.match(/\/dp\/([A-Z0-9]{10})/)
          const asin = asinMatch?.[1]
          if (!asin) return

          results.push({
            id: `amz-${asin}`,
            name,
            store: 'amazon',
            url,
            imageUrl: imageEl?.src || '',
            category: 'general',
            currentPrice,
            originalPrice: isNaN(originalPrice) ? currentPrice : originalPrice,
            asin,
          })
        } catch (_) {}
      })

      return results
    })

    console.log(`[amazon] scraped ${deals.length} deals`)
    return deals
  } catch (err) {
    console.error(`[amazon] failed:`, err.message)
    return []
  } finally {
    await browser.close()
  }
}
