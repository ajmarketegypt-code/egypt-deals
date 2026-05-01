export function isAllTimeLow({ currentPrice, minPrice, priceCount }) {
  if (priceCount < 1) return false
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

    if (allFalling) {
      parts.push('Price has been falling')
    } else if (risingBeforeDrop) {
      parts.push('Price was rising before this drop — likely limited time')
    } else {
      parts.push('Price is volatile')
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
