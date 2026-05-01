import type { Deal } from './types'

export function openDeal(deal: Deal) {
  let appUrl: string

  if (deal.store === 'amazon') {
    const asin = deal.id.replace('amz-', '')
    appUrl = `amazon://dp/${asin}`
  } else {
    appUrl = `noon://${deal.url.replace('https://www.noon.com', '')}`
  }

  // Attempt to open native app; fall back to website after 500ms
  const fallback = setTimeout(() => { window.location.href = deal.url }, 500)
  window.addEventListener('blur', () => clearTimeout(fallback), { once: true })
  window.location.href = appUrl
}
