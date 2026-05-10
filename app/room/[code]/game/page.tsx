"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getPlayerEmoji, getPlayerColor } from "@/lib/player";
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
  const [showDescribeModal, setShowDescribeModal] = useState(false);
  const roundRef = useRef<Round | null>(null);
  const hasAdvanced = useRef(false);
  const lastPhase = useRef<string | null>(null);

  const myPlayer = players.find((p) => p.id === myPlayerId);
  const alivePlayers = players.filter((p) => p.is_alive);
  const isAlive = myPlayer?.is_alive ?? false;

  // Derive eliminated player from votes
  const eliminatedPlayerId =
    votes.length > 0
      ? (() => {
          const counts = new Map<string, number>();
          for (const v of votes)
            counts.set(v.target_id, (counts.get(v.target_id) ?? 0) + 1);
          let max = 0,
            id: string | null = null;
          for (const [pid, count] of counts) {
            if (count > max) {
              max = count;
              id = pid;
            } else if (count === max) id = null;
          }
          return id;
        })()
      : null;

  useEffect(() => {
    if (round?.phase && round.phase !== lastPhase.current) {
      hasAdvanced.current = false;
      lastPhase.current = round.phase;
    }
  }, [round?.phase]);

  // Countdown synced to server
  useEffect(() => {
    if (!round?.phase_ends_at) return;
    function tick() {
      const ms = new Date(round!.phase_ends_at).getTime() - Date.now();
      setSecondsLeft(Math.max(0, Math.round(ms / 1000)));
    }
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.phase_ends_at]);

  // Open describe modal when describing phase starts
  useEffect(() => {
    if (round?.phase === "describing" && isAlive && !submitted) {
      setShowDescribeModal(true);
    } else {
      setShowDescribeModal(false);
    }
  }, [round?.phase, isAlive, submitted]);

  // Initial load
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

  // Client-side phase advancement
  useEffect(() => {
    if (secondsLeft !== 0) return;
    if (!round || round.phase === "result") return;
    if (hasAdvanced.current) return;

    // All alive players try — the server guard prevents double-advancing
    hasAdvanced.current = true;

    console.log(
      "Timer expired, advancing phase:",
      round.phase,
      "round:",
      round.id,
    );

    fetch(`/api/rounds/${round.id}/advance`, { method: "POST" })
      .then((r) => r.json())
      .then((d) => console.log("Advance result:", d))
      .catch((e) => {
        console.error("Advance failed:", e);
        hasAdvanced.current = false; // allow retry on failure
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, round?.id, round?.phase]);

  async function loadRoundData(roundId: string) {
    const [{ data: descData }, { data: voteData }] = await Promise.all([
      supabase.from("descriptions").select("*").eq("round_id", roundId),
      supabase.from("votes").select("*").eq("round_id", roundId),
    ]);
    if (descData) setDescriptions(descData);
    if (voteData) setVotes(voteData);
  }

  // Realtime
  useEffect(() => {
    if (!room) return;
    const channel = supabase
      .channel(`game:${room.id}`)
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
          setVotes([]);
          setDescriptions([]);
          await loadRoundData(updated.id);
        },
      )
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
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "descriptions" },
        async () => {
          if (roundRef.current) await loadRoundData(roundRef.current.id);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "votes" },
        async () => {
          if (roundRef.current) await loadRoundData(roundRef.current.id);
        },
      )
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
          if (updated.status === "lobby") router.push(`/room/${code}/lobby`);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [room, code, router]);

  async function submitDescription() {
    if (!round || !myPlayerId || submitted || !myDescription.trim()) return;
    setSubmitted(true);
    setShowDescribeModal(false);
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
    if (!round || !myPlayerId || !isAlive) return;

    // If already voted for this player, do nothing
    const existingVote = votes.find((v) => v.voter_id === myPlayerId);
    if (existingVote?.target_id === targetId) return;

    // Optimistically update local state
    setVoted(true);

    const res = await fetch(`/api/rounds/${round.id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voterId: myPlayerId, targetId }),
    });
    if (!res.ok) setVoted(false);
  }

  if (loading || !round) return <GameLoading />;

  const myWord =
    myPlayer?.role === "spy" ? round.spy_word : round.civilian_word;
  const phaseDuration = round.created_at
    ? Math.round(
        (new Date(round.phase_ends_at).getTime() -
          new Date(round.created_at).getTime()) /
          1000,
      )
    : 30;
  const timerPct = Math.min(100, (secondsLeft / phaseDuration) * 100);
  const isUrgent = secondsLeft <= 10 && secondsLeft > 0;

  const phaseLabel: Record<string, string> = {
    describing: "📝 Describe",
    discussing: "💬 Discuss",
    voting: "🗳️ Vote",
    result: "📊 Result",
  };

  return (
    <main className="min-h-screen bg-[#0a0a0f] pb-8">
      <div className="absolute inset-0 bg-[linear-gradient(rgba(139,92,246,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(139,92,246,0.02)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      {/* Header */}
      <div className="sticky top-0 z-20 bg-[#0a0a0f]/90 backdrop-blur-md border-b border-zinc-900 px-4 py-3">
        <div className="max-w-sm mx-auto">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
                Round {round.round_number}
              </span>
              <p className="text-sm font-bold text-white">
                {phaseLabel[round.phase]}
              </p>
            </div>
            <div className="text-right">
              <span
                className={`text-2xl font-black tabular-nums transition-all ${isUrgent ? "text-red-400 animate-pulse" : "text-white"}`}
                style={{ fontFamily: "'Syne', sans-serif" }}
              >
                {secondsLeft}s
              </span>
            </div>
          </div>
          <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${timerPct}%`,
                background: isUrgent
                  ? "linear-gradient(90deg, #ef4444, #f97316)"
                  : "linear-gradient(90deg, #7c3aed, #a855f7)",
              }}
            />
          </div>
        </div>
      </div>

      <div className="relative z-10 max-w-sm mx-auto px-4 pt-5 space-y-4">
        {/* ── My word card (describing phase) ── */}
        {round.phase === "describing" && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5 space-y-4">
            <div className="text-center space-y-1">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
                Your word
              </p>
              <p
                className="text-4xl font-black text-white tracking-tight"
                style={{ fontFamily: "'Syne', sans-serif" }}
              >
                {myWord}
              </p>
              <p className="text-xs text-zinc-600">
                Describe it without saying the word directly
              </p>
            </div>

            {isAlive && !submitted ? (
              <button
                onClick={() => setShowDescribeModal(true)}
                className="w-full py-3.5 rounded-2xl font-bold text-white text-sm relative overflow-hidden group"
                style={{
                  background: "linear-gradient(135deg, #7c3aed, #a855f7)",
                }}
              >
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                ✏️ Write my description
              </button>
            ) : submitted ? (
              <div className="flex items-center justify-center gap-2 py-3 bg-green-500/10 border border-green-500/20 rounded-2xl">
                <span className="text-green-400 font-bold text-sm">
                  ✓ Description submitted!
                </span>
              </div>
            ) : (
              <div className="py-3 text-center text-zinc-600 text-sm">
                Watching this round
              </div>
            )}
          </div>
        )}

        {/* ── Player cards — all phases ── */}
        {(round.phase === "describing" || round.phase === "discussing") && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest px-1">
              {round.phase === "describing" ? "Players" : "All descriptions"}
            </p>
            {alivePlayers.map((p) => {
              const emoji = getPlayerEmoji(p.id);
              const color = getPlayerColor(p.id);
              const desc = descriptions.find((d) => d.player_id === p.id);
              const isMe = p.id === myPlayerId;
              const hasSubmitted = !!desc;

              return (
                <div
                  key={p.id}
                  className={`rounded-2xl border p-3.5 transition-all duration-300
                    ${isMe ? "border-violet-500/40 bg-violet-500/5" : "border-zinc-800 bg-zinc-900/60"}
                  `}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`relative w-11 h-11 rounded-xl bg-gradient-to-br ${color.bg} flex items-center justify-center text-xl shrink-0`}
                    >
                      {emoji}
                      {round.phase === "describing" && (
                        <div
                          className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-[#0a0a0f] flex items-center justify-center
                          ${hasSubmitted ? "bg-green-500" : "bg-zinc-700"}`}
                        >
                          <span className="text-[8px] text-white">
                            {hasSubmitted ? "✓" : "…"}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-white text-sm truncate">
                          {p.nickname}
                        </span>
                        {isMe && (
                          <span className="text-[10px] text-zinc-600">
                            (you)
                          </span>
                        )}
                      </div>
                      {round.phase === "discussing" && desc && (
                        <p
                          className={`text-sm mt-1 leading-relaxed ${isMe ? "text-violet-300" : "text-zinc-300"}`}
                        >
                          &ldquo;{desc.content}&rdquo;
                        </p>
                      )}
                      {round.phase === "discussing" && !desc && (
                        <p className="text-xs text-zinc-600 mt-1 italic">
                          No description submitted
                        </p>
                      )}
                      {round.phase === "describing" && (
                        <p
                          className={`text-xs mt-0.5 ${hasSubmitted ? "text-green-400" : "text-zinc-600"}`}
                        >
                          {hasSubmitted ? "✓ Submitted" : "Thinking…"}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {round.phase === "describing" && (
              <p className="text-center text-xs text-zinc-700 py-1">
                {descriptions.length} / {alivePlayers.length} submitted
              </p>
            )}
          </div>
        )}

        {/* ── Voting phase ── */}
        {round.phase === "voting" && (
          <div className="space-y-3">
            <div className="text-center py-2">
              <p
                className="text-lg font-black text-white"
                style={{ fontFamily: "'Syne', sans-serif" }}
              >
                Who is the spy?
              </p>
              <p className="text-xs text-zinc-500 mt-1">
                Tap a player to vote • Tap again to confirm
              </p>
            </div>

            {!isAlive && (
              <div className="text-center py-3 text-zinc-600 text-sm bg-zinc-900 rounded-2xl border border-zinc-800">
                You were eliminated — watching only 👁️
              </div>
            )}

            {alivePlayers
              .filter((p) => p.id !== myPlayerId)
              .map((p) => {
                const emoji = getPlayerEmoji(p.id);
                const color = getPlayerColor(p.id);
                const voteCount = votes.filter(
                  (v) => v.target_id === p.id,
                ).length;
                const iVotedFor = !!votes.find(
                  (v) => v.voter_id === myPlayerId && v.target_id === p.id,
                );

                return (
                  <button
                    key={p.id}
                    onClick={() => castVote(p.id)}
                    disabled={voted || !isAlive}
                    className={`w-full flex items-center gap-3 p-4 rounded-2xl border transition-all duration-200 text-left
                    ${
                      iVotedFor
                        ? "border-violet-500/40 bg-violet-500/5"
                        : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                    }`}
                  >
                    <div
                      className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color.bg} flex items-center justify-center text-2xl shrink-0`}
                    >
                      {emoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white text-sm">
                        {p.nickname}
                      </p>
                      {iVotedFor && (
                        <p className="text-xs text-violet-400 font-semibold mt-0.5">
                          ✓ Your vote — tap another to change
                        </p>
                      )}
                      {voteCount > 0 && (
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-red-500 rounded-full transition-all duration-500"
                              style={{
                                width: `${Math.min(100, (voteCount / alivePlayers.length) * 100)}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs text-zinc-500 shrink-0">
                            {voteCount} vote{voteCount !== 1 ? "s" : ""}
                          </span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}

            {voted && (
              <div className="text-center py-3 bg-violet-500/10 border border-violet-500/20 rounded-2xl">
                <p className="text-violet-400 font-bold text-sm">✓ Vote cast — tap another player to change</p>
              </div>
            )}

            <p className="text-center text-xs text-zinc-700">
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
      </div>

      {/* ── Describe modal ── */}
      {showDescribeModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center p-4"
          style={{
            background: "rgba(0,0,0,0.85)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-700 rounded-3xl p-6 space-y-4 shadow-2xl">
            <div className="text-center space-y-1">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
                Your word is
              </p>
              <p
                className="text-4xl font-black text-white"
                style={{ fontFamily: "'Syne', sans-serif" }}
              >
                {myWord}
              </p>
              <p className="text-xs text-zinc-500">
                Describe it in one sentence — don&apos;t say the word!
              </p>
            </div>

            <div className="space-y-3">
              <textarea
                rows={3}
                autoFocus
                placeholder="e.g. You use this every morning to wake up…"
                value={myDescription}
                onChange={(e) => setMyDescription(e.target.value)}
                maxLength={200}
                className="w-full bg-zinc-800 border border-zinc-700 text-white placeholder-zinc-600 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all resize-none"
              />
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-600 tabular-nums">
                  {myDescription.length}/200
                </span>
                <span
                  className={`text-xs font-bold tabular-nums ${isUrgent ? "text-red-400 animate-pulse" : "text-zinc-500"}`}
                >
                  {secondsLeft}s left
                </span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowDescribeModal(false)}
                className="flex-1 py-3.5 rounded-2xl border border-zinc-700 text-zinc-400 hover:text-white text-sm font-semibold transition"
              >
                Later
              </button>
              <button
                onClick={submitDescription}
                disabled={!myDescription.trim()}
                className="flex-1 py-3.5 rounded-2xl font-bold text-white text-sm disabled:opacity-40 transition relative overflow-hidden group"
                style={{
                  background: "linear-gradient(135deg, #7c3aed, #a855f7)",
                }}
              >
                <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                <span className="relative">Submit ✓</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// ── Result Phase ──────────────────────────────────────────────

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
  const civiliansWin = spiesAlive.length === 0;

  return (
    <div className="space-y-4 pt-2">
      {/* Eliminated card */}
      {eliminated && (
        <div
          className={`rounded-3xl border p-5 text-center space-y-3
          ${eliminated.role === "spy" ? "border-red-500/30 bg-red-500/5" : "border-zinc-700 bg-zinc-900"}`}
        >
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
            Eliminated
          </p>
          <div
            className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${getPlayerColor(eliminated.id).bg} flex items-center justify-center text-3xl mx-auto`}
          >
            {getPlayerEmoji(eliminated.id)}
          </div>
          <div>
            <p
              className="text-xl font-black text-white"
              style={{ fontFamily: "'Syne', sans-serif" }}
            >
              {eliminated.nickname}
            </p>
            <p
              className={`text-sm font-bold mt-1 ${eliminated.role === "spy" ? "text-red-400" : "text-zinc-400"}`}
            >
              {eliminated.role === "spy"
                ? "🕵️ Was the spy!"
                : "👤 Was a civilian"}
            </p>
          </div>
        </div>
      )}

      {/* Game over */}
      {gameOver ? (
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 text-center space-y-4">
          <p className="text-5xl">{civiliansWin ? "🎉" : "🕵️"}</p>
          <p
            className="text-2xl font-black text-white"
            style={{ fontFamily: "'Syne', sans-serif" }}
          >
            {civiliansWin ? "Civilians Win!" : "Spies Win!"}
          </p>
          <div className="space-y-1">
            <p className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">
              The words were
            </p>
            <p className="text-sm text-zinc-300">
              Civilians:{" "}
              <span className="font-bold text-violet-400">
                {round.civilian_word}
              </span>
              {" · "}
              Spy:{" "}
              <span className="font-bold text-red-400">{round.spy_word}</span>
            </p>
          </div>

          {/* Full role reveal */}
          <div className="space-y-2 pt-2">
            <p className="text-xs text-zinc-600 font-semibold uppercase tracking-wider">
              All roles
            </p>
            {players.map((p) => (
              <div
                key={p.id}
                className={`flex items-center gap-3 p-3 rounded-2xl border
                  ${p.role === "spy" ? "border-red-500/20 bg-red-500/5" : "border-zinc-800 bg-zinc-900/40"}`}
              >
                <div
                  className={`w-9 h-9 rounded-xl bg-gradient-to-br ${getPlayerColor(p.id).bg} flex items-center justify-center text-lg shrink-0`}
                >
                  {getPlayerEmoji(p.id)}
                </div>
                <span className="flex-1 font-bold text-white text-sm text-left">
                  {p.nickname}
                </span>
                <span
                  className={`text-xs font-bold ${p.role === "spy" ? "text-red-400" : "text-zinc-500"}`}
                >
                  {p.role === "spy" ? "🕵️ Spy" : "👤 Civilian"}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-zinc-600 animate-pulse">
            Returning to lobby…
          </p>
        </div>
      ) : (
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 text-center space-y-2">
          <p className="text-3xl">⏳</p>
          <p
            className="text-xl font-black text-white"
            style={{ fontFamily: "'Syne', sans-serif" }}
          >
            Round Over
          </p>
          <p className="text-sm text-zinc-500">
            {spiesAlive.length} spy{spiesAlive.length !== 1 ? "ies" : ""} still
            hiding…
          </p>
          <p className="text-xs text-zinc-700 animate-pulse">
            Next round starting soon…
          </p>
        </div>
      )}
    </div>
  );
}

function GameLoading() {
  return (
    <main className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
      <div className="space-y-2 text-center">
        <div className="w-10 h-10 border-2 border-violet-500/30 border-t-violet-500 rounded-full animate-spin mx-auto" />
        <p className="text-zinc-600 text-sm">Loading game…</p>
      </div>
    </main>
  );
}
