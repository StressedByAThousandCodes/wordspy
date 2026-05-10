import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// POST /api/messages — send a chat message
export async function POST(req: NextRequest) {
  const supabase = createServiceClient()
  const { roomId, playerId, content } = await req.json()

  if (!roomId || !playerId || !content?.trim()) {
    return NextResponse.json({ error: 'roomId, playerId, and content required' }, { status: 400 })
  }

  const { error } = await supabase.from('messages').insert({
    room_id: roomId,
    player_id: playerId,
    content: content.trim().slice(0, 200),
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}