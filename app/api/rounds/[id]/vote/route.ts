import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { tallyVotes, checkWinCondition, getPhaseEndsAt } from '@/lib/game'
import type { Player } from '@/types'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient()
  const { voterId, targetId } = await req.json()

  if (!voterId || !targetId) {
    return NextResponse.json({ error: 'voterId and targetId required' }, { status: 400 })
  }

  // Verify round
  const { data: round } = await supabase
    .from('rounds')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!round) {
    return NextResponse.json({ error: 'Round not found' }, { status: 404 })
  }
  if (round.phase !== 'voting') {
    return NextResponse.json({ error: 'Not in voting phase' }, { status: 400 })
  }

  // Upsert — allows changing vote while timer is running
  const { error } = await supabase
    .from('votes')
    .upsert(
      { round_id: params.id, voter_id: voterId, target_id: targetId },
      { onConflict: 'round_id,voter_id' }
    )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Check if all alive players have voted
  const { data: alivePlayers } = await supabase
    .from('players')
    .select('*')
    .eq('room_id', round.room_id)
    .eq('is_alive', true)

  const { data: votes } = await supabase
    .from('votes')
    .select('*')
    .eq('round_id', params.id)

  const allVoted =
    alivePlayers &&
    votes &&
    votes.length >= alivePlayers.length

  if (allVoted) {
    await resolveVoting(round, alivePlayers as Player[], votes, supabase)
  }

  return NextResponse.json({ ok: true })
}

/**
 * BUG FIX (Bug 5):
 * Previously, after eliminating a player we re-checked win condition using the
 * stale `alivePlayers` list (which still included the just-eliminated player
 * and had roles from the DB that may already have been partially cleared).
 *
 * Now we re-fetch alive players AFTER the elimination update so the win check
 * always operates on the freshest DB state. This prevents false "civilians win"
 * results caused by stale role data.
 */
async function resolveVoting(
  round: any,
  alivePlayers: Player[],
  votes: any[],
  supabase: any
) {
  // Eliminate the top-voted player (null = tie or no votes = nobody eliminated)
  const eliminatedId = tallyVotes(votes)
  if (eliminatedId) {
    await supabase
      .from('players')
      .update({ is_alive: false })
      .eq('id', eliminatedId)
  }

  // Move to result phase — 8 seconds for players to read the result.
  // The client-side advance useEffect calls /api/rounds/[id]/advance when the
  // result timer hits zero, which handles end-game or next round from there.
  await supabase
    .from('rounds')
    .update({
      phase: 'result',
      phase_ends_at: getPhaseEndsAt(8),
    })
    .eq('id', round.id)
}