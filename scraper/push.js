import webpush from 'web-push'
import 'dotenv/config'

const vapidEmail = process.env.VAPID_EMAIL?.startsWith('mailto:') || process.env.VAPID_EMAIL?.startsWith('https:')
  ? process.env.VAPID_EMAIL
  : `mailto:${process.env.VAPID_EMAIL}`

webpush.setVapidDetails(vapidEmail, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY)

// Send a digest notification when 2+ new deals appeared this scrape.
// Tapping it opens the home feed.
export async function sendDigestNotification(subscription, deals) {
  if (!subscription || !deals?.length) return
  const top = [...deals].sort((a, b) => b.discountPct - a.discountPct)[0]
  const storeName = top.store === 'amazon' ? 'Amazon' : 'Noon'
  const payload = JSON.stringify({
    title: `${deals.length} new all-time lows`,
    body: `Top: ${top.name.slice(0, 60)} — EGP ${top.currentPrice} (${top.discountPct}% off, ${storeName})`,
    url: '/',
    icon: '/icons/icon-192-v3.png',
    tag: 'deals-digest', // collapse repeated digests on iOS
  })

  try {
    await webpush.sendNotification(subscription, payload)
    console.log(`[push] digest sent for ${deals.length} new deals`)
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      console.log('[push] subscription expired — user uninstalled PWA')
    } else {
      console.error('[push] digest error:', err.message)
    }
  }
}

export async function sendDealNotification(subscription, deal) {
  if (!subscription) {
    console.log('[push] no subscription yet — skipping')
    return
  }

  const discountPct = deal.originalPrice > 0
    ? Math.round((1 - deal.currentPrice / deal.originalPrice) * 100)
    : 0
  const storeName = deal.store === 'amazon' ? 'Amazon' : 'Noon'

  const payload = JSON.stringify({
    title: `Deals — ${deal.name.slice(0, 50)}`,
    body: `EGP ${deal.currentPrice} (${discountPct}% off) on ${storeName} — All-time low`,
    url: `/deal/${deal.id}`,
    icon: '/icons/icon-192.png',
  })

  try {
    await webpush.sendNotification(subscription, payload)
    console.log(`[push] sent for ${deal.id}`)
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) {
      console.log('[push] subscription expired — user uninstalled PWA')
    } else {
      console.error('[push] error:', err.message)
    }
  }
}
