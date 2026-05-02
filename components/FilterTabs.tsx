'use client'
import { CATEGORIES, type CategoryId } from '@/lib/categories'

export type StoreTab = 'All' | 'Amazon' | 'Noon'
export type CategoryTab = 'All' | CategoryId

// Kept for back-compat with the old Tab type
export type Tab = StoreTab

interface Props {
  store: StoreTab
  category: CategoryTab
  onStoreChange: (s: StoreTab) => void
  onCategoryChange: (c: CategoryTab) => void
}

const STORES: StoreTab[] = ['All', 'Amazon', 'Noon']

function chip(active: boolean) {
  return `px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
    active ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'
  }`
}

export function FilterTabs({ store, category, onStoreChange, onCategoryChange }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <div role="tablist" aria-label="Filter by store" className="flex gap-2 overflow-x-auto no-scrollbar">
        {STORES.map(s => (
          <button
            key={s}
            role="tab"
            aria-pressed={store === s}
            onClick={() => onStoreChange(s)}
            className={chip(store === s)}
          >
            {s}
          </button>
        ))}
      </div>
      <div role="tablist" aria-label="Filter by category" className="flex gap-2 overflow-x-auto no-scrollbar">
        <button
          role="tab"
          aria-pressed={category === 'All'}
          onClick={() => onCategoryChange('All')}
          className={chip(category === 'All')}
        >
          All
        </button>
        {CATEGORIES.map(c => (
          <button
            key={c.id}
            role="tab"
            aria-pressed={category === c.id}
            onClick={() => onCategoryChange(c.id)}
            className={chip(category === c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
    </div>
  )
}
