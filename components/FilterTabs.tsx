const TABS = ['All', 'Amazon', 'Noon', 'Daily'] as const
export type Tab = typeof TABS[number]

interface Props {
  active: Tab
  onChange: (tab: Tab) => void
}

export function FilterTabs({ active, onChange }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
      {TABS.map(t => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
            active === t ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400'
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  )
}
