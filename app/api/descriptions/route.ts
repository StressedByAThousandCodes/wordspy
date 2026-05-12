import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { getPhaseEndsAt } from '@/lib/game'

export async function POST(req: NextRequest) {
  const supabase = createServiceClient()
  const { roundId, playerId, content } = await req.json()

  if (!roundId || !playerId) {
    return NextResponse.json({ error: 'roundId and playerId required' }, { status: 400 })
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

  // BUG FIX (Bug 1 — timer submit):
  // content can be empty string when the timer expires with nothing typed.
  // We accept empty content (the mechanic says "submit whether finished or not,
  // even if empty"). We still trim and cap to avoid whitespace-only entries
  // being treated as meaningful descriptions.
  const trimmedContent = (content ?? '').trim().slice(0, 200)

  // Insert description — unique constraint prevents duplicates.
  // An empty description is valid (player ran out of time).
  const { error } = await supabase.from('descriptions').insert({
    round_id: roundId,
    player_id: playerId,
    content: trimmedContent,
  })

  if (error) {
    if (error.code === '23505') {
      // Already submitted — treat as success (idempotent)
      return NextResponse.json({ ok: true, alreadySubmitted: true })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Count alive players for this round's room
  const { count: aliveCount } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', round.room_id)
    .eq('is_alive', true)

  // Count submitted descriptions for this round
  const { count: descCount } = await supabase
    .from('descriptions')
    .select('id', { count: 'exact', head: true })
    .eq('round_id', roundId)

  console.log(`Descriptions: ${descCount}/${aliveCount} alive players submitted`)

  // Auto-advance if ALL alive players have submitted (minimum 2 to avoid
  // single-player edge cases during development)
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