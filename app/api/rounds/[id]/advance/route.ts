import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import {
  tallyVotes,
  checkWinCondition,
  getPhaseEndsAt,
  assignRoles,
} from "@/lib/game";
import { generateWordPair } from "@/lib/words";
import type { Player } from "@/types";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createServiceClient();

  const { data: round } = await supabase
    .from("rounds")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  const { data: room } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", round.room_id)
    .single();

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  // Guard: only advance if phase_ends_at has actually passed (2s leeway for clock drift)
  const expired = new Date(round.phase_ends_at).getTime() <= Date.now() + 2000;
  if (!expired && round.phase !== "result") {
    return NextResponse.json({ skipped: true, reason: "Timer not expired yet" });
  }

  // ── Result phase ──────────────────────────────────────────────────────────
  if (round.phase === "result") {
    // FIX Bug 5: Check if room is already back in lobby (retry race condition)
    if (room.status === "lobby") {
      return NextResponse.json({ skipped: true, reason: "Already in lobby" });
    }

    // Fetch alive players with roles from DB — source of truth
    const { data: alivePlayers } = await supabase
      .from("players")
      .select("id, role, is_alive, room_id, nickname, device_token, is_ready, joined_at")
      .eq("room_id", round.room_id)
      .eq("is_alive", true);

    const { data: allPlayers } = await supabase
      .from("players")
      .select("id, role, is_alive, room_id, nickname, device_token, is_ready, joined_at")
      .eq("room_id", round.room_id);

    const winner = checkWinCondition(alivePlayers ?? []);

    if (winner) {
      // Game over — return everyone to lobby
      await supabase
        .from("rooms")
        .update({ status: "lobby" })
        .eq("id", round.room_id);
      await supabase
        .from("players")
        .update({ role: null, is_ready: false, is_alive: true })
        .eq("room_id", round.room_id);
      // FIX Bug 2/4: Don't send winner/roles in response — Realtime handles navigation
      return NextResponse.json({ advanced: true, to: "lobby" });
    } else {
      // FIX Bug 3: if no alive players remain at all, go to lobby
      if (!alivePlayers || alivePlayers.length === 0) {
        await supabase
          .from("rooms")
          .update({ status: "lobby" })
          .eq("id", round.room_id);
        await supabase
          .from("players")
          .update({ role: null, is_ready: false, is_alive: true })
          .eq("room_id", round.room_id);
        return NextResponse.json({ advanced: true, to: "lobby" });
      }

      // Game continues — reassign roles and start next round with SAME word pair
      const roleMap = assignRoles(alivePlayers, room.spy_count);

      await Promise.all(
        (allPlayers ?? []).map((p: Player) =>
          supabase
            .from("players")
            .update({
              role: p.is_alive ? (roleMap.get(p.id) ?? "civilian") : null,
            })
            .eq("id", p.id)
        )
      );

      await supabase.from("rounds").insert({
        room_id: round.room_id,
        round_number: round.round_number + 1,
        civilian_word: round.civilian_word,
        spy_word: round.spy_word,
        phase: "describing",
        phase_ends_at: getPhaseEndsAt(room.describe_seconds),
      });

      return NextResponse.json({ advanced: true, to: "describing" });
    }
  }

  // ── Describing phase ───────────────────────────────────────────────────────
  if (round.phase === "describing") {
    const { error } = await supabase
      .from("rounds")
      .update({
        phase: "discussing",
        phase_ends_at: getPhaseEndsAt(room.discuss_seconds),
      })
      .eq("id", round.id)
      .eq("phase", "describing");

    if (error) console.error("Failed to advance describing→discussing:", error);
    return NextResponse.json({ advanced: true, to: "discussing" });
  }

  // ── Discussing phase ───────────────────────────────────────────────────────
  if (round.phase === "discussing") {
    const { error } = await supabase
      .from("rounds")
      .update({
        phase: "voting",
        phase_ends_at: getPhaseEndsAt(room.vote_seconds),
      })
      .eq("id", round.id)
      .eq("phase", "discussing");

    if (error) console.error("Failed to advance discussing→voting:", error);
    return NextResponse.json({ advanced: true, to: "voting" });
  }

  // ── Voting phase ───────────────────────────────────────────────────────────
  if (round.phase === "voting") {
    const { data: votes } = await supabase
      .from("votes")
      .select("*")
      .eq("round_id", round.id);

    const eliminatedId = tallyVotes(votes ?? []);

    if (eliminatedId) {
      await supabase
        .from("players")
        .update({ is_alive: false })
        .eq("id", eliminatedId);
    }

    const { error } = await supabase
      .from("rounds")
      .update({
        phase: "result",
        phase_ends_at: getPhaseEndsAt(8),
      })
      .eq("id", round.id)
      .eq("phase", "voting");

    if (error) console.error("Failed to advance voting→result:", error);

    return NextResponse.json({
      advanced: true,
      to: "result",
      // FIX Bug 2: don't expose eliminated player's role in response
      noVotes: (votes ?? []).length === 0,
    });
  }

  return NextResponse.json({ skipped: true, reason: "Unknown phase" });
}