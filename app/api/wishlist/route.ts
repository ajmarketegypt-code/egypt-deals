import { NextRequest, NextResponse } from 'next/server'
import { redis, KEYS } from '@/lib/upstash'

export const dynamic = 'force-dynamic'

// POST /api/wishlist — body: { id, name, store, url, imageUrl, savedAt, savedAtPrice }
// Mirrors a localStorage save into Upstash so the scraper can match against it.
export async function POST(req: NextRequest) {
  const body = await req.json()
  if (!body?.id || typeof body.savedAtPrice !== 'number') {
    return NextResponse.json({ error: 'invalid' }, { status: 400 })
  }
  await redis.sadd(KEYS.SAVED_DEAL_IDS, body.id)
  await redis.hset(KEYS.SAVED_DEAL_META, { [body.id]: JSON.stringify(body) })
  // Clear any previous "we've pushed about this" record so a re-save can
  // re-notify on the next price drop.
  await redis.hdel(KEYS.SAVED_NOTIFIED, body.id)
  return NextResponse.json({ ok: true })
}

// DELETE /api/wishlist?id=...
export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 })
  await redis.srem(KEYS.SAVED_DEAL_IDS, id)
  await redis.hdel(KEYS.SAVED_DEAL_META, id)
  await redis.hdel(KEYS.SAVED_NOTIFIED, id)
  return NextResponse.json({ ok: true })
}
