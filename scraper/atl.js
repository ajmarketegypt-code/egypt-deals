// We only want to flag a product as ATL when we have meaningful history.
// `priceCount >= 5` ≈ 5 hourly samples, so the badge stops being noisy on
// freshly-tracked items where every claim of "all-time low" is trivially true.
// The feed is the ATL list — sparse for ~5h after a fresh DB is the trade-off.
export function isAllTimeLow({ currentPrice, minPrice, priceCount }) {
  if (priceCount < 5) return false
  return currentPrice <= minPrice
}

export function buildSmartVerdict({ currentPrice, prevLow, recentPrices, seenAtThisPrice = 1 }) {
  const parts = []

  // vs previous low
  const ratio = currentPrice / prevLow
  if (ratio < 0.9) {
    parts.push('Significantly below the previous record — great time to buy')
  } else {
    parts.push('Matches previous all-time low — solid deal')
  }

  // price trend from last 4 records
  if (recentPrices.length >= 3) {
    const diffs = recentPrices.slice(1).map((p, i) => p - recentPrices[i])
    const allFalling = diffs.every(d => d < 0)
    const risingBeforeDrop = diffs.slice(0, -1).every(d => d > 0)

    // Coefficient of variation (stdev / mean). Anything below 5% is just
    // noise we don't want to label "volatile" — a 1 EGP wiggle on a 999 EGP
    // mouse is meaningless. Above 5% the swings actually matter.
    const mean = recentPrices.reduce((a, b) => a + b, 0) / recentPrices.length
    const variance = recentPrices.reduce((s, p) => s + (p - mean) ** 2, 0) / recentPrices.length
    const stdev = Math.sqrt(variance)
    const cv = mean > 0 ? stdev / mean : 0

    if (allFalling) {
      parts.push('Price has been falling')
    } else if (risingBeforeDrop) {
      parts.push('Price was rising before this drop — likely limited time')
    } else if (cv > 0.05) {
      parts.push('Price is volatile')
    } else {
      parts.push('Price has been stable')
    }
  }

  // rarity
  if (seenAtThisPrice === 0) {
    parts.push('This price has never been seen before')
  } else if (seenAtThisPrice <= 2) {
    parts.push('Rarely this low')
  }

  return parts.join('. ')
}
