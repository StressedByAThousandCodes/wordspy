import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { tallyVotes, checkWinCondition, getPhaseEndsAt, assignRoles } from '@/lib/game'
import { generateWordPair } from '@/lib/words'
import type { Player } from '@/types'

// Called by the client when the countdown hits zero.
// Safe to call multiple times — checks phase_ends_at before advancing
// so only the first call goes through, the rest are no-ops.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient()

  const { data: round } = await supabase
    .from('rounds')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!round) {
    return NextResponse.json({ error: 'Round not found' }, { status: 404 })
  }

  // Fetch room separately to guarantee fresh settings
  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('id', round.room_id)
    .single()

  if (!room) {
    return NextResponse.json({ error: 'Room not found' }, { status: 404 })
  }

  // Guard — only advance if phase_ends_at has actually passed
  const expired = new Date(round.phase_ends_at).getTime() <= Date.now()
  if (!expired) {
    return NextResponse.json({ skipped: true, reason: 'Timer not expired yet' })
  }

  // Result phase — handle return to lobby or next round
  if (round.phase === 'result') {
    const { data: freshPlayers } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', round.room_id)
      .eq('is_alive', true)

    const winner = checkWinCondition(freshPlayers ?? [])

    if (winner) {
      await supabase.from('rooms').update({ status: 'lobby' }).eq('id', round.room_id)
      await supabase.from('players')
        .update({ role: null, is_ready: false, is_alive: true })
        .eq('room_id', round.room_id)
      return NextResponse.json({ advanced: true, to: 'lobby', winner })
    } else {
      const wordPair = await generateWordPair()
      const roleMap = assignRoles(freshPlayers ?? [], room.spy_count)
      await Promise.all(
        (freshPlayers ?? []).map((p: Player) =>
          supabase.from('players').update({ role: roleMap.get(p.id), is_alive: true }).eq('id', p.id)
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
      return NextResponse.json({ advanced: true, to: 'next_round' })
    }
  }

  if (round.phase === 'describing') {
    await supabase
      .from('rounds')
      .update({
        phase: 'discussing',
        phase_ends_at: getPhaseEndsAt(room.discuss_seconds),
      })
      .eq('id', round.id)
      .eq('phase', 'describing') // prevents double-advance

    return NextResponse.json({ advanced: true, to: 'discussing' })
  }

  if (round.phase === 'discussing') {
    await supabase
      .from('rounds')
      .update({
        phase: 'voting',
        phase_ends_at: getPhaseEndsAt(room.vote_seconds),
      })
      .eq('id', round.id)
      .eq('phase', 'discussing')

    return NextResponse.json({ advanced: true, to: 'voting' })
  }

  if (round.phase === 'voting') {
    // Tally whatever votes exist — if no votes or a tie, nobody is eliminated
    const { data: votes } = await supabase
      .from('votes')
      .select('*')
      .eq('round_id', round.id)

    const eliminatedId = tallyVotes(votes ?? [])
    if (eliminatedId) {
      await supabase.from('players').update({ is_alive: false }).eq('id', eliminatedId)
    }

    // Refetch alive players after potential elimination
    const { data: alivePlayers } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', round.room_id)
      .eq('is_alive', true)

    const winner = checkWinCondition(alivePlayers ?? [])

    // Move to result — guard with .eq('phase', 'voting') prevents double-advance
    await supabase
      .from('rounds')
      .update({
        phase: 'result',
        phase_ends_at: getPhaseEndsAt(10),
      })
      .eq('id', round.id)
      .eq('phase', 'voting')

    // Schedule post-result transition
    // Uses setTimeout but the client-side fallback in game/page.tsx
    // will call this endpoint again when result timer hits zero,
    // which handles the result phase directly above — no stale closure issues
    setTimeout(async () => {
      // Re-check phase at execution time — avoids acting on stale state
      const { data: currentRound } = await supabase
        .from('rounds')
        .select('phase')
        .eq('id', round.id)
        .single()

      // Only proceed if still in result (not already advanced by client fallback)
      if (currentRound?.phase !== 'result') return

      if (winner) {
        await supabase.from('rooms').update({ status: 'lobby' }).eq('id', round.room_id)
        await supabase.from('players')
          .update({ role: null, is_ready: false, is_alive: true })
          .eq('room_id', round.room_id)
      } else {
        const { data: nextPlayers } = await supabase
          .from('players')
          .select('*')
          .eq('room_id', round.room_id)
          .eq('is_alive', true)

        const wordPair = await generateWordPair()
        const roleMap = assignRoles(nextPlayers ?? [], room.spy_count)

        await Promise.all(
          (nextPlayers ?? []).map((p: Player) =>
            supabase.from('players').update({ role: roleMap.get(p.id), is_alive: true }).eq('id', p.id)
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

    return NextResponse.json({
      advanced: true,
      to: 'result',
      eliminated: eliminatedId ?? null,
      noVotes: (votes ?? []).length === 0,
    })
  }

  return NextResponse.json({ skipped: true, reason: 'Unknown phase' })
}