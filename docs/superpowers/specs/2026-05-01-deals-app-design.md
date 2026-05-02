# Amazon & Noon Egypt Deals App — Design Spec

**Date:** 2026-05-01  
**Owner:** Ahmed (personal use)  
**Status:** Approved for implementation

---

## Overview

A personal iPhone PWA that surfaces Amazon.eg and Noon.eg all-time low prices in real time. No API costs, no subscriptions, runs forever for free. Push notifications alert Ahmed when a product hits its lowest price ever.

---

## Goals

- Show only real all-time low prices (not fake discounts)
- Never show expired deals (price went back up)
- Always load fresh data on app open
- Send push notifications when a new all-time low is found
- Deep-link into native Amazon / Noon iPhone apps with one tap
- Zero ongoing cost

---

## Non-Goals

- No social features, no sharing, no user accounts
- No AI API calls (smart verdict is rule-based only)
- No iOS App Store release
- No support for other users

---

## Architecture

### Frontend — Next.js 14 PWA
- Deployed to Vercel (account: ajbns1994@gmail.com)
- Installed on iPhone via Safari → "Add to Home Screen"
- Dark theme throughout
- Three screens: Feed, Deal Detail, Settings

### Scraper — Node.js + Playwright
- Runs on Ahmed's Windows PC via Windows Task Scheduler
- Frequency: every 1 hour
- Targets: Amazon.eg Today's Deals page + Noon.eg Sale/Offers page
- Extracts: product name, current price, original price, image URL, product URL, category
- After each run: saves top 50 all-time lows as JSON to Upstash Redis (`deals_snapshot` key)
- Triggers Web Push notification for any newly detected all-time low
- Also polls Upstash every 60s for a `scrape_requested` flag (set by PWA pull-to-refresh)

### Price History Database — SQLite (local)
- File stored on Ahmed's PC at `G:\Amazon and noon deals\scraper\data\prices.db`
- Tables: `products`, `price_history`
- All-time low detection: `SELECT MIN(price) FROM price_history WHERE product_id = ?`
- Minimum 3 scrape records required before a product can be flagged as all-time low (prevents new-product false positives)
- Deals are expired automatically if the latest scrape shows price above the recorded all-time low

### Push Notifications — Web Push (free)
- VAPID keys generated once, stored in `scraper/.env`
- iPhone registers push subscription when app is first opened on home screen → POSTed to `/api/push` on Vercel → stored in Upstash Redis (`push_subscription` key)
- Scraper reads subscription from Upstash, sends push via `web-push` npm package
- Notification payload: product name, current price, discount %, deep link URL
- Requires: iOS 16.4+, PWA installed to home screen (not Safari browser tab)

### Upstash Redis (free tier — single store for everything)
- `push_subscription` — iPhone push token (written by PWA, read by scraper)
- `deals_snapshot` — latest top-50 deals JSON, ~10KB (written by scraper, read by PWA)
- `scrape_requested` — flag set by PWA pull-to-refresh, polled and cleared by scraper
- Free tier: 10,000 requests/day — actual usage ~50–100/day well within limits

---

## Scrape Targets

| Store | Page | URL |
|---|---|---|
| Amazon Egypt | Today's Deals | `https://www.amazon.eg/deals` |
| Noon Egypt | Sale / Offers | `https://www.noon.com/en-eg/sale/` |

Playwright visits each page, scrolls to load all visible deals, extracts product cards. No login required. Both pages are publicly accessible.

---

## Screens

### 1. Feed (Home)
- Header: app name + "Last updated X minutes ago"
- Filter tabs: All · Amazon · Noon · Daily Essentials
- Deal cards sorted: all-time lows first, then biggest % drop
  - Product image (placeholder if unavailable)
  - Product name (truncated to 2 lines)
  - Current price (green, large)
  - Original price (strikethrough)
  - Discount % badge (green)
  - "ALL-TIME LOW 🎉" label
  - "NEW" badge if appeared since last app open (tracked in localStorage)
  - Source badge: Amazon or Noon
- Pull-to-refresh: sets `scrape_requested` flag in Upstash; scraper picks it up within 60s and runs; feed auto-refreshes when new snapshot appears
- Empty state: "No all-time lows found yet — scraper checks every hour"

### 2. Deal Detail (tap any deal card)
- Product name + image
- Price hero: current price (large green) + original (strikethrough) + discount %
- "ALL-TIME LOW 🎉" banner
- Stats row: Previous Low · Average Price · Tracked Since
- Price history chart (SVG line chart, up to 6-month window, green dot at current lowest price)
- Smart verdict (rule-based, no API — see logic below)
- CTA button: "Open on Amazon →" or "Open on Noon →"
  - Attempts native app deep link (`amazon://` or `noon://` URL scheme)
  - Falls back to website URL after 500ms if app not installed
  - `noon://` scheme to be verified at build time; falls back to web if unconfirmed
- Watch button (🔔): marks product for priority notifications (stored in localStorage)
- Share button (📤): copies product URL + price to clipboard

### 3. Settings
- Push notifications toggle (on/off)
- Scrape frequency display (always 1 hour for now, editable later)
- "Run scrape now" button → sets `scrape_requested` flag in Upstash
- Last scrape timestamp
- Total products tracked

---

## Smart Verdict Logic (rule-based, zero API cost)

```
Requires minimum 3 price records before showing verdict.

Step 1 — vs previous low:
  current < 90% of previousLow  → "Significantly below the previous record — great time to buy"
  current 90–99% of previousLow → "Matches previous all-time low — solid deal"
  current == only record         → (no verdict yet — need more data)

Step 2 — price trend (last 4 scrapes, appended to step 1):
  all decreasing → "Price has been falling for X weeks"
  all increasing → "Price was rising before this drop — likely limited time"
  mixed          → "Price is volatile"

Step 3 — rarity (appended):
  seen at this price 0 times before → "This price has never been seen before"
  seen 1–2 times before             → "Rarely this low"
  (otherwise: no rarity note)
```

---

## Deep Linking

| Store  | Scheme | Fallback |
|--------|--------|----------|
| Amazon | `amazon://` | `https://www.amazon.eg/dp/{asin}` |
| Noon   | `noon://` (verify at build) | `https://www.noon.com/en-eg/{slug}` |

Implementation: set `window.location.href` to app scheme, `setTimeout(500ms)` fallback to website URL.

---

## Data Flow

```
Every 1 hour (Windows Task Scheduler):
  scraper.js runs
  → Playwright opens amazon.eg/deals + noon.com/en-eg/sale/
  → scrolls page, extracts all deal cards
  → upserts products + prices into SQLite
  → detects all-time lows (MIN price, ≥3 records)
  → removes expired deals (current price > recorded ATL)
  → writes top-50 deals JSON to Upstash (deals_snapshot)
  → for each new all-time low:
      reads push_subscription from Upstash
      sends Web Push notification to iPhone

Every 60 seconds (scraper polling loop):
  → checks Upstash for scrape_requested flag
  → if set: clears flag, runs immediate scrape

On app open (iPhone):
  → fetches deals_snapshot from Upstash via /api/deals Vercel route
  → marks new deals with "NEW" badge (compares to localStorage last-seen list)
  → if push not registered: requests permission → POSTs subscription to /api/push

On pull-to-refresh:
  → sets scrape_requested flag in Upstash via /api/request-scrape Vercel route
  → polls /api/deals every 5s until snapshot timestamp updates
  → shows spinner until fresh data arrives

On deal tap:
  → navigates to /deal/[id]
  → price history loaded from deals_snapshot (already in memory)

On "Open on Amazon/Noon" tap:
  → attempts native app URL scheme
  → 500ms timeout → falls back to website in Safari
```

---

## Tech Stack

| Layer | Technology | Cost |
|---|---|---|
| Frontend | Next.js 14 + Tailwind CSS + shadcn/ui | Free |
| Hosting | Vercel (ajbns1994@gmail.com) | Free |
| Scraper | Node.js + Playwright | Free |
| Database | SQLite (better-sqlite3) | Free |
| Push | web-push npm package | Free |
| Cloud store | Upstash Redis free tier | Free |
| Task Scheduler | Windows Task Scheduler | Free |
| Charts | Plain SVG (no library) | Free |

**Total monthly cost: EGP 0**

---

## File Structure

```
G:\Amazon and noon deals\
├── app\
│   ├── page.tsx                  # Feed screen
│   ├── deal\[id]\page.tsx        # Deal Detail screen
│   ├── settings\page.tsx         # Settings screen
│   └── api\
│       ├── deals\route.ts        # Proxies deals_snapshot from Upstash
│       ├── push\route.ts         # Saves push subscription to Upstash
│       └── request-scrape\route.ts  # Sets scrape_requested flag in Upstash
├── scraper\
│   ├── index.js                  # Entry point + Task Scheduler target
│   ├── amazon.js                 # Amazon.eg Today's Deals scraper
│   ├── noon.js                   # Noon.eg Sale page scraper
│   ├── db.js                     # SQLite helpers (better-sqlite3)
│   ├── atl.js                    # All-time low detection logic
│   ├── push.js                   # Web Push sender (web-push)
│   ├── upstash.js                # Upstash read/write helpers
│   ├── poll.js                   # 60s polling loop for scrape_requested
│   └── data\prices.db            # SQLite file (auto-created)
├── public\
│   ├── manifest.json             # PWA manifest (icons, theme, standalone)
│   └── sw.js                     # Service worker (push events + offline shell)
├── .env.local                    # Upstash URL + token, VAPID keys, upload secret
└── docs\superpowers\specs\
    └── 2026-05-01-deals-app-design.md
```

---

## Known Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Amazon anti-bot (CAPTCHA, IP block) | Medium | Playwright mimics real browser; add random delays between actions; if blocked, scraper skips Amazon that run without crashing |
| Noon URL scheme (`noon://`) not working | Low | Falls back to website automatically |
| iOS push not delivered | Low | Requires iOS 16.4+ and PWA installed to home screen; documented in Settings screen |
| Vercel cold start on /api routes | Very low | Routes are lightweight proxies; Upstash handles data |

---

## Out of Scope (future)

- Watchlist with custom price targets
- Multiple users / family sharing
- Android support
- Price alerts from other stores (Jumia, Carrefour)
- Browser extension
