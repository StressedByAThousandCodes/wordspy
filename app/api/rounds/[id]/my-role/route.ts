import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// FIX Bug 1 & 2: Returns only the player's own word — never their role string,
// never the other team's word. This prevents role leaking via network tab.
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient()
  const playerId = req.nextUrl.searchParams.get('playerId')

  if (!playerId) {
    return NextResponse.json({ error: 'playerId required' }, { status: 400 })
  }

  // Get the player's role
  const { data: player } = await supabase
    .from('players')
    .select('id, role')
    .eq('id', playerId)
    .single()

  if (!player) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 })
  }

  // role may be null if not yet assigned (race on game start) — return null word
  if (!player.role) {
    return NextResponse.json({ word: null })
  }

  // Get the round's words
  const { data: round } = await supabase
    .from('rounds')
    .select('civilian_word, spy_word')
    .eq('id', params.id)
    .single()

  if (!round) {
    return NextResponse.json({ error: 'Round not found' }, { status: 404 })
  }

  // Return ONLY the player's own word — never the other word, never the role string
  const word = player.role === 'spy' ? round.spy_word : round.civilian_word
  return NextResponse.json({ word })
}