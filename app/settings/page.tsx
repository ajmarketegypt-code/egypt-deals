'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { registerPush } from '@/lib/push'
import type { DealsSnapshot } from '@/lib/types'

function timeAgo(ts: number | null) {
  if (!ts) return 'Never'
  const mins = Math.floor((Date.now() - ts) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins} minutes ago`
  return `${Math.floor(mins / 60)} hours ago`
}

export default function SettingsPage() {
  const router = useRouter()
  const [pushEnabled, setPushEnabled] = useState(false)
  const [lastScrape, setLastScrape] = useState<number | null>(null)
  const [totalDeals, setTotalDeals] = useState(0)
  const [requesting, setRequesting] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') setPushEnabled(Notification.permission === 'granted')
    fetch('/api/deals').then(r => r.json()).then((data: DealsSnapshot) => {
      setLastScrape(data.updatedAt ?? null)
      setTotalDeals(data.deals?.length ?? 0)
    })
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
        <button onClick={() => router.back()} className="text-slate-400 text-sm">←</button>
        <h1 className="text-xl font-bold">Settings</h1>
      </div>

      <div className="flex flex-col gap-3">
        <div className="bg-slate-800 rounded-2xl p-4 flex justify-between items-center">
          <div>
            <p className="text-slate-100 font-semibold text-sm">Push Notifications</p>
            <p className="text-slate-500 text-xs mt-0.5">Alert on new all-time low prices</p>
          </div>
          <button onClick={togglePush} className={`w-12 h-7 rounded-full transition-colors relative ${pushEnabled ? 'bg-green-500' : 'bg-slate-600'}`}>
            <div className={`absolute top-1 w-5 h-5 bg-white rounded-full shadow transition-all ${pushEnabled ? 'left-6' : 'left-1'}`} />
          </button>
        </div>

        <div className="bg-slate-800/50 rounded-2xl p-3">
          <p className="text-slate-500 text-xs">⚠️ iOS 16.4+ required. App must be installed to Home Screen — push notifications do not work in Safari tab.</p>
        </div>

        <div className="bg-slate-800 rounded-2xl p-4">
          <p className="text-slate-500 text-xs font-semibold tracking-wider mb-3">SCRAPER STATUS</p>
          <div className="flex justify-between mb-1">
            <span className="text-slate-400 text-sm">Last updated</span>
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
