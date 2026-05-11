import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// Returns ONLY the current player's role — never other players' roles
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient()
  const playerId = req.nextUrl.searchParams.get('playerId')

  if (!playerId) {
    return NextResponse.json({ error: 'playerId required' }, { status: 400 })
  }

  const { data: player } = await supabase
    .from('players')
    .select('id, role')
    .eq('id', playerId)
    .single()

  if (!player) {
    return NextResponse.json({ error: 'Player not found' }, { status: 404 })
  }

  // Only return this player's own role — nothing about anyone else
  return NextResponse.json({ role: player.role })
}