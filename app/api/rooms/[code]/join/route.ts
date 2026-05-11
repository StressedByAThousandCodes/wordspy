import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";

export async function POST(
  req: NextRequest,
  { params }: { params: { code: string } },
) {
  const supabase = createServiceClient();
  const { nickname, deviceToken } = await req.json();

  if (!nickname?.trim()) {
    return NextResponse.json({ error: "Nickname required" }, { status: 400 });
  }
  if (!deviceToken) {
    return NextResponse.json(
      { error: "Device token required" },
      { status: 400 },
    );
  }

  // Find room
  const { data: room } = await supabase
    .from("rooms")
    .select("*")
    .eq("code", params.code.toUpperCase())
    .single();

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  if (room.status !== 'lobby') {
    // Check if this device already has a player in the room
    const { data: existingPlayer } = await supabase
      .from('players')
      .select('id')
      .eq('room_id', room.id)
      .eq('device_token', deviceToken)
      .maybeSingle()

    if (existingPlayer) {
      // Returning player — let them back in as spectator
      return NextResponse.json({ playerId: existingPlayer.id, roomId: room.id, rejoining: true })
    }

    return NextResponse.json({ error: 'Game already in progress' }, { status: 400 })
  }

  // Check player count
  const { count } = await supabase
    .from("players")
    .select("id", { count: "exact", head: true })
    .eq("room_id", room.id);

  if ((count ?? 0) >= (room.max_players ?? 16)) {
    return NextResponse.json({ error: "Room is full" }, { status: 400 });
  }

  // Return existing player if same device rejoins
  const { data: existing } = await supabase
    .from("players")
    .select("id")
    .eq("room_id", room.id)
    .eq("device_token", deviceToken)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ playerId: existing.id, roomId: room.id });
  }

  // Add new player
  const { data: player, error: playerErr } = await supabase
    .from("players")
    .insert({
      room_id: room.id,
      nickname: nickname.trim(),
      device_token: deviceToken,
      is_ready: false,
      is_alive: true,
    })
    .select()
    .single();

  if (playerErr || !player) {
    return NextResponse.json({ error: "Failed to join room" }, { status: 500 });
  }

  return NextResponse.json({ playerId: player.id, roomId: room.id });
}
