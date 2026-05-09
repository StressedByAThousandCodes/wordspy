import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase'
import { generateRoomCode } from '@/lib/game'

export async function POST(req: NextRequest) {
  const supabase = createServiceClient()
  const { nickname, deviceToken } = await req.json()

  if (!nickname?.trim()) {
    return NextResponse.json({ error: 'Nickname required' }, { status: 400 })
  }
  if (!deviceToken) {
    return NextResponse.json({ error: 'Device token required' }, { status: 400 })
  }

  // Generate unique room code
  let code = generateRoomCode()
  for (let i = 0; i < 10; i++) {
    const { data } = await supabase.from('rooms').select('id').eq('code', code).maybeSingle()
    if (!data) break
    code = generateRoomCode()
  }

  // Create room first with a placeholder host_id
  const { data: room, error: roomErr } = await supabase
    .from('rooms')
    .insert({
      code,
      host_id: '00000000-0000-0000-0000-000000000000',
      status: 'lobby',
      spy_count: 1,
      describe_seconds: 30,
      discuss_seconds: 60,
      vote_seconds: 30,
    })
    .select()
    .single()

  if (roomErr || !room) {
    return NextResponse.json({ error: 'Failed to create room' }, { status: 500 })
  }

  // Create the host player
  const { data: player, error: playerErr } = await supabase
    .from('players')
    .insert({
      room_id: room.id,
      nickname: nickname.trim(),
      device_token: deviceToken,
      is_ready: false,
      is_alive: true,
    })
    .select()
    .single()

  if (playerErr || !player) {
    await supabase.from('rooms').delete().eq('id', room.id)
    return NextResponse.json({ error: 'Failed to create player' }, { status: 500 })
  }

  // Update room with real host_id
  await supabase.from('rooms').update({ host_id: player.id }).eq('id', room.id)

  return NextResponse.json({ code, roomId: room.id, playerId: player.id })
}