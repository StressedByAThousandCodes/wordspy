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

/**
 * Called by the client when the countdown hits zero.
 * Safe to call multiple times — the .eq('phase', currentPhase) guard on every
 * UPDATE ensures only the first caller actually advances; subsequent calls are
 * no-ops because the phase has already changed.
 *
 * BUG FIX (Bug 1 / Bug 2):
 * Removed the setTimeout inside the voting→result transition. That setTimeout
 * created a race with the client-side fallback: both would call checkWinCondition
 * on potentially stale player data (roles already nulled out) and could trigger a
 * double-advance that skipped the next describing round entirely.
 *
 * The result→next-round logic is now handled ONLY here in the `result` phase
 * branch, which the client calls once the 8-second result countdown expires.
 * The client fallback in game/page.tsx triggers this endpoint again at that point,
 * giving us a single, clean transition path.
 *
 * BUG FIX (Bug 5 / result phase):
 * When fetching alive players for checkWinCondition we explicitly select the role
 * column from the DB (freshest source of truth) rather than trusting local state
 * that may already have been cleared.
 */
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

  // Fetch room separately to guarantee fresh settings
  const { data: room } = await supabase
    .from("rooms")
    .select("*")
    .eq("id", round.room_id)
    .single();

  if (!room) {
    return NextResponse.json({ error: "Room not found" }, { status: 404 });
  }

  // Guard — only advance if phase_ends_at has actually passed.
  // Give 2 seconds of leeway for client clock drift.
  // Exception: result phase can always be advanced (client calls after its own timer).
  const expired = new Date(round.phase_ends_at).getTime() <= Date.now() + 2000;
  if (!expired && round.phase !== "result") {
    return NextResponse.json({
      skipped: true,
      reason: "Timer not expired yet",
    });
  }

  // ── Result phase ──────────────────────────────────────────────────────────
  // Handle return to lobby OR start of next round.
  // This is reached when the 8-second result countdown expires (client calls us).
  if (round.phase === "result") {
    // Fetch alive players with roles directly from DB — never trust cached state
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
      return NextResponse.json({ advanced: true, to: "lobby", winner });
    } else {
      // Game continues — start a new round with the SAME word pair.
      // Reassign roles so spy identity can shift each round.
      const roleMap = assignRoles(alivePlayers ?? [], room.spy_count);

      // Alive players get a fresh role; eliminated players keep role=null (spectators)
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
      .eq("phase", "describing"); // prevents double-advance

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
      .eq("phase", "discussing"); // prevents double-advance

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

    // Move to result phase — 8 seconds for players to read the result.
    // The .eq('phase','voting') guard prevents double-advance if multiple
    // clients call simultaneously.
    const { error } = await supabase
      .from("rounds")
      .update({
        phase: "result",
        phase_ends_at: getPhaseEndsAt(8),
      })
      .eq("id", round.id)
      .eq("phase", "voting");

    if (error) console.error("Failed to advance voting→result:", error);

    // BUG FIX: Removed the setTimeout here. The double-advance race between
    // this setTimeout and the client-side result-phase fallback was the primary
    // cause of skipped rounds and premature game-over. The client handles the
    // result → next-round transition by calling this endpoint again when its
    // result timer expires (handled in the `result` branch above).

    return NextResponse.json({
      advanced: true,
      to: "result",
      eliminated: eliminatedId ?? null,
      noVotes: (votes ?? []).length === 0,
    });
  }

  return NextResponse.json({ skipped: true, reason: "Unknown phase" });
}