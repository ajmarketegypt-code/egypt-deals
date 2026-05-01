// Noon scraper using raw HTTP fetch on category landing pages.
//
// Why this works (when /sale/ + Playwright don't):
// - Noon's /sale/ URL currently returns "0 results" — broken on their side
// - Cloudflare aggressively blocks Playwright-driven Chrome via HTTP/2 protocol
//   layer, but it lets through plain Node fetch with a normal browser UA
// - Category landing pages are server-side rendered, so all product data is
//   present in the raw HTML (no JS execution needed)
//
// We fetch a curated set of category roots, parse with regex, then dedupe
// by product ID across categories.

import { classify } from './classify.js'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// URL patterns that empirically return product listings — Noon's URL taxonomy
// is inconsistent: some slugs return marketing landing pages with 0 products,
// others return real PLPs with 30-50 products. Verified working as of 2026-05-01.
// If a URL starts 404'ing, replace it with one from `curl https://www.noon.com/egypt-en/`.
const CATEGORY_URLS = [
  'https://www.noon.com/egypt-en/electronics-and-mobiles/',                               // ~34 products
  'https://www.noon.com/egypt-en/electronics-and-mobiles/mobiles-and-accessories/mobiles-20905/', // ~49
  'https://www.noon.com/egypt-en/electronics-and-mobiles/wearable-technology/',           // ~37
  'https://www.noon.com/egypt-en/computers/laptops/',                                     // ~46
  'https://www.noon.com/egypt-en/home-and-kitchen/',                                      // ~3
  'https://www.noon.com/egypt-en/fashion/men-fashion/',                                   // ~3
  'https://www.noon.com/egypt-en/fashion/women-fashion/',                                 // ~3
  'https://www.noon.com/egypt-en/sports-and-outdoors/',                                   // ~1
]

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.text()
}

// Extract product cards from a Noon category page HTML
function extractDeals(html) {
  // Each product is wrapped in an <a> linking to /egypt-en/<slug>/N<id>V/p/?o=<hash>
  const linkBlockRe = /<a [^>]*href="(\/egypt-en\/[^"]+\/N\d+V\/p\/[^"]*)"[\s\S]*?<\/a>/g
  const blocks = [...html.matchAll(linkBlockRe)]
  const deals = []

  for (const m of blocks) {
    const href = m[1]
    const block = m[0]

    // Product ID: the N<digits>V token in the URL
    const idMatch = href.match(/\/(N\d+V)\//)
    if (!idMatch) continue
    const productId = idMatch[1]

    // Name: prefer the productImagePLP data-qa attribute (clean, no decorations)
    let name = block.match(/data-qa="productImagePLP_([^"]+)"/)?.[1]
    // Fallback: image alt text minus " - Image N" suffix
    if (!name) {
      const altMatch = block.match(/<img[^>]*class="[^"]*productImage[^"]*"[^>]*alt="([^"]+)"/)
      name = altMatch?.[1]?.replace(/\s*-\s*Image\s+\d+\s*$/i, '')
    }
    // Last resort: humanize the slug
    if (!name) {
      name = href.split('/').slice(2, -3).pop()?.replace(/-/g, ' ') || ''
    }
    name = name.trim()
    if (!name || name.length < 3) continue

    // Current price: the .amount strong inside plp-product-box-price
    const priceMatch = block.match(/data-qa="plp-product-box-price"[\s\S]*?<strong class="[^"]*amount[^"]*">([\d,.]+)</)
    if (!priceMatch) continue
    const currentPrice = parseFloat(priceMatch[1].replace(/,/g, ''))
    if (isNaN(currentPrice) || currentPrice <= 0) continue

    // Was/original price (when shown via strikethrough)
    const wasMatch = block.match(/wasPrice[\s\S]*?>([\d,.]+)</)
      || block.match(/oldPrice[\s\S]*?>([\d,.]+)</)
    const originalPrice = wasMatch
      ? parseFloat(wasMatch[1].replace(/,/g, ''))
      : currentPrice

    // First product image (skip placeholder.svg)
    const imgMatch = block.match(/<img[^>]*class="[^"]*productImage[^"]*"[^>]*src="([^"]+)"/)
    const imageUrl = imgMatch?.[1] || ''

    deals.push({
      id: `noon-${productId}`,
      name,
      store: 'noon',
      url: `https://www.noon.com${href}`,
      imageUrl,
      category: 'general', // overwritten by classify() below
      currentPrice,
      originalPrice,
    })
  }

  return deals
}

export async function scrapeNoon() {
  const all = []
  const seenIds = new Set()

  for (const url of CATEGORY_URLS) {
    try {
      const html = await fetchPage(url)
      const deals = extractDeals(html)
      let added = 0
      for (const d of deals) {
        if (seenIds.has(d.id)) continue
        seenIds.add(d.id)
        all.push(d)
        added++
      }
      console.log(`[noon] ${added} new from ${url} (${deals.length} on page)`)
    } catch (err) {
      console.log(`[noon] failed ${url}: ${err.message.slice(0, 100)}`)
    }
    // Light delay between pages — be polite, don't hammer
    await new Promise(r => setTimeout(r, 1000))
  }

  // Classify all by title (Pass 1, in-process)
  for (const d of all) d.category = classify(d.name)

  console.log(`[noon] scraped ${all.length} unique deals across ${CATEGORY_URLS.length} categories`)
  return all
}
