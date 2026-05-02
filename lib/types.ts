export interface Deal {
  id: string
  name: string
  store: 'amazon' | 'noon'
  url: string
  imageUrl: string
  category: string
  currentPrice: number
  originalPrice: number
  discountPct: number
  minPrice: number
  maxPrice: number
  prevLow: number
  avgPrice: number
  priceCount: number    // how many data points we've collected for this product
  firstSeenTs: number   // unix ms — when we first recorded this product
  verdict: string
  priceHistory: number[]
  scrapedAt: number

  // Learning-derived signal — populated by the scraper from full price history
  // (not just the 30-point chart slice). All optional: older snapshots without
  // these fields still render via the legacy position-in-range path on the
  // detail page.

  // 0..1 — fraction of recorded prices that current beats (midrank: strict-
  // greater + 0.5 × ties). 1.0 = current is the best ever; 0 = the worst.
  percentile?: number
  // Trailing samples within ±0.5% of current — "this price has held for N
  // samples." Includes the current sample itself.
  runLength?: number
  // How many of `priceCount` samples were ≤ current. Used for "seen below
  // EGP X only N times in M records" copy.
  freqAtOrBelow?: number
}

export interface DealsSnapshot {
  deals: Deal[]
  updatedAt: number
}
