interface Props {
  prices: number[]
}

export function PriceChart({ prices }: Props) {
  if (prices.length < 2) {
    return <div className="h-16 flex items-center justify-center text-slate-500 text-sm">Not enough history yet</div>
  }

  const min = Math.min(...prices) * 0.95
  const max = Math.max(...prices) * 1.05
  const range = max - min || 1
  const W = 300; const H = 70; const pad = 10

  const pts = prices.map((p, i) => [
    pad + (i / (prices.length - 1)) * (W - pad * 2),
    H - pad - ((p - min) / range) * (H - pad * 2),
  ])

  const line = pts.map(([x, y]) => `${x},${y}`).join(' ')
  const area = `${pts[0][0]},${H} ${line} ${pts[pts.length - 1][0]},${H}`
  const [lx, ly] = pts[pts.length - 1]

  return (
    <svg viewBox={`0 0 ${W} ${H + 14}`} className="w-full">
      <defs>
        <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#cg)" />
      <polyline points={line} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lx} cy={ly} r="4" fill="#22c55e" />
      <circle cx={lx} cy={ly} r="7" fill="#22c55e" fillOpacity="0.25" />
      <text x={lx} y={H + 12} fill="#22c55e" fontSize="8" textAnchor="middle" fontWeight="bold">Now</text>
    </svg>
  )
}
