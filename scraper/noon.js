import { chromium } from 'playwright'

const SALE_URL = 'https://www.noon.com/en-eg/sale/'

export async function scrapeNoon() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  try {
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    })

    await page.goto(SALE_URL, { waitUntil: 'networkidle', timeout: 30000 })

    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight))
      await page.waitForTimeout(1000)
    }

    const deals = await page.evaluate(() => {
      const cards = document.querySelectorAll('[data-qa="product-block"], .productContainer, article')
      const results = []

      cards.forEach(card => {
        try {
          const nameEl = card.querySelector('[data-qa="product-name"], .name, h3')
          const curPriceEl = card.querySelector('[data-qa="price-current"], .priceNow, .price')
          const origPriceEl = card.querySelector('[data-qa="price-was"], .priceWas, .was-price')
          const imageEl = card.querySelector('img')
          const linkEl = card.closest('a') || card.querySelector('a[href]')

          const name = nameEl?.textContent?.trim()
          const currentPrice = parseFloat(curPriceEl?.textContent?.replace(/[^0-9.]/g, '') || '')
          const originalPrice = parseFloat(origPriceEl?.textContent?.replace(/[^0-9.]/g, '') || '')

          if (!name || isNaN(currentPrice)) return

          const href = linkEl?.getAttribute('href') || ''
          const url = href.startsWith('http') ? href : `https://www.noon.com${href}`
          const slug = href.replace(/[^a-z0-9-]/gi, '-').slice(0, 60)
          if (!slug) return

          results.push({
            id: `noon-${slug}`,
            name,
            store: 'noon',
            url,
            imageUrl: imageEl?.src || '',
            category: 'general',
            currentPrice,
            originalPrice: isNaN(originalPrice) ? currentPrice : originalPrice,
          })
        } catch (_) {}
      })

      return results
    })

    console.log(`[noon] scraped ${deals.length} deals`)
    return deals
  } catch (err) {
    console.error(`[noon] failed:`, err.message)
    return []
  } finally {
    await browser.close()
  }
}
