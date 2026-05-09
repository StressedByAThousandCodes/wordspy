import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getPhaseEndsAt } from '@/lib/game'

export async function POST(req: NextRequest) {
  const supabase = createServiceClient()
  const { roundId, playerId, content } = await req.json()

  if (!roundId || !playerId || !content?.trim()) {
    return NextResponse.json({ error: 'roundId, playerId, and content required' }, { status: 400 })
  }

  // Verify round is in describing phase
  const { data: round } = await supabase
    .from('rounds')
    .select('*')
    .eq('id', roundId)
    .single()

  if (!round) {
    return NextResponse.json({ error: 'Round not found' }, { status: 404 })
  }
  if (round.phase !== 'describing') {
    return NextResponse.json({ error: 'Not in describing phase' }, { status: 400 })
  }

  // Insert description — unique constraint prevents duplicates
  const { error } = await supabase.from('descriptions').insert({
    round_id: roundId,
    player_id: playerId,
    content: content.trim().slice(0, 200),
  })

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Already submitted' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Check if all alive players have submitted — if so advance phase early
  const { data: alivePlayers } = await supabase
    .from('players')
    .select('id')
    .eq('room_id', round.room_id)
    .eq('is_alive', true)

  const { data: descriptions } = await supabase
    .from('descriptions')
    .select('id')
    .eq('round_id', roundId)

  if (
    alivePlayers &&
    descriptions &&
    descriptions.length >= alivePlayers.length
  ) {
    const { data: room } = await supabase
      .from('rooms')
      .select('discuss_seconds')
      .eq('id', round.room_id)
      .single()

    await supabase
      .from('rounds')
      .update({
        phase: 'discussing',
        phase_ends_at: getPhaseEndsAt(room?.discuss_seconds ?? 60),
      })
      .eq('id', roundId)
  }

  return NextResponse.json({ ok: true })
}