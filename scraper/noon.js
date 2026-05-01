import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SALE_URL = 'https://www.noon.com/en-eg/sale/'

async function stealthBrowser() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--lang=en-US'],
  })
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-US',
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  })
  const page = await context.newPage()
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined })
    window.chrome = { runtime: {} }
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3] })
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] })
  })
  return { browser, page }
}

export async function scrapeNoon() {
  const { browser, page } = await stealthBrowser()

  try {
    // Use domcontentloaded — networkidle times out due to Cloudflare challenge scripts
    await page.goto(SALE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(3000)

    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight))
      await page.waitForTimeout(800)
    }

    const html = await page.content()
    const debugPath = path.join(__dirname, 'data', 'noon-debug.html')
    fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true })
    fs.writeFileSync(debugPath, html)

    const deals = await page.evaluate(() => {
      const selectors = [
        '[data-qa="product-block"]',
        '[class*="productContainer"]',
        '[class*="ProductBlock"]',
        '[class*="product-block"]',
        'article[class*="product"]',
        '[class*="catalogCard"]',
        '[class*="CatalogCard"]',
        'div[class*="product"][data-id]',
      ]

      let cards = []
      for (const sel of selectors) {
        const found = [...document.querySelectorAll(sel)]
        if (found.length > 0) { cards = found; break }
      }

      const results = []
      cards.forEach(card => {
        try {
          const nameEl = card.querySelector('[data-qa="product-name"], .name, h3, [class*="productName"], [class*="ProductName"]')
          const name = nameEl?.textContent?.trim()
          if (!name || name.length < 3) return

          const curPriceEl = card.querySelector('[data-qa="price-current"], [class*="priceNow"], [class*="PriceNow"], [class*="price-now"], [class*="currentPrice"]')
          const origPriceEl = card.querySelector('[data-qa="price-was"], [class*="priceWas"], [class*="PriceWas"], [class*="was-price"], [class*="originalPrice"]')

          const currentPrice = parseFloat(curPriceEl?.textContent?.replace(/[^0-9.]/g, '') || '')
          if (isNaN(currentPrice) || currentPrice === 0) return

          const originalPrice = origPriceEl
            ? parseFloat(origPriceEl.textContent.replace(/[^0-9.]/g, ''))
            : currentPrice

          const imageEl = card.querySelector('img[src]')
          const linkEl  = card.closest('a[href]') || card.querySelector('a[href]')
          const href = linkEl?.getAttribute('href') || ''
          if (!href) return

          const url = href.startsWith('http') ? href : `https://www.noon.com${href}`
          // Build a stable ID from the href slug
          const slug = href.split('/').filter(Boolean).pop()?.slice(0, 60) || href.replace(/[^a-z0-9]/gi, '-').slice(0, 60)

          results.push({
            id: `noon-${slug}`,
            name,
            store: 'noon',
            url,
            imageUrl: imageEl?.src || '',
            category: 'general',
            currentPrice,
            originalPrice,
          })
        } catch (_) {}
      })

      return results
    })

    console.log(`[noon] scraped ${deals.length} deals (page body: ${html.length} chars)`)
    return deals
  } catch (err) {
    console.error(`[noon] failed:`, err.message)
    return []
  } finally {
    await browser.close()
  }
}
