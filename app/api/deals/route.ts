import { NextResponse } from 'next/server'
import { redis, KEYS } from '@/lib/upstash'

export const dynamic = 'force-dynamic'

export async function GET() {
  const snapshot = await redis.get(KEYS.DEALS_SNAPSHOT)
  if (!snapshot) return NextResponse.json({ deals: [], updatedAt: 0 })
  return NextResponse.json(snapshot)
}
