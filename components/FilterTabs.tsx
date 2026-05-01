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
  return `px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
    active ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'
  }`
}

export function FilterTabs({ store, category, onStoreChange, onCategoryChange }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {STORES.map(s => (
          <button key={s} onClick={() => onStoreChange(s)} className={chip(store === s)}>
            {s}
          </button>
        ))}
      </div>
      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        <button onClick={() => onCategoryChange('All')} className={chip(category === 'All')}>
          All
        </button>
        {CATEGORIES.map(c => (
          <button
            key={c.id}
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
