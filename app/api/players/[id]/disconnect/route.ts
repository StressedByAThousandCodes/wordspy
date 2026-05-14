import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

// POST /api/players/[id]/disconnect
// Called via navigator.sendBeacon on page unload — must be fast and
// return quickly. sendBeacon sends as application/x-www-form-urlencoded
// or text/plain so we don't parse a JSON body here.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient()
  const playerId = params.id

  if (!playerId) {
    return NextResponse.json({ error: 'Missing player id' }, { status: 400 })
  }

  // Get the player's room before deleting
  const { data: player } = await supabase
    .from('players')
    .select('room_id')
    .eq('id', playerId)
    .single()

  if (!player) {
    // Already gone — treat as success
    return NextResponse.json({ ok: true })
  }

  // Delete the player
  await supabase.from('players').delete().eq('id', playerId)

  // If no players remain, tear down the room
  const { count } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', player.room_id)

  if (count === 0) {
    const { data: rounds } = await supabase
      .from('rounds')
      .select('id')
      .eq('room_id', player.room_id)

    if (rounds && rounds.length > 0) {
      const roundIds = rounds.map((r: { id: string }) => r.id)
      await supabase.from('votes').delete().in('round_id', roundIds)
      await supabase.from('descriptions').delete().in('round_id', roundIds)
      await supabase.from('rounds').delete().eq('room_id', player.room_id)
    }

    await supabase.from('messages').delete().eq('room_id', player.room_id)
    await supabase.from('rooms').delete().eq('id', player.room_id)
  }

  return NextResponse.json({ ok: true })
}