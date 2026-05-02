import type { Deal } from './types'

export function openDeal(deal: Deal) {
  if (deal.store === 'amazon') {
    const asin = deal.id.replace('amz-', '')
    // Try the native app first via the amazon:// scheme. If the app is
    // installed, the document goes to the background (document.hidden = true)
    // and we suppress the web fallback so the user doesn't get two tabs.
    // If the scheme failed, document.hidden stays false and we open the web URL.
    window.location.href = `amazon://dp/${asin}`
    setTimeout(() => {
      if (!document.hidden) window.open(deal.url, '_blank')
    }, 600)
  } else {
    // Open web URL directly — Noon iOS universal links handle app redirect
    window.open(deal.url, '_blank')
  }
}
