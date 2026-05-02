// Watcher pass — re-checks N known products that did NOT appear in today's
// /deals listing, so price history keeps accumulating even after a product
// falls off the deals feed. The whole point of this pass is to widen the
// data the verdict on the detail page reasons about: percentile rank, run
// length, and frequency-at-or-below all sharpen as N grows.
//
// Constraints baked in:
//   - DOES NOT touch the user-facing snapshot. Snapshot stays ATL-only from
//     the main scrape. Watcher only writes to SQLite (price_history).
//   - Sanity bounds on every write: rejects 0/NaN/negative, and prices
//     outside [0.1× existing min, 5× existing max]. A bogus parse must not
//     poison history.
//   - Selection: oldest products.updatedAt first, with priceCount >= 3 and
//     last seen within 90 days. Avoids hammering one-shot listings.
//   - Rotates which products get visited via the oldest-stale-first sort.
//   - Polite: 1.5s delay between requests, AbortSignal.timeout per fetch.

import { getStaleProductsForWatch, getMinPrice, getMaxPrice, recordPrice, upsertProduct } from './db.js'

const NOON_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const AMZN_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// Validate a freshly-parsed price against existing history. Returns true if
// the price is plausibly a real reading, false if it's almost certainly a
// parse error or page-shape change we should drop.
function isSane(db, productId, price) {
  if (!Number.isFinite(price) || price <= 0) return false
  const min = getMinPrice(db, productId)
  const max = getMaxPrice(db, productId)
  if (min === null || max === null) return false // never happens given our minSamples filter
  // 10× swing in either direction means the page shape probably changed
  // and we're parsing the wrong number. Better to skip than poison history.
  if (price < min * 0.1) return false
  if (price > max * 5) return false
  return true
}

// Noon PDP — raw fetch returns server-rendered HTML with the price in
// data-qa="div-price-now". Same approach as the PLP scraper, just one URL.
async function fetchNoonPrice(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': NOON_UA, 'Accept-Language': 'en-US,en;q=0.9' },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()
  // <div data-qa="div-price-now">...EGP...<span ...>7699.00</span></div>
  const m = html.match(/data-qa="div-price-now"[\s\S]{0,400}?priceNowText[^>]*>([\d,.]+)</)
  if (!m) throw new Error('price not found')
  const price = parseFloat(m[1].replace(/,/g, ''))
  if (!Number.isFinite(price) || price <= 0) throw new Error(`bad parse: ${m[1]}`)
  return price
}

// Amazon PDP — raw fetch (no Playwright; PDP is mostly static and Cloudflare/
// bot defenses are friendlier than to /dp on automation-flagged Chrome). We
// pull from the corePriceDisplay block; the first parseable EGP figure is
// the current selling price.
async function fetchAmazonPrice(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': AMZN_UA, 'Accept-Language': 'en-US,en;q=0.9' },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const html = await res.text()
  // Out-of-stock: PDP rendered but no price block. Don't treat as parse
  // failure — record nothing but don't log as fail.
  if (html.includes('Currently unavailable') && !html.match(/aok-offscreen[^>]*>\s*EGP/)) {
    throw new Error('out of stock')
  }
  // Captcha gate — only trip when the page is actually the captcha interstitial
  // (title is "Robot Check" / "Amazon.eg" with the api-services/captcha image).
  // Don't match the literal word in unrelated JS in the body of a 1.3 MB page.
  const titleMatch = html.match(/<title>([^<]+)<\/title>/)
  const title = titleMatch?.[1] ?? ''
  if (/Robot Check|Sorry! Something went wrong/i.test(title) || html.includes('opfcaptcha-prod.s3')) {
    throw new Error('captcha')
  }
  // Narrow to the corePriceDisplay block to avoid grabbing some other
  // product's strike-through (related-items modules use the same class).
  const block = html.match(/corePriceDisplay[\s\S]{0,8000}/)?.[0] ?? html

  // Strategy 1: aok-offscreen "EGP 900.00" (Amazon's accessibility label).
  // This is the cleanest source — it always matches the visible big price.
  const aok = block.match(/aok-offscreen[^>]*>\s*EGP\s*([\d,.]+)\s*</)
  if (aok) {
    const n = parseFloat(aok[1].replace(/,/g, ''))
    if (Number.isFinite(n) && n > 0) return n
  }

  // Strategy 2: a-price-whole + a-price-fraction (the visually-rendered price).
  // Format: <span class="a-price-whole">900<span class="a-price-decimal">.</span></span><span class="a-price-fraction">00</span>
  const whole = block.match(/<span class="a-price-whole">(\d[\d,]*)/)
  const frac  = block.match(/<span class="a-price-fraction">(\d+)/)
  if (whole) {
    const w = whole[1].replace(/,/g, '')
    const f = frac?.[1] ?? '0'
    const n = parseFloat(`${w}.${f}`)
    if (Number.isFinite(n) && n > 0) return n
  }

  // Strategy 3: legacy a-offscreen with EGP (older Amazon templates / some PDPs).
  const matches = block.matchAll(/<span class="a-offscreen">[^<]*?EGP\s*([\d,.]+)[^<]*<\/span>/g)
  for (const m of matches) {
    const n = parseFloat(m[1].replace(/,/g, ''))
    if (Number.isFinite(n) && n > 0) return n
  }
  throw new Error('price not found')
}

export async function runWatcher(db, { excludeIds = [], limit = 12 } = {}) {
  const targets = getStaleProductsForWatch(db, { excludeIds, limit })
  if (targets.length === 0) {
    console.log('[watcher] no stale products to refresh')
    return { ok: 0, skip: 0, fail: 0 }
  }

  console.log(`[watcher] refreshing ${targets.length} stale product(s)`)
  let ok = 0, skip = 0, fail = 0

  for (const t of targets) {
    try {
      const price = t.store === 'noon'
        ? await fetchNoonPrice(t.url)
        : await fetchAmazonPrice(t.url)

      if (!isSane(db, t.id, price)) {
        console.log(`[watcher] skip ${t.id} — insane price ${price} (min=${getMinPrice(db, t.id)} max=${getMaxPrice(db, t.id)})`)
        skip++
      } else {
        // Refresh updatedAt so this product rotates to the back of the watch
        // queue, even when the price is unchanged. We pass the existing row
        // through unchanged — name/url/imageUrl don't update from a watcher
        // pass (we don't reparse them).
        upsertProduct(db, t)
        recordPrice(db, t.id, price, null)
        ok++
      }
    } catch (err) {
      console.log(`[watcher] fail ${t.id}: ${err.message}`)
      fail++
    }
    // Be polite — 1.5s between watcher fetches. 12 products × 1.5s = 18s.
    await new Promise(r => setTimeout(r, 1500))
  }

  console.log(`[watcher] done — ${ok} recorded, ${skip} skipped, ${fail} failed`)
  return { ok, skip, fail }
}
