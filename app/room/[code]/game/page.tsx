"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { Round, Player, Description, Vote, Room } from "@/types";

export default function GamePage() {
  const router = useRouter();
  const params = useParams();
  const code = params.code as string;

  const [room, setRoom] = useState<Room | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [descriptions, setDescriptions] = useState<Description[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [myDescription, setMyDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [voted, setVoted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const roundRef = useRef<Round | null>(null);
  const hasAdvanced = useRef(false);

  const myPlayer = players.find((p) => p.id === myPlayerId);
  const alivePlayers = players.filter((p) => p.is_alive);
  const isAlive = myPlayer?.is_alive ?? false;

  const eliminatedPlayerId = votes.length > 0
    ? (() => {
        const counts = new Map<string, number>()
        for (const v of votes) {
          counts.set(v.target_id, (counts.get(v.target_id) ?? 0) + 1)
        }
        let max = 0, id: string | null = null
        for (const [pid, count] of counts) {
          if (count > max) { max = count; id = pid }
          else if (count === max) id = null
        }
        return id
      })()
    : null;

  // ── Countdown timer synced to server ──────────────────────────
  useEffect(() => {
    if (!round?.phase_ends_at) return;
    function tick() {
      const ms = new Date(round!.phase_ends_at).getTime() - Date.now();
      setSecondsLeft(Math.max(0, Math.round(ms / 1000)));
    }
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [round?.phase_ends_at]);

  // ── Initial data load ─────────────────────────────────────────
  useEffect(() => {
    const playerId = sessionStorage.getItem("playerId");
    if (!playerId) {
      router.replace(`/join?code=${code}`);
      return;
    }
    setMyPlayerId(playerId);

    async function load() {
      const { data: roomData } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", code)
        .single();

      if (!roomData) return;
      setRoom(roomData);

      const [{ data: playersData }, { data: roundData }] = await Promise.all([
        supabase
          .from("players")
          .select("*")
          .eq("room_id", roomData.id)
          .order("joined_at"),
        supabase
          .from("rounds")
          .select("*")
          .eq("room_id", roomData.id)
          .order("round_number", { ascending: false })
          .limit(1)
          .single(),
      ]);

      if (playersData) setPlayers(playersData);
      if (roundData) {
        setRound(roundData);
        roundRef.current = roundData;
        await loadRoundData(roundData.id);
      }

      setLoading(false);
    }

    load();
  }, [code, router]);

  // ── Client-side phase advancement when timer expires ──────────
  useEffect(() => {
    if (secondsLeft !== 0) {
      hasAdvanced.current = false; // reset for each new phase
      return;
    }
    if (!round || round.phase === "result") return;
    if (hasAdvanced.current) return;

    // Only the earliest-joined alive player triggers the advance
    const advancer = [...alivePlayers].sort(
      (a, b) =>
        new Date(a.joined_at).getTime() - new Date(b.joined_at).getTime(),
    )[0];

    if (advancer?.id !== myPlayerId) return;

    hasAdvanced.current = true;

    fetch(`/api/rounds/${round.id}/advance`, { method: "POST" })
      .then((r) => r.json())
      .then((d) => console.log("Advance result:", d))
      .catch((e) => console.error("Advance failed:", e));
  }, [secondsLeft, round?.id, round?.phase]);

  async function loadRoundData(roundId: string) {
    const [{ data: descData }, { data: voteData }] = await Promise.all([
      supabase.from("descriptions").select("*").eq("round_id", roundId),
      supabase.from("votes").select("*").eq("round_id", roundId),
    ]);
    if (descData) setDescriptions(descData);
    if (voteData) setVotes(voteData);
  }

  // ── Realtime subscriptions ─────────────────────────────────────
  useEffect(() => {
    if (!room) return;

    const channel = supabase
      .channel(`game:${room.id}`)
      // Round phase changes
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rounds",
          filter: `room_id=eq.${room.id}`,
        },
        async (payload) => {
          const updated = payload.new as Round;
          setRound(updated);
          roundRef.current = updated;
          setSubmitted(false);
          setVoted(false);
          setMyDescription("");
          // Clear stale votes and descriptions before loading new round data
          setVotes([]);
          setDescriptions([]);
          await loadRoundData(updated.id);
        },
      )
      // Player changes (eliminations)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `room_id=eq.${room.id}`,
        },
        async () => {
          const { data } = await supabase
            .from("players")
            .select("*")
            .eq("room_id", room.id)
            .order("joined_at");
          if (data) setPlayers(data);
        },
      )
      // New descriptions submitted
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "descriptions" },
        async () => {
          if (roundRef.current) await loadRoundData(roundRef.current.id);
        },
      )
      // New votes cast
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "votes" },
        async () => {
          if (roundRef.current) await loadRoundData(roundRef.current.id);
        },
      )
      // Room status (back to lobby after game ends)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${room.id}`,
        },
        (payload) => {
          const updated = payload.new as Room;
          setRoom(updated);
          if (updated.status === "lobby") {
            router.push(`/room/${code}/lobby`);
          }
        },
      )
      .subscribe((status) => {
        console.log("Game channel:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [room, code, router]);

  // ── Actions ───────────────────────────────────────────────────
  async function submitDescription() {
    if (!round || !myPlayerId || submitted || !myDescription.trim()) return;
    setSubmitted(true);
    const res = await fetch("/api/descriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roundId: round.id,
        playerId: myPlayerId,
        content: myDescription.trim(),
      }),
    });
    if (!res.ok) setSubmitted(false);
  }

  async function castVote(targetId: string) {
    if (!round || !myPlayerId || voted || !isAlive) return;
    setVoted(true);
    const res = await fetch(`/api/rounds/${round.id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voterId: myPlayerId, targetId }),
    });
    if (!res.ok) setVoted(false);
  }

  // ── Render ────────────────────────────────────────────────────
  if (loading || !round) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500 animate-pulse">Loading game…</p>
      </main>
    );
  }

  const myWord =
    myPlayer?.role === "spy" ? round.spy_word : round.civilian_word;

  const phaseDuration = round.created_at
    ? Math.round(
        (new Date(round.phase_ends_at).getTime() -
          new Date(round.created_at).getTime()) /
          1000
      )
    : (room?.describe_seconds ?? 30);

  const timerPct = Math.min(100, (secondsLeft / phaseDuration) * 100);
  const timerColor = secondsLeft <= 10 ? "bg-red-500" : "bg-indigo-500";

  return (
    <main className="min-h-screen p-6 max-w-lg mx-auto space-y-6">
      {/* Timer */}
      <div className="pt-6 space-y-2">
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-400 capitalize font-medium">
            {round.phase} phase · Round {round.round_number}
          </span>
          <span
            className={`font-mono font-bold ${secondsLeft <= 10 ? "text-red-400" : "text-white"}`}
          >
            {secondsLeft}s
          </span>
        </div>
        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${timerColor} rounded-full transition-all duration-500`}
            style={{ width: `${timerPct}%` }}
          />
        </div>
      </div>

      {/* ── Describing phase ── */}
      {round.phase === "describing" && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-gray-800 border border-gray-700 p-6 text-center space-y-2">
            <p className="text-gray-400 text-sm">Your word is</p>
            <p className="text-4xl font-bold text-indigo-400 tracking-wide">
              {myWord}
            </p>
            {myPlayer?.role === "spy" && (
              <span className="inline-block text-xs text-red-400 bg-red-400/10 px-3 py-1 rounded-full">
                You are the spy 🕵️
              </span>
            )}
          </div>

          {isAlive && !submitted ? (
            <div className="space-y-3">
              <textarea
                rows={3}
                placeholder="Describe your word without saying it directly…"
                value={myDescription}
                onChange={(e) => setMyDescription(e.target.value)}
                maxLength={200}
                className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none transition"
              />
              <button
                onClick={submitDescription}
                disabled={!myDescription.trim()}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 font-semibold transition"
              >
                Submit Description
              </button>
            </div>
          ) : submitted ? (
            <p className="text-center text-green-400 text-sm">
              ✓ Submitted! Waiting for others…
            </p>
          ) : (
            <p className="text-center text-gray-500 text-sm">
              You have been eliminated — watching only
            </p>
          )}

          <p className="text-center text-gray-600 text-xs">
            {descriptions.length} / {alivePlayers.length} submitted
          </p>
        </div>
      )}

      {/* ── Discussing phase ── */}
      {round.phase === "discussing" && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-400">
            All descriptions — discuss who seems suspicious
          </p>
          {alivePlayers.map((p) => {
            const desc = descriptions.find((d) => d.player_id === p.id);
            return (
              <div
                key={p.id}
                className="rounded-xl bg-gray-800 border border-gray-700 p-4 space-y-2"
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold">
                    {p.nickname[0].toUpperCase()}
                  </div>
                  <span className="text-sm font-medium">{p.nickname}</span>
                  {p.id === myPlayerId && (
                    <span className="text-xs text-gray-500">(you)</span>
                  )}
                </div>
                <p className="text-gray-300 text-sm pl-8">
                  {desc?.content ?? (
                    <span className="text-gray-600 italic">
                      No description submitted
                    </span>
                  )}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Voting phase ── */}
      {round.phase === "voting" && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-400">
            Vote to eliminate the spy
          </p>

          {!isAlive && (
            <p className="text-center text-gray-500 text-sm py-2">
              You have been eliminated — watching only
            </p>
          )}

          {alivePlayers
            .filter((p) => p.id !== myPlayerId)
            .map((p) => {
              const voteCount = votes.filter(
                (v) => v.target_id === p.id,
              ).length;
              const iVotedFor = votes.find(
                (v) => v.voter_id === myPlayerId && v.target_id === p.id,
              );
              return (
                <button
                  key={p.id}
                  onClick={() => castVote(p.id)}
                  disabled={voted || !isAlive}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition
                    ${
                      iVotedFor
                        ? "bg-red-500/10 border-red-500/50 text-red-300"
                        : "bg-gray-800 border-gray-700 hover:border-red-400/50 disabled:opacity-50 disabled:cursor-not-allowed"
                    }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold">
                      {p.nickname[0].toUpperCase()}
                    </div>
                    <span className="font-medium">{p.nickname}</span>
                  </div>
                  {voteCount > 0 && (
                    <span className="text-sm text-gray-400">
                      {voteCount} vote{voteCount > 1 ? "s" : ""}
                    </span>
                  )}
                </button>
              );
            })}

          {voted && (
            <p className="text-center text-green-400 text-sm">
              ✓ Vote cast! Waiting for others…
            </p>
          )}

          <p className="text-center text-gray-600 text-xs">
            {votes.length} / {alivePlayers.length} voted
          </p>
        </div>
      )}

      {/* ── Result phase ── */}
      {round.phase === "result" && (
        <ResultPhase
          players={players}
          round={round}
          myPlayerId={myPlayerId}
          eliminatedPlayerId={eliminatedPlayerId}
        />
      )}
    </main>
  );
}

// ── Result phase component ─────────────────────────────────────

function ResultPhase({
  players,
  round,
  myPlayerId,
  eliminatedPlayerId,
}: {
  players: Player[];
  round: Round;
  myPlayerId: string | null;
  eliminatedPlayerId: string | null;
}) {
  const eliminated = eliminatedPlayerId
    ? players.find((p) => p.id === eliminatedPlayerId)
    : null;
  const alivePlayers = players.filter((p) => p.is_alive);
  const spiesAlive = alivePlayers.filter((p) => p.role === "spy");
  const civiliansAlive = alivePlayers.filter((p) => p.role === "civilian");
  const gameOver =
    spiesAlive.length === 0 || spiesAlive.length >= civiliansAlive.length;
  const winner = spiesAlive.length === 0 ? "civilians" : "spies";

  return (
    <div className="space-y-6 text-center py-6">
      {eliminated && (
        <div className="rounded-2xl bg-gray-800 border border-gray-700 p-6 space-y-2">
          <p className="text-gray-400 text-sm">Eliminated</p>
          <p className="text-2xl font-bold">{eliminated.nickname}</p>
          <p
            className={`text-sm font-medium ${eliminated.role === "spy" ? "text-red-400" : "text-blue-400"}`}
          >
            They were a {eliminated.role}{" "}
            {eliminated.role === "spy" ? "🕵️" : "👤"}
          </p>
        </div>
      )}

      {gameOver ? (
        <div className="space-y-3">
          <p className="text-5xl">{winner === "civilians" ? "🎉" : "🕵️"}</p>
          <p className="text-2xl font-bold">
            {winner === "civilians" ? "Civilians win!" : "Spies win!"}
          </p>
          <div className="pt-2 space-y-1">
            <p className="text-gray-400 text-sm">The words were:</p>
            <p className="text-sm">
              Civilians had{" "}
              <span className="text-indigo-400 font-semibold">
                {round.civilian_word}
              </span>
              {" · "}
              Spies had{" "}
              <span className="text-red-400 font-semibold">
                {round.spy_word}
              </span>
            </p>
          </div>
          <p className="text-gray-500 text-sm pt-2">Returning to lobby…</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-4xl">⏳</p>
          <p className="text-xl font-bold">Round over</p>
          <p className="text-gray-400 text-sm">
            {spiesAlive.length} spy{spiesAlive.length > 1 ? "ies" : ""} still
            hiding…
          </p>
          <p className="text-gray-500 text-sm">Next round starting soon…</p>
        </div>
      )}
    </div>
  );
}
