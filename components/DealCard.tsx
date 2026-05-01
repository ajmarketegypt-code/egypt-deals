import type { Deal } from '@/lib/types'

interface Props {
  deal: Deal
  isNew: boolean
  onClick: () => void
}

export function DealCard({ deal, isNew, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-slate-800 rounded-2xl p-4 flex gap-3 items-start active:scale-95 transition-transform"
    >
      <div className="w-14 h-14 flex-shrink-0 bg-slate-700 rounded-xl flex items-center justify-center overflow-hidden">
        {deal.imageUrl
          ? <img src={deal.imageUrl} alt={deal.name} className="w-full h-full object-cover" />
          : <span className="text-2xl">📦</span>}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="text-sm font-semibold text-slate-100 line-clamp-2 leading-tight">{deal.name}</p>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            {isNew && <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-bold">NEW</span>}
            <span className="text-[10px] bg-green-700 text-white px-1.5 py-0.5 rounded-full font-bold">-{deal.discountPct}%</span>
          </div>
        </div>

        <p className="text-[10px] text-slate-500 mb-2">
          {deal.store === 'amazon' ? '🟠 Amazon.eg' : '🟡 Noon.eg'}
        </p>

        <div className="flex items-center gap-2">
          <span className="text-green-400 font-bold text-base">EGP {deal.currentPrice}</span>
          <span className="text-slate-500 text-xs line-through">EGP {deal.originalPrice}</span>
          <span className="ml-auto text-[10px] text-green-600 font-semibold">🎉 ALL-TIME LOW</span>
        </div>
      </div>
    </button>
  )
}
