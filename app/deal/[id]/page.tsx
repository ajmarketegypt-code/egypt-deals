'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PriceChart } from '@/components/PriceChart'
import { openDeal } from '@/lib/deep-link'
import type { Deal, DealsSnapshot } from '@/lib/types'

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [deal, setDeal] = useState<Deal | null>(null)

  useEffect(() => {
    fetch('/api/deals')
      .then(r => r.json())
      .then((snap: DealsSnapshot) => setDeal(snap.deals?.find(d => d.id === id) ?? null))
  }, [id])

  if (!deal) return (
    <main className="max-w-lg mx-auto px-4 pt-12 text-center text-slate-500">Loading...</main>
  )

  const storeName = deal.store === 'amazon' ? 'Amazon' : 'Noon'
  const storeBg = deal.store === 'amazon' ? 'bg-orange-500' : 'bg-yellow-400'

  return (
    <main className="max-w-lg mx-auto px-4 pb-8">
      <button
        onClick={() => {
          // In PWA standalone mode, history may be empty if launched directly here.
          // Fall back to explicit home navigation so the button always works.
          if (window.history.length > 1) router.back()
          else router.push('/')
        }}
        className="mt-4 text-slate-400 text-sm py-2 -mx-2 px-2 active:opacity-60"
      >← Back</button>

      <div className="flex gap-4 mt-4">
        <div className="w-20 h-20 flex-shrink-0 bg-slate-800 rounded-2xl flex items-center justify-center overflow-hidden">
          {deal.imageUrl ? <img src={deal.imageUrl} alt={deal.name} className="w-full h-full object-cover" /> : <span className="text-3xl">📦</span>}
        </div>
        <div>
          <h1 className="text-base font-bold leading-tight">{deal.name}</h1>
          <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-bold text-black ${storeBg}`}>{storeName}.eg</span>
        </div>
      </div>

      <div className="mt-4 bg-green-950 border border-green-800 rounded-2xl p-4 flex justify-between items-center">
        <div>
          <p className="text-green-400 text-3xl font-black">EGP {deal.currentPrice}</p>
          <p className="text-slate-500 text-sm line-through mt-0.5">EGP {deal.originalPrice}</p>
        </div>
        <div className="text-right">
          <span className="bg-green-500 text-black font-black text-lg px-3 py-1 rounded-xl">-{deal.discountPct}%</span>
          <p className="text-green-600 text-xs mt-1">🎉 ALL-TIME LOW</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3">
        {[
          { label: 'PREV. LOW', value: `EGP ${deal.prevLow}` },
          { label: 'AVG PRICE', value: `EGP ${deal.avgPrice}` },
          { label: 'YOU SAVE', value: `EGP ${Math.round(deal.originalPrice - deal.currentPrice)}` },
        ].map(({ label, value }) => (
          <div key={label} className="bg-slate-800 rounded-xl p-3 text-center">
            <p className="text-slate-500 text-[9px] font-semibold tracking-wider">{label}</p>
            <p className="text-slate-100 text-sm font-bold mt-0.5">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 bg-slate-800 rounded-2xl p-4">
        <p className="text-slate-500 text-[10px] font-semibold tracking-wider mb-3">PRICE HISTORY</p>
        <PriceChart prices={deal.priceHistory} />
      </div>

      <div className="mt-3 bg-blue-950 border border-blue-900 rounded-2xl p-4 flex gap-3">
        <span className="text-xl">🤖</span>
        <div>
          <p className="text-blue-300 text-xs font-bold mb-0.5">Smart Verdict</p>
          <p className="text-blue-200 text-sm leading-relaxed">{deal.verdict}</p>
        </div>
      </div>

      <div className="mt-4 flex gap-3">
        <button
          onClick={() => openDeal(deal)}
          className={`flex-1 py-3 rounded-2xl font-bold text-sm text-black ${storeBg}`}
        >
          Open on {storeName} →
        </button>
        <button
          onClick={() => navigator.clipboard.writeText(`${deal.name} — EGP ${deal.currentPrice}\n${deal.url}`)}
          className="w-12 bg-slate-800 rounded-2xl flex items-center justify-center text-lg"
          title="Copy deal link"
        >
          📤
        </button>
      </div>
    </main>
  )
}
