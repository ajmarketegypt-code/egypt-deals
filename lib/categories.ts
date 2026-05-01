// Category model — shared between scraper output and frontend filter UI.
// Keep ids in sync with scraper/classify.js
export const CATEGORIES = [
  { id: 'electronics', label: 'Electronics' },
  { id: 'home',        label: 'Home' },
  { id: 'beauty',      label: 'Beauty' },
  { id: 'fashion',     label: 'Fashion' },
  { id: 'food',        label: 'Food' },
  { id: 'baby',        label: 'Baby' },
  { id: 'health',      label: 'Health' },
  { id: 'sports',      label: 'Sports' },
  { id: 'other',       label: 'Other' },
] as const

export type CategoryId = typeof CATEGORIES[number]['id']
