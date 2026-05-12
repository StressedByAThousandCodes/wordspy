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

export async function GET(req: NextRequest) {
  // Protect the cron endpoint
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  let advanced = 0;

  // Find all rounds with expired phases (excluding result)
  const { data: expiredRounds } = await supabase
    .from("rounds")
    .select("*, rooms(*)")
    .lt("phase_ends_at", new Date().toISOString())
    .in("phase", ["describing", "discussing", "voting"]);

  for (const round of expiredRounds ?? []) {
    const room = round.rooms as any;

    if (round.phase === "describing") {
      await supabase
        .from("rounds")
        .update({
          phase: "discussing",
          phase_ends_at: getPhaseEndsAt(room.discuss_seconds),
        })
        .eq("id", round.id)
        .eq('phase', 'describing')  // ← prevents double-advance if client already moved it;
      advanced++;
    } else if (round.phase === "discussing") {
      await supabase
        .from("rounds")
        .update({
          phase: "voting",
          phase_ends_at: getPhaseEndsAt(room.vote_seconds),
        })
        .eq("id", round.id)
        .eq('phase', 'discussing')  // ← add guard;
      advanced++;
    } else if (round.phase === "voting") {
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

      await supabase
        .from("rounds")
        .update({
          phase: "result",
          phase_ends_at: getPhaseEndsAt(10),
        })
        .eq("id", round.id);
      advanced++;
    }
  }

  // Handle expired result phases
  const { data: expiredResults } = await supabase
    .from("rounds")
    .select("*, rooms(*)")
    .lt("phase_ends_at", new Date().toISOString())
    .eq("phase", "result");

  for (const round of expiredResults ?? []) {
    const room = round.rooms as any;

    const { data: alivePlayers } = await supabase
      .from("players")
      .select("*")
      .eq("room_id", round.room_id)
      .eq("is_alive", true);

    const winner = checkWinCondition(alivePlayers ?? []);

    if (winner) {
      await supabase
        .from("rooms")
        .update({ status: "lobby" })
        .eq("id", round.room_id);
      await supabase
        .from("players")
        .update({ role: null, is_ready: false, is_alive: true })
        .eq("room_id", round.room_id);
    } else {
      const wordPair = await generateWordPair();
      const roleMap = assignRoles(alivePlayers ?? [], room.spy_count);

      await Promise.all(
        (alivePlayers ?? []).map((p: Player) =>
          supabase
            .from("players")
            .update({ role: roleMap.get(p.id) })
            .eq("id", p.id),
        ),
      );

      await supabase.from("rounds").insert({
        room_id: round.room_id,
        round_number: round.round_number + 1,
        civilian_word: round.civilian_word, // ← reuse
        spy_word: round.spy_word, // ← reuse
        phase: "describing",
        phase_ends_at: getPhaseEndsAt(room.describe_seconds),
      });
    }
    advanced++;
  }

  return NextResponse.json({ advanced });
}
