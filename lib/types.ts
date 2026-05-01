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
}

export interface DealsSnapshot {
  deals: Deal[]
  updatedAt: number
}
