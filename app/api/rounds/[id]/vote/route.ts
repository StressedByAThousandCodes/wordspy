import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { tallyVotes, checkWinCondition, getPhaseEndsAt } from "@/lib/game";
import type { Player } from "@/types";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const supabase = createServiceClient();
  const { voterId, targetId } = await req.json();

  if (!voterId || !targetId) {
    return NextResponse.json(
      { error: "voterId and targetId required" },
      { status: 400 },
    );
  }

  // Verify round
  const { data: round } = await supabase
    .from("rounds")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }
  if (round.phase !== "voting") {
    return NextResponse.json({ error: "Not in voting phase" }, { status: 400 });
  }

  const { data: voter } = await supabase
    .from("players")
    .select("is_alive")
    .eq("id", voterId)
    .single();

  if (!voter?.is_alive) {
    return NextResponse.json(
      { error: "Eliminated players cannot vote" },
      { status: 403 },
    );
  }

  // Upsert — allows changing vote while timer is running
  const { error } = await supabase
    .from("votes")
    .upsert(
      { round_id: params.id, voter_id: voterId, target_id: targetId },
      { onConflict: "round_id,voter_id" },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Check if all alive players have voted
  const { data: alivePlayers } = await supabase
    .from("players")
    .select("*")
    .eq("room_id", round.room_id)
    .eq("is_alive", true);

  const { data: votes } = await supabase
    .from("votes")
    .select("*")
    .eq("round_id", params.id);

  const allVoted = alivePlayers && votes && votes.length >= alivePlayers.length;

  if (allVoted) {
    await resolveVoting(round, alivePlayers as Player[], votes, supabase);
  }

  return NextResponse.json({ ok: true });
}

async function resolveVoting(
  round: any,
  alivePlayers: Player[],
  votes: any[],
  supabase: any,
) {
  // Guard: only advance if still in voting phase
  const { data: freshRound } = await supabase
    .from("rounds")
    .select("phase")
    .eq("id", round.id)
    .single();
  if (freshRound?.phase !== "voting") return;

  const eliminatedId = tallyVotes(votes);
  if (eliminatedId) {
    await supabase
      .from("players")
      .update({ is_alive: false })
      .eq("id", eliminatedId);
  }

  // FIX Bug 3: re-fetch alive players AFTER elimination so win condition
  // uses the freshest data, not the pre-elimination snapshot
  const { data: aliveAfterElim } = await supabase
    .from("players")
    .select("id, role, is_alive, room_id, nickname, device_token, is_ready, joined_at")
    .eq("room_id", round.room_id)
    .eq("is_alive", true);

  const winner = checkWinCondition(aliveAfterElim ?? []);

  const { error: phaseErr } = await supabase
    .from("rounds")
    .update({
      phase: "result",
      phase_ends_at: getPhaseEndsAt(8),
    })
    .eq("id", round.id)
    .eq("phase", "voting");

  if (phaseErr) return;

  // If game is already decided, immediately end after showing result
  if (winner) {
    // Give players 8s to see the result, then the advance endpoint will
    // handle returning to lobby when the result timer expires
  }
}