import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { code: string } }
) {
  const supabase = createServiceClient()
  const body = await req.json()

  const allowed = [
    'spy_count',
    'describe_seconds',
    'discuss_seconds',
    'vote_seconds',
    'min_players',
    'max_players',
  ]

  const updates: Record<string, number> = {}
  for (const key of allowed) {
    if (typeof body[key] === 'number') updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields provided' }, { status: 400 })
  }

  const { error } = await supabase
    .from('rooms')
    .update(updates)
    .eq('code', params.code.toUpperCase())

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}