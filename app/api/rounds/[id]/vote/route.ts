import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { tallyVotes, checkWinCondition, getPhaseEndsAt, assignRoles } from '@/lib/game'
import { generateWordPair } from '@/lib/words'
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

  // Insert vote — unique constraint prevents double voting
  const { error } = await supabase.from('votes').insert({
    round_id: params.id,
    voter_id: voterId,
    target_id: targetId,
  })

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Already voted' }, { status: 409 })
    }
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
    await resolveVoting(round, alivePlayers, votes, supabase)
  }

  return NextResponse.json({ ok: true })
}

async function resolveVoting(
  round: any,
  alivePlayers: Player[],
  votes: any[],
  supabase: any
) {
  // Eliminate top-voted player
  const eliminatedId = tallyVotes(votes)
  if (eliminatedId) {
    await supabase
      .from('players')
      .update({ is_alive: false })
      .eq('id', eliminatedId)
  }

  // Refetch alive players after elimination
  const { data: remaining } = await supabase
    .from('players')
    .select('*')
    .eq('room_id', round.room_id)
    .eq('is_alive', true)

  const winner = checkWinCondition(remaining ?? [])

  // Move to result phase
  await supabase
    .from('rounds')
    .update({
      phase: 'result',
      phase_ends_at: getPhaseEndsAt(10),
    })
    .eq('id', round.id)

  // After result phase — end game or start next round
  setTimeout(async () => {
    if (winner) {
      // Game over — return to lobby
      await supabase
        .from('rooms')
        .update({ status: 'lobby' })
        .eq('id', round.room_id)
      await supabase
        .from('players')
        .update({ role: null, is_ready: false, is_alive: true })
        .eq('room_id', round.room_id)
    } else {
      // Start next round
      const { data: room } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', round.room_id)
        .single()

      const { data: nextPlayers } = await supabase
        .from('players')
        .select('*')
        .eq('room_id', round.room_id)
        .eq('is_alive', true)

      const wordPair = await generateWordPair()
      const roleMap = assignRoles(nextPlayers, room.spy_count)

      // Reset all players to alive and assign new roles
      await Promise.all(
        nextPlayers.map((p: Player) =>
          supabase
            .from('players')
            .update({ role: roleMap.get(p.id), is_alive: true })
            .eq('id', p.id)
        )
      )

      await supabase.from('rounds').insert({
        room_id: round.room_id,
        round_number: round.round_number + 1,
        civilian_word: wordPair.civilian,
        spy_word: wordPair.spy,
        phase: 'describing',
        phase_ends_at: getPhaseEndsAt(room.describe_seconds),
      })
    }
  }, 10000)
}