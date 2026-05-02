'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { PriceChart } from '@/components/PriceChart'
import { openDeal } from '@/lib/deep-link'
import type { Deal, DealsSnapshot } from '@/lib/types'

function daysSince(ts: number) {
  return Math.max(0, Math.floor((Date.now() - ts) / (24 * 60 * 60 * 1000)))
}

// Thousands-separated EGP — easier to scan at a glance.
const fmtEGP = (n: number) => `EGP ${Math.round(n).toLocaleString('en-US')}`

// Convert our limited price-history data into a confidence rating that
// honestly reflects how much we know about a product's pricing.
function assessConfidence(priceCount: number, daysTracked: number) {
  if (priceCount >= 14 && daysTracked >= 7)  return { level: 'high',   label: 'Strong signal',   color: 'text-green-400' }
  if (priceCount >= 5  || daysTracked >= 2)  return { level: 'medium', label: 'Moderate signal', color: 'text-yellow-400' }
  return { level: 'low', label: 'Limited data', color: 'text-orange-400' }
}

// Verdict on whether the current price is genuinely a good buy *based on what we know*.
function assessPrice(d: Deal) {
  const min = d.minPrice ?? d.currentPrice
  const max = d.maxPrice ?? d.currentPrice
  const avg = d.avgPrice ?? d.currentPrice
  const range = max - min
  const days = daysSince(d.firstSeenTs ?? Date.now())

  // Where does the current price sit between min/max we've seen?
  // 0 = at minimum, 1 = at maximum
  const positionInRange = range > 0 ? (d.currentPrice - min) / range : 0

  if (d.priceCount < 3 && days < 1) {
    return {
      heading: 'Just started tracking',
      detail: `Only ${d.priceCount} price ${d.priceCount === 1 ? 'point' : 'points'} so far. Wait a few days for a reliable read.`,
      tone: 'neutral' as const,
    }
  }
  if (positionInRange === 0 && range > 0) {
    return {
      heading: 'At the lowest we\'ve seen',
      detail: `Down EGP ${Math.round(max - d.currentPrice)} from the highest price we recorded (${Math.round((1 - d.currentPrice / max) * 100)}% off).`,
      tone: 'great' as const,
    }
  }
  if (positionInRange < 0.25) {
    return {
      heading: 'Near the lowest seen',
      detail: `Within EGP ${Math.round(d.currentPrice - min)} of the all-time low (${days}-day window).`,
      tone: 'good' as const,
    }
  }
  if (positionInRange > 0.75) {
    return {
      heading: 'Closer to the highest seen',
      detail: `Avg has been EGP ${Math.round(avg)} — wait for it to drop.`,
      tone: 'bad' as const,
    }
  }
  return {
    heading: 'Mid-range price',
    detail: `Sits between EGP ${Math.round(min)} (low) and EGP ${Math.round(max)} (high). Avg EGP ${Math.round(avg)}.`,
    tone: 'mid' as const,
  }
}

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
  const days = daysSince(deal.firstSeenTs ?? Date.now())
  const confidence = assessConfidence(deal.priceCount ?? 1, days)
  const verdict = assessPrice(deal)
  const hasRealDiscount = deal.discountPct > 0 && deal.originalPrice > deal.currentPrice

  // Cross-shop link: open Google Shopping in Egypt with the product name
  const compareUrl = `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(deal.name + ' Egypt')}`

  const toneBg = {
    great:   'bg-green-950 border-green-800',
    good:    'bg-green-950 border-green-800',
    mid:     'bg-slate-800 border-slate-700',
    bad:     'bg-red-950 border-red-900',
    neutral: 'bg-slate-800 border-slate-700',
  }[verdict.tone]
  const toneIcon = { great: '🔥', good: '✅', mid: '➖', bad: '⚠️', neutral: '⏳' }[verdict.tone]

  return (
    <main className="max-w-lg mx-auto px-4 pb-8">
      <button
        onClick={() => { if (window.history.length > 1) router.back(); else router.push('/') }}
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
          <p className="text-green-400 text-3xl font-black">{fmtEGP(deal.currentPrice)}</p>
          {hasRealDiscount && (
            <p className="text-slate-500 text-sm line-through mt-0.5">{fmtEGP(deal.originalPrice)}</p>
          )}
        </div>
        <div className="text-right">
          {hasRealDiscount && (
            <span className="bg-green-500 text-black font-black text-lg px-3 py-1 rounded-xl">-{deal.discountPct}%</span>
          )}
          <p className="text-green-600 text-xs mt-1">🎉 ATL (our data)</p>
        </div>
      </div>

      {/* Price-quality verdict */}
      <div className={`mt-3 rounded-2xl p-4 border ${toneBg}`}>
        <div className="flex items-start gap-3">
          <span className="text-2xl">{toneIcon}</span>
          <div className="flex-1">
            <p className="text-slate-100 text-sm font-bold">{verdict.heading}</p>
            <p className="text-slate-400 text-xs mt-1 leading-relaxed">{verdict.detail}</p>
          </div>
        </div>
      </div>

      {/* Tracking transparency */}
      <div className="mt-3 bg-slate-800 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-slate-500 text-[10px] font-semibold tracking-wider">PRICE HISTORY</p>
          <span className={`text-[10px] font-semibold ${confidence.color}`}>{confidence.label}</span>
        </div>
        <div className="grid grid-cols-4 gap-2 mb-3">
          {[
            { label: 'LOW',     value: fmtEGP(deal.minPrice ?? deal.currentPrice) },
            { label: 'AVG',     value: fmtEGP(deal.avgPrice ?? deal.currentPrice) },
            { label: 'HIGH',    value: fmtEGP(deal.maxPrice ?? deal.currentPrice) },
            { label: 'TRACKED', value: days === 0 ? 'today' : `${days}d` },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <p className="text-slate-500 text-[9px] font-semibold tracking-wider">{label}</p>
              <p className="text-slate-100 text-xs font-bold mt-0.5">{value}</p>
            </div>
          ))}
        </div>
        <PriceChart prices={deal.priceHistory} />
        <p className="text-slate-600 text-[10px] mt-2 text-center">
          {deal.priceCount ?? deal.priceHistory.length} data {(deal.priceCount ?? deal.priceHistory.length) === 1 ? 'point' : 'points'}
          {' '}• Hourly tracking
        </p>
      </div>

      {/* Smart verdict from scraper (trend analysis). Hidden when we have
          <3 price points — at that point the verdict is generic ("Matches
          previous all-time low") and just repeats what the price-assessment
          block above already says. */}
      {deal.verdict && (deal.priceCount ?? 0) >= 3 && (
        <div className="mt-3 bg-blue-950 border border-blue-900 rounded-2xl p-4 flex gap-3">
          <span className="text-xl">🤖</span>
          <div>
            <p className="text-blue-300 text-xs font-bold mb-0.5">Smart verdict</p>
            <p className="text-blue-200 text-sm leading-relaxed">{deal.verdict}</p>
          </div>
        </div>
      )}

      <div className="mt-4 flex gap-3">
        <button
          onClick={() => openDeal(deal)}
          className={`flex-1 py-3 rounded-2xl font-bold text-sm text-black ${storeBg}`}
        >
          Open on {storeName} →
        </button>
        <a
          href={compareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-1.5 px-3 bg-slate-800 rounded-2xl text-slate-300 text-xs font-semibold"
        >
          🔎 Compare
        </a>
        <button
          onClick={() => navigator.clipboard.writeText(`${deal.name} — ${fmtEGP(deal.currentPrice)}\n${deal.url}`)}
          className="w-12 bg-slate-800 rounded-2xl flex items-center justify-center text-lg"
          title="Copy deal link"
        >📤</button>
      </div>

      <p className="text-slate-600 text-[10px] mt-4 text-center leading-relaxed">
        Verdicts are based on prices we&apos;ve recorded since we started tracking this product.
        For a deeper read, tap <span className="text-slate-400">🔎 Compare</span> to cross-check on Google Shopping.
      </p>
    </main>
  )
}
