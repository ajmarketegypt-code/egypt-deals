import { firefox, chromium } from 'playwright'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { classify } from './classify.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Try multiple URLs — sale page is the most aggressively Cloudflare-protected.
// Category landing pages often slip through.
const URLS = [
  'https://www.noon.com/egypt-en/sale/',
  'https://www.noon.com/egypt-en/electronics-and-mobiles/',
  'https://www.noon.com/egypt-en/home-and-kitchen/',
]

const FIREFOX_UA = 'Mozilla/5.0 (Windows NT 10.0; rv:128.0) Gecko/20100101 Firefox/128.0'

async function tryFirefox(url) {
  const browser = await firefox.launch({ headless: true })
  const context = await browser.newContext({
    userAgent: FIREFOX_UA,
    locale: 'en-US',
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
  })
  const page = await context.newPage()
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(3000)
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight))
      await page.waitForTimeout(700)
    }
    const html = await page.content()
    const deals = await page.evaluate(extractDeals)
    return { html, deals, browser }
  } catch (err) {
    await browser.close()
    throw err
  }
}

async function tryChromium(url) {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled', '--disable-http2'],
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
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForTimeout(3000)
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight))
      await page.waitForTimeout(700)
    }
    const html = await page.content()
    const deals = await page.evaluate(extractDeals)
    return { html, deals, browser }
  } catch (err) {
    await browser.close()
    throw err
  }
}

// Runs inside page.evaluate — must be self-contained
function extractDeals() {
  const selectors = [
    '[data-qa="product-block"]',
    '[class*="productContainer"]',
    '[class*="ProductBlock"]',
    '[class*="catalogCard"]',
    'a[href*="/p/"]',
  ]
  let cards = []
  for (const sel of selectors) {
    const found = [...document.querySelectorAll(sel)]
    if (found.length > 5) { cards = found; break }
  }

  const results = []
  const seen = new Set()
  cards.forEach(card => {
    try {
      const linkEl = card.tagName === 'A' ? card : (card.querySelector('a[href*="/p/"]') || card.closest('a[href]'))
      const href = linkEl?.getAttribute('href') || ''
      if (!href) return
      if (seen.has(href)) return
      seen.add(href)

      const url = href.startsWith('http') ? href : `https://www.noon.com${href}`

      const imageEl = card.querySelector('img')
      let name = imageEl?.getAttribute('alt')?.trim() || ''
      if (!name || name.length < 3) {
        const nameEl = card.querySelector('[data-qa="product-name"], h2, h3, [class*="productName"], [class*="ProductName"], [class*="title"]')
        name = nameEl?.textContent?.trim() || ''
      }
      if (!name || name.length < 3) return

      const text = card.textContent || ''
      const priceMatches = [...text.matchAll(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*EGP|EGP\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/g)]
        .map(m => parseFloat((m[1] || m[2]).replace(/,/g, '')))
        .filter(n => !isNaN(n) && n > 0)
      if (priceMatches.length === 0) return

      const currentPrice = Math.min(...priceMatches)
      const originalPrice = priceMatches.length > 1 ? Math.max(...priceMatches) : currentPrice

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
}

export async function scrapeNoon() {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true })

  const attempts = [
    { fn: tryFirefox, label: 'firefox' },
    { fn: tryChromium, label: 'chromium' },
  ]

  for (const url of URLS) {
    for (const { fn, label } of attempts) {
      let browser = null
      try {
        const result = await fn(url)
        browser = result.browser
        const { html, deals } = result

        if (deals.length > 0) {
          fs.writeFileSync(path.join(__dirname, 'data', 'noon-debug.html'), html)
          for (const d of deals) d.category = classify(d.name)
          console.log(`[noon] scraped ${deals.length} deals via ${label} (${url}, ${html.length} chars)`)
          await browser.close()
          return deals
        }
        console.log(`[noon] 0 deals via ${label} at ${url} (${html.length} chars) — trying next`)
        await browser.close()
      } catch (err) {
        console.log(`[noon] ${label} failed at ${url}: ${err.message.slice(0, 100)}`)
        if (browser) { try { await browser.close() } catch (_) {} }
      }
    }
  }

  console.error('[noon] all attempts failed')
  return []
}
