'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getWishlist, unsaveDeal, type SavedDeal } from '@/lib/wishlist'
import type { Deal, DealsSnapshot } from '@/lib/types'

const fmtEGP = (n: number) => `EGP ${Math.round(n).toLocaleString('en-US')}`

// /saved — Ahmed's starred items. We hydrate the local list with the latest
// known price from the live snapshot when the same product happens to be in
// today's ATL feed. Items not in today's snapshot stay shown with their saved
// price so the user can still find them.
export default function SavedPage() {
  const router = useRouter()
  const [saved, setSaved] = useState<SavedDeal[]>([])
  const [snapshot, setSnapshot] = useState<DealsSnapshot | null>(null)

  useEffect(() => {
    const refresh = () => {
      const map = getWishlist()
      setSaved(Object.values(map).sort((a, b) => b.savedAt - a.savedAt))
    }
    refresh()
    window.addEventListener('wishlist-change', refresh)
    window.addEventListener('storage', refresh)
    fetch('/api/deals').then(r => r.json()).then(setSnapshot).catch(() => {})
    return () => {
      window.removeEventListener('wishlist-change', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  // Build a lookup of live deals by ID so we can show "now: EGP X" against
  // the saved-when price.
  const liveById: Record<string, Deal> = {}
  for (const d of snapshot?.deals ?? []) liveById[d.id] = d

  return (
    <main className="max-w-lg mx-auto px-4 pb-8">
      <div className="flex items-center gap-3 mt-4 mb-6">
        <button
          onClick={() => { if (window.history.length > 1) router.back(); else router.push('/') }}
          className="text-slate-400 text-base py-2 px-2 -mx-2 active:opacity-60"
          aria-label="Back"
        >←</button>
        <h1 className="text-xl font-bold">Saved</h1>
      </div>

      {saved.length === 0 && (
        <div className="text-center text-slate-500 py-16">
          <p className="text-4xl mb-3">☆</p>
          <p className="text-sm">Nothing saved yet</p>
          <p className="text-xs text-slate-600 mt-1">Tap the star on any deal to track it here.</p>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {saved.map(item => {
          const live = liveById[item.id]
          const livePrice = live?.currentPrice
          const dropped = livePrice !== undefined && livePrice <= item.savedAtPrice
          const storeBg = item.store === 'amazon' ? 'bg-orange-500' : 'bg-yellow-400'
          const storeName = item.store === 'amazon' ? 'Amazon' : 'Noon'
          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/deal/${item.id}`)}
              onKeyDown={e => { if (e.key === 'Enter') router.push(`/deal/${item.id}`) }}
              className="bg-slate-800 rounded-2xl p-2.5 flex gap-3 items-center active:opacity-80 cursor-pointer"
            >
              <div className="w-16 h-16 flex-shrink-0 bg-slate-700 rounded-xl overflow-hidden flex items-center justify-center">
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-slate-300 text-2xl font-black">{item.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '··'}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className={`w-4 h-4 rounded-full ${storeBg} text-black text-[8px] font-black flex items-center justify-center`}>{storeName[0]}</span>
                  <span className="text-slate-500 text-[10px] truncate">Saved {new Date(item.savedAt).toLocaleDateString()}</span>
                </div>
                <p className="text-slate-100 text-xs font-medium line-clamp-2 leading-tight">{item.name}</p>
                <div className="flex items-baseline gap-2 mt-1">
                  {livePrice !== undefined ? (
                    <>
                      <span className={`text-sm font-bold ${dropped ? 'text-green-400' : 'text-slate-200'}`}>
                        {fmtEGP(livePrice)}
                      </span>
                      <span className="text-slate-500 text-[10px] line-through">{fmtEGP(item.savedAtPrice)}</span>
                      {dropped && livePrice < item.savedAtPrice && (
                        <span className="text-green-500 text-[10px] font-bold">↓ {fmtEGP(item.savedAtPrice - livePrice)}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-slate-400 text-xs">Saved at {fmtEGP(item.savedAtPrice)}</span>
                  )}
                </div>
              </div>
              <button
                onClick={e => { e.stopPropagation(); unsaveDeal(item.id) }}
                className="w-8 h-8 rounded-full text-yellow-400 text-base flex items-center justify-center active:bg-slate-700"
                aria-label="Remove from saved"
              >★</button>
            </div>
          )
        })}
      </div>

      <p className="text-slate-600 text-[10px] mt-6 text-center leading-relaxed">
        Saved items are tracked locally on this device. We&apos;ll push you when one hits or beats the saved price.
      </p>
    </main>
  )
}
