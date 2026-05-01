import { chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { classify } from './classify.js'

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

    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight))
      await page.waitForTimeout(600)
    }

    const html = await page.content()
    fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true })
    fs.writeFileSync(path.join(__dirname, 'data', 'amazon-debug.html'), html)

    const deals = await page.evaluate(() => {
      let cards = [...document.querySelectorAll('[data-testid="product-card"]')]
      if (cards.length === 0) {
        for (const sel of ['[data-asin]:not([data-asin=""])', '.s-result-item[data-asin]']) {
          const found = [...document.querySelectorAll(sel)]
          if (found.length > 0) { cards = found; break }
        }
      }

      const results = []
      cards.forEach(card => {
        try {
          const asin = card.getAttribute('data-asin')
          if (!asin || asin.length !== 10) return

          // Name: full text in the offscreen truncate span (avoids "Limited time deal" badge)
          let name = ''
          for (const el of card.querySelectorAll('.a-truncate-full, .a-truncate-cut')) {
            const t = el.textContent?.trim() || ''
            if (t.length > 10 && !t.toLowerCase().includes('deals from') && !t.toLowerCase().includes('limited time')) {
              name = t
              break
            }
          }
          if (!name || name.length < 3) return

          // Prices from offscreen accessibility spans: "Deal Price: EGP 286.20" / "Was: EGP 318.00"
          let currentPrice = NaN, originalPrice = NaN
          for (const s of card.querySelectorAll('span.a-offscreen')) {
            const t = s.textContent?.trim() || ''
            if (t.startsWith('Deal Price:') || t.startsWith('Now:')) {
              currentPrice = parseFloat(t.replace(/[^0-9.]/g, ''))
            } else if (t.startsWith('Was:')) {
              originalPrice = parseFloat(t.replace(/[^0-9.]/g, ''))
            }
          }

          // Fallback: .a-price-whole + .a-price-fraction
          if (isNaN(currentPrice)) {
            const priceWhole = card.querySelector('.a-price-whole')
            const priceFrac  = card.querySelector('.a-price-fraction')
            if (priceWhole) {
              const whole = priceWhole.textContent.replace(/[^0-9]/g, '')
              const frac  = priceFrac?.textContent.replace(/[^0-9]/g, '') || '0'
              currentPrice = parseFloat(`${whole}.${frac}`)
            }
          }
          if (isNaN(currentPrice) || currentPrice === 0) return
          if (isNaN(originalPrice) || originalPrice <= 0) originalPrice = currentPrice

          const imageEl = card.querySelector('img[src]')
          const linkEl  = card.querySelector('[data-testid="product-card-link"], a[href*="/dp/"]')
          const href = linkEl?.getAttribute('href') || ''
          const url  = href.startsWith('http') ? href : `https://www.amazon.eg${href}`

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

    // Classify by title (Pass 1, in-process — no extra requests)
    for (const d of deals) d.category = classify(d.name)

    console.log(`[amazon] scraped ${deals.length} deals (page body: ${html.length} chars)`)
    return deals
  } catch (err) {
    console.error(`[amazon] failed:`, err.message)
    return []
  } finally {
    await browser.close()
  }
}
