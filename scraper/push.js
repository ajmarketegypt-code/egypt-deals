import webpush from 'web-push'
import 'dotenv/config'

webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
)

export async function sendDealNotification(subscription, deal) {
  if (!subscription) {
    console.log('[push] no subscription yet — skipping')
    return
  }

  const discountPct = Math.round((1 - deal.currentPrice / deal.originalPrice) * 100)
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
    if (err.statusCode === 410) {
      console.log('[push] subscription expired — user uninstalled PWA')
    } else {
      console.error('[push] error:', err.message)
    }
  }
}
