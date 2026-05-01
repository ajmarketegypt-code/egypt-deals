import type { Deal } from './types'

export function openDeal(deal: Deal) {
  if (deal.store === 'amazon') {
    const asin = deal.id.replace('amz-', '')
    // Try native app; iOS universal links handle the fallback automatically
    window.location.href = `amazon://dp/${asin}`
    // Open web page in new tab as fallback after 500ms
    setTimeout(() => window.open(deal.url, '_blank'), 500)
  } else {
    // Open web URL directly — Noon iOS universal links handle app redirect
    window.open(deal.url, '_blank')
  }
}
