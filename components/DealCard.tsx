import type { Deal } from '@/lib/types'

interface Props {
  deal: Deal
  isNew: boolean
  onClick: () => void
}

// Compact card designed for a 2-column grid. Image on top fills card width,
// then name (2 lines max), price row, store badge.
export function DealCard({ deal, isNew, onClick }: Props) {
  const hasRealDiscount = deal.discountPct > 0 && deal.originalPrice > deal.currentPrice
  const storeBg = deal.store === 'amazon' ? 'bg-orange-500' : 'bg-yellow-400'
  const storeName = deal.store === 'amazon' ? 'Amazon' : 'Noon'

  return (
    <button
      onClick={onClick}
      className="w-full text-left bg-slate-800 rounded-2xl overflow-hidden flex flex-col active:scale-[0.97] transition-transform"
    >
      {/* Image with overlay badges */}
      <div className="relative aspect-square bg-slate-700 flex items-center justify-center">
        {deal.imageUrl
          ? <img src={deal.imageUrl} alt={deal.name} className="w-full h-full object-cover" />
          : <span className="text-4xl">📦</span>}

        {/* Top-right badges: NEW / discount */}
        <div className="absolute top-1.5 right-1.5 flex flex-col items-end gap-1">
          {isNew && <span className="text-[9px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-bold leading-none">NEW</span>}
          {hasRealDiscount && (
            <span className="text-[9px] bg-green-600 text-white px-1.5 py-0.5 rounded-full font-bold leading-none">
              -{deal.discountPct}%
            </span>
          )}
        </div>

        {/* Top-left store dot */}
        <span
          className={`absolute top-1.5 left-1.5 w-5 h-5 rounded-full ${storeBg} text-black text-[8px] font-black flex items-center justify-center leading-none`}
          title={`${storeName}.eg`}
        >
          {storeName[0]}
        </span>
      </div>

      {/* Text section */}
      <div className="p-2.5 flex flex-col gap-1.5 flex-1">
        <p className="text-[12px] font-medium text-slate-100 line-clamp-2 leading-tight min-h-[2.4em]">
          {deal.name}
        </p>
        <div className="flex items-baseline gap-1.5 flex-wrap mt-auto">
          <span className="text-green-400 font-bold text-sm leading-none">EGP {deal.currentPrice}</span>
          {hasRealDiscount && (
            <span className="text-slate-500 text-[10px] line-through leading-none">EGP {deal.originalPrice}</span>
          )}
        </div>
      </div>
    </button>
  )
}
