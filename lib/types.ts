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
  prevLow: number
  avgPrice: number
  verdict: string
  priceHistory: number[]
  scrapedAt: number
}

export interface DealsSnapshot {
  deals: Deal[]
  updatedAt: number
}
