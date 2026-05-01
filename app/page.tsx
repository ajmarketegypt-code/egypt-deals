'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DealCard } from '@/components/DealCard'
import { FilterTabs, type StoreTab, type CategoryTab } from '@/components/FilterTabs'
import { registerPush } from '@/lib/push'
import type { Deal, DealsSnapshot } from '@/lib/types'

const SEEN_KEY = 'deals_seen_ids'

function timeAgo(ts: number) {
  const mins = Math.floor((Date.now() - ts) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  return `${Math.floor(mins / 60)}h ago`
}

export default function FeedPage() {
  const router = useRouter()
  const [snapshot, setSnapshot] = useState<DealsSnapshot | null>(null)
  const [store, setStore] = useState<StoreTab>('All')
  const [category, setCategory] = useState<CategoryTab>('All')
  const [search, setSearch] = useState('')
  const [seenIds, setSeenIds] = useState<Set<string>>(new Set())
  const [refreshing, setRefreshing] = useState(false)
  const touchStartY = useRef(0)
  const pulling = useRef(false)

  useEffect(() => {
    const saved = localStorage.getItem(SEEN_KEY)
    if (saved) setSeenIds(new Set(JSON.parse(saved)))
    fetchDeals()
    registerPush().catch(() => {})

    function onStart(e: TouchEvent) {
      touchStartY.current = e.touches[0].clientY
      pulling.current = false
    }
    function onMove(e: TouchEvent) {
      if (window.scrollY === 0 && e.touches[0].clientY - touchStartY.current > 10)
        pulling.current = true
    }
    function onEnd(e: TouchEvent) {
      const delta = e.changedTouches[0].clientY - touchStartY.current
      if (pulling.current && delta > 80 && window.scrollY === 0) handleRefresh()
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
    return deals.filter((d: Deal) => {
      if (store === 'Amazon' && d.store !== 'amazon') return false
      if (store === 'Noon' && d.store !== 'noon') return false
      if (category !== 'All' && d.category !== category) return false
      if (q && !d.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [deals, store, category, search])

  return (
    <main className="max-w-lg mx-auto px-4 pb-8 pt-safe">
      <div className="sticky top-0 bg-slate-900 pt-4 pb-2 z-10">
        <div className="flex justify-between items-center mb-3">
          <h1 className="text-xl font-bold">Egypt Deals</h1>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">
              {refreshing ? '⏳ Refreshing...' : snapshot?.updatedAt ? `Updated ${timeAgo(snapshot.updatedAt)}` : 'Loading...'}
            </span>
            <button onClick={() => router.push('/settings')} className="text-slate-400 text-lg">⚙️</button>
          </div>
        </div>

        <div className="relative mb-2">
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

        <FilterTabs
          store={store}
          category={category}
          onStoreChange={setStore}
          onCategoryChange={setCategory}
        />
      </div>

      <div className="flex flex-col gap-3 mt-4">
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
