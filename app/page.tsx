'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DealCard } from '@/components/DealCard'
import { FilterTabs, type StoreTab, type CategoryTab } from '@/components/FilterTabs'
import { registerPush } from '@/lib/push'
import type { Deal, DealsSnapshot } from '@/lib/types'

const SEEN_KEY = 'deals_seen_ids'
const FILTERS_KEY = 'deals_filters_v1'

type SortKey = 'priceAsc' | 'priceDesc' | 'discount' | 'newest'
type SavedFilters = { store: StoreTab; category: CategoryTab; sortBy: SortKey }

function timeAgo(ts: number) {
  const mins = Math.floor((Date.now() - ts) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

// Read a filter value from localStorage, falling back to the default.
// Safe to call on the server (returns default during prerender).
function loadFilter<K extends keyof SavedFilters>(key: K, fallback: SavedFilters[K]): SavedFilters[K] {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(FILTERS_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<SavedFilters>
    return (parsed[key] ?? fallback) as SavedFilters[K]
  } catch { return fallback }
}

export default function FeedPage() {
  const router = useRouter()
  const [snapshot, setSnapshot] = useState<DealsSnapshot | null>(null)
  // Lazy-init from localStorage so filters persist across reloads / PWA relaunch.
  // Note: initial render is server-side (well, client during PWA, but Next prerenders),
  // so the initializer must check for window.
  const [store, setStore] = useState<StoreTab>(() => loadFilter('store', 'All'))
  const [category, setCategory] = useState<CategoryTab>(() => loadFilter('category', 'All'))
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<SortKey>(() => loadFilter('sortBy', 'priceAsc'))
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set())
  const [refreshing, setRefreshing] = useState(false)
  const touchStartY = useRef(0)
  const pulling = useRef(false)

  // Persist filters whenever they change so they survive reloads / PWA relaunch.
  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify({ store, category, sortBy }))
    } catch { /* localStorage full or disabled — silently skip */ }
  }, [store, category, sortBy])

  useEffect(() => {
    const saved = localStorage.getItem(SEEN_KEY)
    if (saved) setSeenIds(new Set(JSON.parse(saved)))
    fetchDeals()
    registerPush().catch(() => {})

    // PWA standalone mode: window.scrollY may stay 0 (the document doesn't scroll
    // — a child element does). Use document.scrollingElement.scrollTop OR
    // window.scrollY; whichever is bigger tells us if we're at the top.
    const isAtTop = () => {
      const a = window.scrollY || 0
      const b = document.scrollingElement?.scrollTop || 0
      return Math.max(a, b) < 2
    }

    function onStart(e: TouchEvent) {
      touchStartY.current = e.touches[0].clientY
      pulling.current = isAtTop()
    }
    function onMove(e: TouchEvent) {
      if (!pulling.current) return
      const delta = e.touches[0].clientY - touchStartY.current
      // Only stay in pulling state while user keeps moving down from top
      if (delta < -5 || !isAtTop()) pulling.current = false
    }
    function onEnd(e: TouchEvent) {
      if (!pulling.current) return
      const delta = e.changedTouches[0].clientY - touchStartY.current
      if (delta > 70) handleRefresh()
      pulling.current = false
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove',  onMove,  { passive: true })
    document.addEventListener('touchend',   onEnd,   { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove',  onMove)
      document.removeEventListener('touchend',   onEnd)
    }
  }, [])

  async function fetchDeals() {
    const res = await fetch('/api/deals')
    const data: DealsSnapshot = await res.json()
    setSnapshot(data)
    if (data.deals) {
      localStorage.setItem(SEEN_KEY, JSON.stringify(data.deals.map((d: Deal) => d.id)))
    }
  }

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await fetch('/api/request-scrape', { method: 'POST' })
      const before = snapshot?.updatedAt ?? 0
      for (let i = 0; i < 18; i++) {
        await new Promise(r => setTimeout(r, 5000))
        try {
          const res = await fetch('/api/deals')
          const data: DealsSnapshot = await res.json()
          if (data.updatedAt > before) { setSnapshot(data); break }
        } catch { /* network blip — try next iteration */ }
      }
    } finally {
      setRefreshing(false)
    }
  }

  const deals = snapshot?.deals ?? []
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const matched = deals.filter((d: Deal) => {
      if (store === 'Amazon' && d.store !== 'amazon') return false
      if (store === 'Noon' && d.store !== 'noon') return false
      if (category !== 'All' && d.category !== category) return false
      if (q && !d.name.toLowerCase().includes(q)) return false
      return true
    })
    // Apply sort — return a NEW array so React re-renders and we don't mutate snapshot
    const sorted = [...matched]
    if (sortBy === 'priceAsc')   sorted.sort((a, b) => a.currentPrice - b.currentPrice)
    if (sortBy === 'priceDesc')  sorted.sort((a, b) => b.currentPrice - a.currentPrice)
    if (sortBy === 'discount')   sorted.sort((a, b) => b.discountPct - a.discountPct)
    if (sortBy === 'newest')     sorted.sort((a, b) => (b.scrapedAt || 0) - (a.scrapedAt || 0))
    return sorted
  }, [deals, store, category, search, sortBy])

  return (
    <main className="max-w-lg mx-auto px-4 pb-8 pt-safe">
      <div className="sticky top-0 bg-slate-900 pt-4 pb-2 z-10">
        <div className="flex justify-between items-center mb-3">
          <h1 className="text-xl font-bold">Egypt Deals</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 text-xs text-slate-400 px-2 py-1.5 rounded-full bg-slate-800 active:opacity-60 disabled:opacity-50"
              aria-label="Refresh deals"
            >
              <span className={refreshing ? 'inline-block animate-spin' : ''}>{refreshing ? '⏳' : '↻'}</span>
              <span>{refreshing ? 'Refreshing' : snapshot?.updatedAt ? timeAgo(snapshot.updatedAt) : 'Loading'}</span>
            </button>
            <button
              onClick={() => router.push('/settings')}
              className="text-slate-400 text-lg w-9 h-9 flex items-center justify-center rounded-full active:bg-slate-800"
              aria-label="Settings"
            >⚙️</button>
          </div>
        </div>

        <div className="flex gap-2 mb-2">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
            <input
              type="text"
              inputMode="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search products..."
              className="w-full bg-slate-800 text-slate-100 placeholder-slate-500 rounded-full pl-9 pr-9 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 text-sm w-6 h-6 rounded-full hover:bg-slate-700"
                aria-label="Clear search"
              >×</button>
            )}
          </div>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as typeof sortBy)}
            className="bg-slate-800 text-slate-100 text-xs rounded-full px-3 pr-7 py-2 focus:outline-none focus:ring-2 focus:ring-blue-600 appearance-none bg-no-repeat bg-right"
            style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 12 12\'%3E%3Cpath fill=\'%2364748b\' d=\'M2 4l4 4 4-4z\'/%3E%3C/svg%3E")', backgroundPosition: 'right 0.5rem center', backgroundSize: '12px' }}
            aria-label="Sort deals"
          >
            <option value="priceAsc">Cheapest</option>
            <option value="priceDesc">Most expensive</option>
            <option value="discount">Best discount</option>
            <option value="newest">Newest</option>
          </select>
        </div>

        <FilterTabs
          store={store}
          category={category}
          onStoreChange={setStore}
          onCategoryChange={setCategory}
        />
      </div>

      {filtered.length === 0 && (
        <div className="text-center text-slate-500 py-16">
          <p className="text-4xl mb-3">🔍</p>
          <p className="text-sm">
            {deals.length === 0 ? 'No all-time lows found yet' : 'No deals match your filters'}
          </p>
          <p className="text-xs text-slate-600 mt-1">
            {deals.length === 0
              ? 'Scraper checks every hour — pull down to refresh now'
              : 'Try clearing the search or picking a different category'}
          </p>
        </div>
      )}
      {/*
        Two-column grid on every screen so the user can scan more deals at once.
        Each card is compact (smaller image, tighter padding).
      */}
      <div className="grid grid-cols-2 gap-2 mt-3">
        {filtered.map((deal: Deal) => (
          <DealCard
            key={deal.id}
            deal={deal}
            isNew={!seenIds.has(deal.id)}
            onClick={() => router.push(`/deal/${deal.id}`)}
          />
        ))}
      </div>
    </main>
  )
}
