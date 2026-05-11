import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getPhaseEndsAt } from '@/lib/game'

export async function POST(req: NextRequest) {
  const supabase = createServiceClient()
  const { roundId, playerId, content } = await req.json()

  if (!roundId || !playerId || !content?.trim()) {
    return NextResponse.json({ error: 'roundId, playerId, and content required' }, { status: 400 })
  }

  // Verify round is still in describing phase
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

  // Count alive players from the room — use room_id from round for accuracy
  const { data: alivePlayers, count: aliveCount } = await supabase
    .from('players')
    .select('id', { count: 'exact' })
    .eq('room_id', round.room_id)
    .eq('is_alive', true)

  // Count submitted descriptions for this round
  const { count: descCount } = await supabase
    .from('descriptions')
    .select('id', { count: 'exact', head: true })
    .eq('round_id', roundId)

  console.log(`Descriptions: ${descCount}/${aliveCount} alive players submitted`)

  // Only auto-advance if ALL alive players have submitted
  // Add a buffer — require at least 2 submissions to avoid single-player advance
  if (
    aliveCount !== null &&
    descCount !== null &&
    aliveCount >= 2 &&
    descCount >= aliveCount
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
      .eq('phase', 'describing') // guard against double-advance

    console.log('All players submitted — advanced to discussing')
  }

  return NextResponse.json({ ok: true })
}