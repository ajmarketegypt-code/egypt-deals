import { NextRequest, NextResponse } from 'next/server'
import { redis, KEYS } from '@/lib/upstash'

export async function POST(req: NextRequest) {
  const sub = await req.json()
  if (!sub?.endpoint) return NextResponse.json({ error: 'invalid' }, { status: 400 })
  await redis.set(KEYS.PUSH_SUBSCRIPTION, sub)
  return NextResponse.json({ ok: true })
}
