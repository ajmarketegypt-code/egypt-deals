// Local wishlist store. Backed by localStorage so it survives reloads / PWA
// relaunches. The shape is { [dealId]: SavedDeal } so toggling is O(1) and
// /saved can render straight from the value list.
//
// We also POST to /api/wishlist on every change so the scraper can match
// saved IDs against each run and push when a watched product hits or beats
// its saved-when price (see scraper/index.js).

export interface SavedDeal {
  id: string
  name: string
  store: 'amazon' | 'noon'
  url: string
  imageUrl: string
  savedAt: number       // ms
  savedAtPrice: number  // current price when starred
}

const KEY = 'deals_wishlist_v1'

function read(): Record<string, SavedDeal> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Record<string, SavedDeal>
  } catch {
    return {}
  }
}

function write(map: Record<string, SavedDeal>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
    // Notify other tabs / components in the same window. Storage events fire
    // cross-tab; CustomEvent fires same-tab.
    window.dispatchEvent(new CustomEvent('wishlist-change'))
  } catch { /* full / disabled */ }
}

export function getWishlist(): Record<string, SavedDeal> {
  return read()
}

export function isSaved(id: string): boolean {
  return !!read()[id]
}

export async function saveDeal(d: SavedDeal): Promise<void> {
  const map = read()
  map[d.id] = d
  write(map)
  // Best-effort sync to backend; don't block the UI on it. Scraper-side push
  // integration depends on this — failures are silent because the local
  // wishlist remains correct either way.
  try {
    await fetch('/api/wishlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(d),
    })
  } catch { /* offline — scraper will miss this until next save */ }
}

export async function unsaveDeal(id: string): Promise<void> {
  const map = read()
  delete map[id]
  write(map)
  try {
    await fetch('/api/wishlist?id=' + encodeURIComponent(id), { method: 'DELETE' })
  } catch { /* offline */ }
}
