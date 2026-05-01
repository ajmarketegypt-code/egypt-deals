import { NextResponse } from 'next/server'
import { redis, KEYS } from '@/lib/upstash'

export async function POST() {
  await redis.set(KEYS.SCRAPE_REQUESTED, '1')
  return NextResponse.json({ ok: true })
}
