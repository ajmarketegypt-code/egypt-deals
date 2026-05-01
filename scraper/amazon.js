import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEALS_URL = 'https://www.amazon.eg/deals'

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

export async function scrapeAmazon() {
  const { browser, page } = await stealthBrowser()

  try {
    await page.goto(DEALS_URL, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(2000)

    // scroll to load lazy cards
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight))
      await page.waitForTimeout(600)
    }

    // Save debug snapshot on first run if empty
    const html = await page.content()
    const debugPath = path.join(__dirname, 'data', 'amazon-debug.html')
    fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true })
    fs.writeFileSync(debugPath, html)

    const deals = await page.evaluate(() => {
      // Primary selector confirmed from debug HTML inspection
      let cards = [...document.querySelectorAll('[data-testid="product-card"]')]

      // Fallback selectors if primary fails
      if (cards.length === 0) {
        const fallbacks = [
          '[data-asin]:not([data-asin=""])',
          '[data-component-type="s-search-result"]',
          '.s-result-item[data-asin]',
        ]
        for (const sel of fallbacks) {
          const found = [...document.querySelectorAll(sel)]
          if (found.length > 0) { cards = found; break }
        }
      }

      const results = []
      cards.forEach(card => {
        try {
          const asin = card.getAttribute('data-asin') || card.id?.match(/[A-Z0-9]{10}/)?.[0]
          if (!asin || asin.length !== 10) return

          // Title: ProductCard-module__title_ confirmed from debug HTML
          const nameEl = card.querySelector('[class*="title_"], [data-testid="title"], h2 a span, .a-text-normal')
          const name = nameEl?.textContent?.trim()
          if (!name || name.length < 3) return

          // Price: .a-price-whole confirmed (30 elements found in debug)
          const priceWhole = card.querySelector('.a-price-whole')
          const priceFrac  = card.querySelector('.a-price-fraction')
          let currentPrice = NaN
          if (priceWhole) {
            const whole = priceWhole.textContent.replace(/[^0-9]/g, '')
            const frac  = priceFrac?.textContent.replace(/[^0-9]/g, '') || '0'
            currentPrice = parseFloat(`${whole}.${frac}`)
          }
          if (isNaN(currentPrice)) return

          // Original/was price
          const origEl = card.querySelector('.a-text-price .a-offscreen, [data-testid="was-price"] .a-offscreen, .a-price.a-text-price .a-offscreen')
          const originalPrice = origEl
            ? parseFloat(origEl.textContent.replace(/[^0-9.]/g, ''))
            : currentPrice

          const imageEl = card.querySelector('img[src]')
          // Link: data-testid="product-card-link" confirmed from debug HTML
          const linkEl  = card.querySelector('[data-testid="product-card-link"], a[href*="/dp/"], a[href]')
          const href = linkEl?.getAttribute('href') || ''
          const url  = href.startsWith('http') ? href : `https://www.amazon.eg${href}`

          const disc = originalPrice > 0 ? Math.round((1 - currentPrice / originalPrice) * 100) : 0
          if (disc < 5 && originalPrice === currentPrice) return

          results.push({
            id: `amz-${asin}`,
            name,
            store: 'amazon',
            url,
            imageUrl: imageEl?.src || '',
            category: 'general',
            currentPrice,
            originalPrice,
            asin,
          })
        } catch (_) {}
      })

      return results
    })

    console.log(`[amazon] scraped ${deals.length} deals (page body: ${html.length} chars)`)
    return deals
  } catch (err) {
    console.error(`[amazon] failed:`, err.message)
    return []
  } finally {
    await browser.close()
  }
}
