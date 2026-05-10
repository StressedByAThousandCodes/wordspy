import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { generateWordPair } from "@/lib/words";
import { assignRoles, getPhaseEndsAt } from "@/lib/game";

export async function POST(
  req: NextRequest,
  { params }: { params: { code: string } },
) {
  const supabase = createServiceClient();

  // Get room
  const { data: room } = await supabase
    .from("rooms")
    .select("*")
    .eq("code", params.code.toUpperCase())
    .single();

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }
  if (room.status !== "lobby") {
    return NextResponse.json(
      { error: "Room is not in lobby" },
      { status: 400 },
    );
  }

  // Get players
  const { data: players } = await supabase
    .from("players")
    .select("*")
    .eq("room_id", room.id);

  if (!players || players.length < (room.min_players ?? 3)) {
    return NextResponse.json(
      { error: `Need at least ${room.min_players ?? 3} players` },
      { status: 400 },
    );
  }

  // Generate word pair
  const wordPair = await generateWordPair();

  // Assign roles randomly
  const roleMap = assignRoles(players, room.spy_count);

  // Update each player's role and reset state
  await Promise.all(
    players.map((p) =>
      supabase
        .from("players")
        .update({ role: roleMap.get(p.id), is_alive: true, is_ready: false })
        .eq("id", p.id),
    ),
  );

  // ← ADD THE CLEANUP HERE
  // Clean up all previous rounds for this room
  const { data: oldRounds } = await supabase
    .from("rounds")
    .select("id")
    .eq("room_id", room.id);

  if (oldRounds && oldRounds.length > 0) {
    const oldRoundIds = oldRounds.map((r: { id: string }) => r.id);
    await supabase.from("votes").delete().in("round_id", oldRoundIds);
    await supabase.from("descriptions").delete().in("round_id", oldRoundIds);
    await supabase.from("rounds").delete().eq("room_id", room.id);
  }

  // Create the first round
  const { data: round, error: roundErr } = await supabase
    .from("rounds")
    .insert({
      room_id: room.id,
      round_number: 1,
      civilian_word: wordPair.civilian,
      spy_word: wordPair.spy,
      phase: "describing",
      phase_ends_at: getPhaseEndsAt(room.describe_seconds),
    })
    .select()
    .single();

  if (roundErr || !round) {
    return NextResponse.json(
      { error: "Failed to create round" },
      { status: 500 },
    );
  }

  // Mark room as playing — this triggers Realtime on all clients to navigate to game
  await supabase.from("rooms").update({ status: "playing" }).eq("id", room.id);

  console.log("Room settings:", {
    describe: room.describe_seconds,
    discuss: room.discuss_seconds,
    vote: room.vote_seconds,
    spy_count: room.spy_count,
  });

  return NextResponse.json({ roundId: round.id });
}
