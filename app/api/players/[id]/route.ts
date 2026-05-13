import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient()

  // Get the player's room before deleting
  const { data: player } = await supabase
    .from('players')
    .select('room_id')
    .eq('id', params.id)
    .single()

  const { error } = await supabase
    .from('players')
    .delete()
    .eq('id', params.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // FIX Bug 6: If no players remain in the room, delete it entirely
  if (player?.room_id) {
    const { count } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('room_id', player.room_id)

    if (count === 0) {
      // Clean up child rows first, then the room
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
  }

  return NextResponse.json({ ok: true })
}