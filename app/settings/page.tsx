'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { registerPush } from '@/lib/push'
import type { DealsSnapshot } from '@/lib/types'

function timeAgo(ts: number | null) {
  if (!ts) return 'Never'
  const mins = Math.floor((Date.now() - ts) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} ${mins === 1 ? 'minute' : 'minutes'} ago`
  const hrs = Math.floor(mins / 60)
  return `${hrs} ${hrs === 1 ? 'hour' : 'hours'} ago`
}

// "in 43 minutes" / "overdue by 12 minutes". Used for the next-run estimate.
function timeUntil(ts: number) {
  const mins = Math.round((ts - Date.now()) / 60000)
  if (mins <= 0) return `overdue by ${Math.abs(mins)} ${Math.abs(mins) === 1 ? 'minute' : 'minutes'}`
  if (mins < 60) return `in ~${mins} ${mins === 1 ? 'minute' : 'minutes'}`
  const hrs = Math.round(mins / 60)
  return `in ~${hrs} ${hrs === 1 ? 'hour' : 'hours'}`
}

export default function SettingsPage() {
  const router = useRouter()
  const [pushEnabled, setPushEnabled] = useState(false)
  const [pushBlocked, setPushBlocked] = useState(false)
  const [lastScrape, setLastScrape] = useState<number | null>(null)
  const [lastScrapeRun, setLastScrapeRun] = useState<number | null>(null)
  const [nextEstimate, setNextEstimate] = useState<number | null>(null)
  const [totalDeals, setTotalDeals] = useState(0)
  const [requesting, setRequesting] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushEnabled(Notification.permission === 'granted')
      setPushBlocked(Notification.permission === 'denied')
    }
    fetch('/api/deals').then(r => r.json()).then((data: DealsSnapshot) => {
      setLastScrape(data.updatedAt ?? null)
      setTotalDeals(data.deals?.length ?? 0)
    })
    // Separate endpoint: snapshot timestamp can be stale (zero-deals run skips
    // snapshot write but bumps LAST_SCRAPE). This is the truer "is the scraper
    // alive" signal.
    fetch('/api/last-scrape').then(r => r.json()).then(({ lastScrapeTs, nextEstimateTs }) => {
      setLastScrapeRun(lastScrapeTs || null)
      setNextEstimate(nextEstimateTs || null)
    }).catch(() => {})
  }, [])

  async function togglePush() {
    if (pushEnabled) {
      alert('To disable notifications: iPhone Settings → Notifications → Egypt Deals → Allow Notifications off')
    } else {
      const ok = await registerPush()
      setPushEnabled(ok)
    }
  }

  async function requestScrape() {
    setRequesting(true)
    await fetch('/api/request-scrape', { method: 'POST' })
    setTimeout(() => setRequesting(false), 3000)
  }

  return (
    <main className="max-w-lg mx-auto px-4 pb-8">
      <div className="flex items-center gap-3 mt-4 mb-6">
        <button
          onClick={() => { if (window.history.length > 1) router.back(); else router.push('/') }}
          className="text-slate-400 text-base py-2 px-2 -mx-2 active:opacity-60"
          aria-label="Back"
        >←</button>
        <h1 className="text-xl font-bold">Settings</h1>
      </div>

      <div className="flex flex-col gap-3">
        <div className="bg-slate-800 rounded-2xl p-4 flex justify-between items-center">
          <div>
            <p className="text-slate-100 font-semibold text-sm">Push Notifications</p>
            <p className="text-slate-500 text-xs mt-0.5">
              {pushBlocked
                ? 'Blocked — re-enable in iOS Settings → Notifications → Deals'
                : 'Alert on new all-time low prices'}
            </p>
          </div>
          <button
            onClick={togglePush}
            disabled={pushBlocked}
            aria-pressed={pushEnabled}
            aria-label="Toggle push notifications"
            className={`w-12 h-7 rounded-full transition-colors relative disabled:opacity-50 ${pushEnabled ? 'bg-green-500' : 'bg-slate-600'}`}
          >
            <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all ${pushEnabled ? 'left-6' : 'left-1'}`} />
          </button>
        </div>

        <div className="bg-slate-800/50 rounded-2xl p-3">
          <p className="text-slate-500 text-xs">⚠️ iOS 16.4+ required. App must be installed to Home Screen — push notifications do not work in Safari tab.</p>
        </div>

        <div className="bg-slate-800 rounded-2xl p-4">
          <p className="text-slate-500 text-xs font-semibold tracking-wider mb-3">SCRAPER STATUS</p>
          <div className="flex justify-between mb-1">
            <span className="text-slate-400 text-sm">Last scrape</span>
            <span className="text-slate-200 text-sm">{timeAgo(lastScrapeRun ?? lastScrape)}</span>
          </div>
          <div className="flex justify-between mb-1">
            <span className="text-slate-400 text-sm">Next run</span>
            <span className="text-slate-200 text-sm">{nextEstimate ? timeUntil(nextEstimate) : 'Unknown'}</span>
          </div>
          <div className="flex justify-between mb-1">
            <span className="text-slate-400 text-sm">Snapshot updated</span>
            <span className="text-slate-200 text-sm">{timeAgo(lastScrape)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400 text-sm">Deals tracked</span>
            <span className="text-slate-200 text-sm">{totalDeals}</span>
          </div>
        </div>

        <button
          onClick={requestScrape}
          disabled={requesting}
          className="bg-blue-700 disabled:bg-slate-700 text-white font-bold py-3 rounded-2xl text-sm"
        >
          {requesting ? '⏳ Scrape requested...' : '🔄 Run Scrape Now'}
        </button>
        <p className="text-slate-600 text-xs text-center">Requires scraper running on your PC. Takes up to 60 seconds.</p>
      </div>
    </main>
  )
}
