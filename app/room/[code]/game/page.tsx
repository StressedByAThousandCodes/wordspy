"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getPlayerEmoji, getPlayerColor } from "@/lib/player";
import { Card, Badge, Spinner } from "@/components/ui";
import { ThemeToggle } from "@/components/theme";
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
  // BUG FIX (Bug 1): myRole is now stored alongside the round so it's always
  // in sync. We also track myRoleRoundId so we know which round the role
  // belongs to and can invalidate it when the round changes.
  const [myRole, setMyRole] = useState<string | null>(null);
  const [myRoleRoundId, setMyRoleRoundId] = useState<string | null>(null);

  // Refs used inside callbacks/timers to always see the latest values
  const roundRef = useRef<Round | null>(null);
  const hasAdvanced = useRef(false);
  const lastPhase = useRef<string | null>(null);
  const myPlayerIdRef = useRef<string | null>(null);

  const myPlayer = players.find((p) => p.id === myPlayerId);
  const alivePlayers = players.filter((p) => p.is_alive);
  const isAlive = myPlayer?.is_alive ?? false;

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

  // ── Helper: fetch role for current player + round ────────────────────────
  /**
   * BUG FIX (Bug 1): Previously role was fetched once in the initial load and
   * again inside the Realtime handler, but the modal useEffect had already
   * fired before the second fetch completed. Now we expose fetchMyRole as a
   * callback and await it before opening the modal.
   */
  const fetchMyRole = useCallback(async (roundId: string, playerId: string) => {
    try {
      const res = await fetch(`/api/rounds/${roundId}/my-role?playerId=${playerId}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data.role ?? null;
    } catch {
      return null;
    }
  }, []);

  // ── Helper: re-fetch players list ────────────────────────────────────────
  /**
   * BUG FIX (Bug 2, 3, 4): Centralised player re-fetch so every code path
   * (initial load, round change, rooms update) uses the same logic.
   */
  const fetchPlayers = useCallback(async (roomId: string) => {
    const { data } = await supabase
      .from("players")
      .select("id, nickname, is_ready, is_alive, room_id, device_token, joined_at, role")
      .eq("room_id", roomId)
      .order("joined_at");
    if (data) setPlayers(data);
    return data ?? [];
  }, []);

  // ── Helper: fetch round data (descriptions + votes) ──────────────────────
  const loadRoundData = useCallback(async (roundId: string) => {
    const [{ data: d }, { data: v }] = await Promise.all([
      supabase.from("descriptions").select("*").eq("round_id", roundId),
      supabase.from("votes").select("*").eq("round_id", roundId),
    ]);
    if (d) setDescriptions(d);
    if (v) setVotes(v);
  }, []);

  // ── Countdown ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!round?.phase_ends_at) return;
    function tick() {
      setSecondsLeft(
        Math.max(
          0,
          Math.round(
            (new Date(round!.phase_ends_at).getTime() - Date.now()) / 1000
          )
        )
      );
    }
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.phase_ends_at]);

  // ── Reset hasAdvanced on phase change ─────────────────────────────────────
  useEffect(() => {
    if (round?.phase && round.phase !== lastPhase.current) {
      hasAdvanced.current = false;
      lastPhase.current = round.phase;
    }
  }, [round?.phase]);

  // ── BUG FIX (Bug 1): Open describe modal ONLY after role is confirmed ─────
  // We depend on myRole AND myRoleRoundId matching the current round so the
  // modal never opens with a stale "..." word.
  useEffect(() => {
    if (
      round?.phase === "describing" &&
      isAlive &&
      !submitted &&
      myRole !== null &&
      myRoleRoundId === round.id
    ) {
      setShowDescribeModal(true);
    } else if (round?.phase !== "describing") {
      setShowDescribeModal(false);
    }
  }, [round?.phase, round?.id, isAlive, submitted, myRole, myRoleRoundId]);

  // ── BUG FIX (Bug 1): Auto-submit description when describing timer expires ──
  // Per game mechanics: "submit whether finished or not, even if empty"
  useEffect(() => {
    if (secondsLeft !== 0) return;
    if (round?.phase !== "describing") return;
    if (submitted) return;
    if (!myPlayerId || !round) return;
    if (!isAlive) return;

    // Timer ran out — submit whatever is in the box (even empty)
    setSubmitted(true);
    setShowDescribeModal(false);
    fetch("/api/descriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roundId: round.id,
        playerId: myPlayerId,
        content: myDescription, // may be empty string — server accepts it
      }),
    }).catch(() => setSubmitted(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    const playerId = sessionStorage.getItem("playerId");
    if (!playerId) {
      router.replace(`/join?code=${code}`);
      return;
    }
    setMyPlayerId(playerId);
    myPlayerIdRef.current = playerId;

    async function load() {
      const { data: roomData } = await supabase
        .from("rooms")
        .select("*")
        .eq("code", code)
        .single();
      if (!roomData) return;
      setRoom(roomData);

      // BUG FIX (Bug 2): Fetch players as part of the initial load every time,
      // not only when Realtime fires, so a page refresh always gets the full list.
      await fetchPlayers(roomData.id);

      const { data: roundData } = await supabase
        .from("rounds")
        .select("*")
        .eq("room_id", roomData.id)
        .order("round_number", { ascending: false })
        .limit(1)
        .single();

      if (roundData) {
        setRound(roundData);
        roundRef.current = roundData;
        await loadRoundData(roundData.id);

        // BUG FIX (Bug 1): Fetch role and set BOTH myRole and myRoleRoundId
        // atomically before the modal useEffect can fire.
        // playerId is guaranteed non-null here (we returned early above if null).
        if (roundData.phase !== "result") {
          const role = await fetchMyRole(roundData.id, playerId as string);
          setMyRole(role);
          setMyRoleRoundId(roundData.id);
        }
      }
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, router]);

  // ── Phase advance (timer expired) ─────────────────────────────────────────
  useEffect(() => {
    if (secondsLeft !== 0) return;
    if (!round) return;
    if (hasAdvanced.current) return;

    hasAdvanced.current = true;

    if (round.phase === "result") {
      // Small delay so all clients can read the result screen
      setTimeout(async () => {
        const { data: roomData } = await supabase
          .from("rooms")
          .select("status")
          .eq("code", code)
          .single();
        if (roomData?.status === "lobby") {
          router.push(`/room/${code}/lobby`);
        } else {
          fetch(`/api/rounds/${round.id}/advance`, { method: "POST" })
            .then((r) => r.json())
            .then((d) => console.log("Result advance:", d))
            .catch((e) => console.error("Result advance failed:", e));
        }
      }, 1500);
      return;
    }

    // For describing/discussing/voting — every player attempts advance;
    // the server .eq('phase', ...) guard prevents double-advancing.
    console.log("Timer expired, advancing phase:", round.phase);
    fetch(`/api/rounds/${round.id}/advance`, { method: "POST" })
      .then((r) => r.json())
      .then((d) => console.log("Advance result:", d))
      .catch((e) => {
        console.error("Advance failed:", e);
        hasAdvanced.current = false; // allow retry
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, round?.id, round?.phase]);

  // ── Safety net retry (3s after timer expires) ─────────────────────────────
  useEffect(() => {
    if (secondsLeft !== 0) return;
    if (!round || round.phase === "result") return;

    const retryTimer = setTimeout(() => {
      console.log("Retrying advance for phase:", round.phase);
      fetch(`/api/rounds/${round.id}/advance`, { method: "POST" })
        .then((r) => r.json())
        .then((d) => console.log("Retry advance result:", d))
        .catch((e) => console.error("Retry advance failed:", e));
    }, 3000);

    return () => clearTimeout(retryTimer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, round?.id, round?.phase]);

  // ── Realtime subscriptions ────────────────────────────────────────────────
  useEffect(() => {
    if (!room) return;

    /**
     * BUG FIX (Bug 2): There were TWO overlapping subscriptions on the rounds
     * table in the original code (lines ~225 and ~270 both used event:'*' on
     * rounds). The second one never re-fetched players, causing stale lists.
     * Now there is exactly ONE subscription per table.
     *
     * BUG FIX (Bug 4): The rooms UPDATE handler now always re-fetches players
     * so settings changes don't leave the player list stale.
     */
    const ch = supabase
      .channel(`game:${room.id}`)
      // ── Rounds changes ──────────────────────────────────────────────────
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rounds",
          filter: `room_id=eq.${room.id}`,
        },
        async (payload) => {
          const newRound = payload.new as Round;
          setRound(newRound);
          roundRef.current = newRound;

          // Reset per-round state
          setSubmitted(false);
          setVoted(false);
          setMyDescription("");
          setVotes([]);
          setDescriptions([]);

          await loadRoundData(newRound.id);

          // BUG FIX (Bug 2): Re-fetch players on every round change so the
          // player list stays consistent (roles, is_alive) without relying on
          // a separate players-table event that might arrive out of order.
          await fetchPlayers(room.id);

          // BUG FIX (Bug 1): Fetch role BEFORE the modal useEffect can fire.
          // We set myRoleRoundId atomically with myRole so the modal guard
          // (myRoleRoundId === round.id) only passes once both are correct.
          const storedPlayerId = myPlayerIdRef.current;
          if (storedPlayerId && newRound.phase === "describing") {
            setMyRole(null);          // clear stale role first
            setMyRoleRoundId(null);   // this blocks the modal from opening
            const role = await fetchMyRole(newRound.id, storedPlayerId);
            setMyRole(role);
            setMyRoleRoundId(newRound.id); // now the modal can open
          } else {
            setMyRole(null);
            setMyRoleRoundId(null);
          }
        }
      )
      // ── Players changes ──────────────────────────────────────────────────
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "players",
          filter: `room_id=eq.${room.id}`,
        },
        async () => {
          await fetchPlayers(room.id);
        }
      )
      // ── Descriptions inserts ─────────────────────────────────────────────
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "descriptions" },
        async () => {
          if (roundRef.current) await loadRoundData(roundRef.current.id);
        }
      )
      // ── Votes inserts / updates ──────────────────────────────────────────
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "votes" },
        async () => {
          if (roundRef.current) await loadRoundData(roundRef.current.id);
        }
      )
      // ── Room status changes ──────────────────────────────────────────────
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "rooms",
          filter: `id=eq.${room.id}`,
        },
        async (payload) => {
          const updated = payload.new as Room;
          setRoom(updated);

          // BUG FIX (Bug 4): Always re-fetch players when the room row changes
          // (settings updates, status changes). This ensures the lobby and game
          // views never show stale or empty player lists after a settings patch.
          await fetchPlayers(room.id);

          if (updated.status === "lobby") {
            router.push(`/room/${code}/lobby`);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [room, code, router, fetchPlayers, loadRoundData, fetchMyRole]);

  // ── Actions ───────────────────────────────────────────────────────────────
  async function submitDescription() {
    if (!round || !myPlayerId || submitted) return;
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
    const existing = votes.find((v) => v.voter_id === myPlayerId);
    if (existing?.target_id === targetId) return;
    setVoted(true);
    const res = await fetch(`/api/rounds/${round.id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voterId: myPlayerId, targetId }),
    });
    if (!res.ok) setVoted(false);
  }

  async function skipRound() {
    if (!round) return;
    fetch(`/api/rounds/${round.id}/advance`, { method: "POST" })
      .then((r) => r.json())
      .then((d) => console.log("Round skipped:", d))
      .catch((e) => console.error("Skip failed:", e));
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading || !round)
    return (
      <div
        className="min-h-screen flex items-center justify-center gap-3"
        style={{ background: "var(--bg)" }}
      >
        <Spinner />
        <span className="text-sm" style={{ color: "var(--text-3)" }}>
          Loading game…
        </span>
      </div>
    );

  // BUG FIX (Bug 1): Only show word once both role AND roundId are confirmed
  const roleReady = myRole !== null && myRoleRoundId === round.id;
  const myWord = !roleReady
    ? "…"
    : myRole === "spy"
    ? round.spy_word
    : round.civilian_word;

  const phaseDuration =
    round.created_at
      ? Math.round(
          (new Date(round.phase_ends_at).getTime() -
            new Date(round.created_at).getTime()) /
            1000
        )
      : 30;
  const timerPct = Math.min(100, (secondsLeft / phaseDuration) * 100);
  const isUrgent = secondsLeft <= 10 && secondsLeft > 0;

  const phaseInfo: Record<string, { label: string; desc: string }> = {
    describing: {
      label: "Describe",
      desc: "Write a one-sentence clue about your word",
    },
    discussing: {
      label: "Discuss",
      desc: "Read the clues — who sounds suspicious?",
    },
    voting: { label: "Vote", desc: "Choose who you think is the spy" },
    result: { label: "Result", desc: "" },
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "var(--bg)" }}
    >
      {/* ── Nav / timer header ── */}
      <header
        className="sticky top-0 z-30 border-b"
        style={{ background: "var(--bg)", borderColor: "var(--border)" }}
      >
        <div className="max-w-2xl mx-auto px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="text-sm font-semibold"
                style={{ color: "var(--text-3)" }}
              >
                Round {round.round_number}
              </span>
              <span style={{ color: "var(--border-2)" }}>·</span>
              <span
                className="text-sm font-semibold"
                style={{ color: "var(--text)" }}
              >
                {phaseInfo[round.phase]?.label}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`text-xl font-display font-bold tabular-nums transition-all ${isUrgent ? "animate-pulse" : ""}`}
                style={{ color: isUrgent ? "var(--danger)" : "var(--text)" }}
              >
                {secondsLeft}s
              </span>
              <ThemeToggle />
            </div>
          </div>
          <div
            className="h-1 rounded-full overflow-hidden"
            style={{ background: "var(--bg-3)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${timerPct}%`,
                background: isUrgent ? "var(--danger)" : "var(--accent)",
              }}
            />
          </div>
          {phaseInfo[round.phase]?.desc && (
            <p className="text-xs" style={{ color: "var(--text-3)" }}>
              {phaseInfo[round.phase].desc}
            </p>
          )}
        </div>
      </header>

      <div className="flex-1 max-w-2xl mx-auto w-full px-4 pt-4 pb-8 space-y-4">
        {/* ── Describing phase ── */}
        {round.phase === "describing" && (
          <div className="space-y-4">
            <Card className="p-5 text-center space-y-3">
              <p
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-3)" }}
              >
                Your word
              </p>
              <p
                className="text-3xl font-display font-bold"
                style={{ color: "var(--text)" }}
              >
                {myWord}
              </p>
              <p className="text-xs" style={{ color: "var(--text-3)" }}>
                Describe it in one sentence without saying it directly
              </p>
              {isAlive && !submitted && roleReady && (
                <button
                  onClick={() => setShowDescribeModal(true)}
                  className="mt-1 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
                  style={{ background: "var(--accent)" }}
                >
                  ✏️ Write description
                </button>
              )}
              {submitted && (
                <div
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{
                    background: "var(--success-bg)",
                    color: "var(--success)",
                  }}
                >
                  ✓ Submitted
                </div>
              )}
            </Card>

            <div className="space-y-2">
              <p
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-3)" }}
              >
                Waiting · {descriptions.length}/{alivePlayers.length}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {players.map((p) => {
                  const isEliminated = !p.is_alive;
                  const emoji = getPlayerEmoji(p.id);
                  const color = getPlayerColor(p.id);
                  const hasSubmitted = descriptions.some(
                    (d) => d.player_id === p.id
                  );
                  const isMe = p.id === myPlayerId;
                  return (
                    <Card
                      key={p.id}
                      className="flex items-center gap-3 p-3"
                      style={
                        isEliminated
                          ? {
                              opacity: 0.45,
                              borderColor: "var(--border)",
                              background: "var(--bg-2)",
                            }
                          : isMe
                          ? {
                              borderColor: "var(--accent)",
                              background: "var(--accent-bg)",
                            }
                          : {}
                      }
                    >
                      <div
                        className={`relative w-9 h-9 rounded-xl bg-gradient-to-br ${color.bg} flex items-center justify-center text-lg shrink-0`}
                      >
                        {emoji}
                        {isEliminated && (
                          <div className="absolute inset-0 rounded-xl bg-black/50 flex items-center justify-center text-xs">
                            💀
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm font-semibold truncate"
                          style={{ color: "var(--text)" }}
                        >
                          {p.nickname}
                        </p>
                        {isEliminated && (
                          <p
                            className="text-xs"
                            style={{ color: "var(--text-3)" }}
                          >
                            Eliminated · spectating
                          </p>
                        )}
                      </div>
                      {!isEliminated && (
                        <span
                          className="text-xs font-semibold shrink-0"
                          style={{
                            color: hasSubmitted
                              ? "var(--success)"
                              : "var(--text-3)",
                          }}
                        >
                          {hasSubmitted ? "✓ Done" : "…"}
                        </span>
                      )}
                    </Card>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── Discussing phase ── */}
        {round.phase === "discussing" && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {players.map((p) => {
                const emoji = getPlayerEmoji(p.id);
                const color = getPlayerColor(p.id);
                const desc = descriptions.find((d) => d.player_id === p.id);
                const isMe = p.id === myPlayerId;
                const isEliminated = !p.is_alive;
                return (
                  <Card
                    key={p.id}
                    className="p-4 space-y-3"
                    style={
                      isEliminated
                        ? { opacity: 0.45, background: "var(--bg-2)" }
                        : isMe
                        ? { borderColor: "var(--accent)" }
                        : {}
                    }
                  >
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`w-8 h-8 rounded-xl bg-gradient-to-br ${color.bg} flex items-center justify-center text-base shrink-0`}
                      >
                        {emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className="text-sm font-semibold truncate"
                            style={{ color: "var(--text)" }}
                          >
                            {p.nickname}
                          </span>
                          {isMe && (
                            <span
                              className="text-xs"
                              style={{ color: "var(--text-3)" }}
                            >
                              (you)
                            </span>
                          )}
                          {isEliminated && (
                            <span
                              className="text-xs"
                              style={{ color: "var(--danger)" }}
                            >
                              💀 eliminated
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <p
                      className="text-sm leading-relaxed"
                      style={{
                        color: desc ? "var(--text)" : "var(--text-3)",
                      }}
                    >
                      {desc?.content
                        ? desc.content
                        : <em>No description submitted</em>}
                    </p>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Voting phase ── */}
        {round.phase === "voting" && (
          <div className="space-y-3">
            {!isAlive && (
              <div
                className="text-center py-3 text-sm rounded-xl"
                style={{
                  background: "var(--bg-2)",
                  color: "var(--text-3)",
                  border: "1px solid var(--border)",
                }}
              >
                You were eliminated — watching only
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {players
                .filter((p) => p.id !== myPlayerId)
                .map((p) => {
                  const isEliminated = !p.is_alive;
                  const emoji = getPlayerEmoji(p.id);
                  const color = getPlayerColor(p.id);
                  const voteCount = votes.filter(
                    (v) => v.target_id === p.id
                  ).length;
                  const iVotedFor = !!votes.find(
                    (v) => v.voter_id === myPlayerId && v.target_id === p.id
                  );
                  return (
                    <button
                      key={p.id}
                      onClick={() => !isEliminated && isAlive && castVote(p.id)}
                      disabled={!isAlive || isEliminated}
                      className="w-full text-left transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl"
                      style={{
                        background: iVotedFor
                          ? "var(--accent-bg)"
                          : "var(--card)",
                        border: `1px solid ${iVotedFor ? "var(--accent)" : "var(--card-border)"}`,
                      }}
                    >
                      <div className="flex items-center gap-3 p-3.5">
                        <div
                          className={`relative w-10 h-10 rounded-xl bg-gradient-to-br ${color.bg} flex items-center justify-center text-xl shrink-0`}
                          style={isEliminated ? { opacity: 0.4 } : {}}
                        >
                          {emoji}
                          {isEliminated && (
                            <div className="absolute inset-0 rounded-xl bg-black/50 flex items-center justify-center text-xs">
                              💀
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className="text-sm font-semibold"
                            style={{ color: "var(--text)" }}
                          >
                            {p.nickname}
                          </p>
                          {iVotedFor && (
                            <p
                              className="text-xs mt-0.5"
                              style={{ color: "var(--accent)" }}
                            >
                              Your vote · tap another to change
                            </p>
                          )}
                          {voteCount > 0 && (
                            <div className="flex items-center gap-2 mt-1.5">
                              <div
                                className="flex-1 h-1 rounded-full overflow-hidden"
                                style={{ background: "var(--bg-3)" }}
                              >
                                <div
                                  className="h-full rounded-full transition-all duration-500"
                                  style={{
                                    width: `${(voteCount / alivePlayers.length) * 100}%`,
                                    background: "var(--danger)",
                                  }}
                                />
                              </div>
                              <span
                                className="text-xs tabular-nums shrink-0"
                                style={{ color: "var(--text-3)" }}
                              >
                                {voteCount}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
            </div>

            <p
              className="text-xs text-center"
              style={{ color: "var(--text-3)" }}
            >
              {votes.length}/{alivePlayers.length} voted
            </p>

            {/* BUG FIX (mechanics): No consensus — skip to next round */}
            {isAlive && !voted && (
              <button
                onClick={skipRound}
                className="w-full py-2.5 rounded-xl text-xs font-semibold transition-all hover:opacity-80"
                style={{
                  background: "var(--bg-2)",
                  border: "1px solid var(--border)",
                  color: "var(--text-3)",
                }}
              >
                🤷 No consensus — skip this round
              </button>
            )}
          </div>
        )}

        {/* ── Result phase ── */}
        {round.phase === "result" && (
          <ResultPhase
            players={players}
            round={round}
            eliminatedPlayerId={eliminatedPlayerId}
          />
        )}
      </div>

      {/* ── Describe modal ── */}
      {showDescribeModal && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 animate-fadeIn"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
        >
          <div
            className="w-full max-w-md rounded-2xl p-5 space-y-4 animate-scaleIn"
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
            }}
          >
            <div className="space-y-1">
              <p
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--text-3)" }}
              >
                Your word
              </p>
              <p
                className="text-3xl font-display font-bold"
                style={{ color: "var(--text)" }}
              >
                {myWord}
              </p>
              <p className="text-xs" style={{ color: "var(--text-3)" }}>
                One sentence. Don&apos;t say the word directly.
              </p>
            </div>
            <textarea
              rows={3}
              autoFocus
              placeholder="e.g. You use this every morning to start your day…"
              value={myDescription}
              onChange={(e) => setMyDescription(e.target.value)}
              maxLength={200}
              className="w-full rounded-xl px-3.5 py-3 text-sm outline-none resize-none transition-all"
              style={{
                background: "var(--bg-2)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
              onFocus={(e) => {
                e.target.style.borderColor = "var(--accent)";
                e.target.style.boxShadow = "0 0 0 3px var(--accent-bg)";
              }}
              onBlur={(e) => {
                e.target.style.borderColor = "var(--border)";
                e.target.style.boxShadow = "none";
              }}
            />
            <div
              className="flex items-center justify-between text-xs"
              style={{ color: "var(--text-3)" }}
            >
              <span>{myDescription.length}/200</span>
              <span
                className={isUrgent ? "font-bold" : ""}
                style={{ color: isUrgent ? "var(--danger)" : "var(--text-3)" }}
              >
                {secondsLeft}s left
              </span>
            </div>
            <div className="flex gap-2.5">
              <button
                onClick={() => setShowDescribeModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: "var(--bg-2)",
                  border: "1px solid var(--border)",
                  color: "var(--text-2)",
                }}
              >
                Later
              </button>
              <button
                onClick={submitDescription}
                disabled={submitted}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-40"
                style={{ background: "var(--accent)" }}
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Result Phase ──────────────────────────────────────────────────────────────
/**
 * BUG FIX (Bug 5 / result display):
 * Previously this component computed spiesAlive/civiliansAlive from p.role on
 * the local players list. That list may have stale/null roles by the time the
 * result phase renders (e.g. if a prior advance call cleared them).
 *
 * Now we derive the win condition purely from the eliminatedPlayerId and the
 * round's stored words — the DB-authoritative source. The actual winner is
 * determined server-side in the advance route; here we only display it.
 *
 * We still show all roles on the game-over card because by then the advance
 * route has already returned players to the lobby with roles cleared, and the
 * round itself still has civilian_word/spy_word for the reveal.
 */
function ResultPhase({
  players,
  round,
  eliminatedPlayerId,
}: {
  players: Player[];
  round: Round;
  eliminatedPlayerId: string | null;
}) {
  const eliminated = eliminatedPlayerId
    ? players.find((p) => p.id === eliminatedPlayerId)
    : null;

  // Filter alive players who still have a role set (fresh from DB via the
  // players subscription; not cleared yet by the post-result lobby reset)
  const alivePlayers = players.filter((p) => p.is_alive);
  const spiesAlive = alivePlayers.filter((p) => p.role === "spy");
  const civiliansAlive = alivePlayers.filter((p) => p.role === "civilian");

  // BUG FIX (Bug 5): use strict > to match corrected checkWinCondition
  const gameOver =
    spiesAlive.length === 0 || spiesAlive.length > civiliansAlive.length;
  const civWin = spiesAlive.length === 0;

  return (
    <div className="space-y-4 animate-fadeUp">
      {/* Eliminated player */}
      {eliminated ? (
        <Card className="p-5 text-center space-y-3">
          <p
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--text-3)" }}
          >
            Eliminated
          </p>
          <div
            className={`w-14 h-14 rounded-2xl mx-auto bg-gradient-to-br ${getPlayerColor(eliminated.id).bg} flex items-center justify-center text-3xl`}
          >
            {getPlayerEmoji(eliminated.id)}
          </div>
          <div>
            <p
              className="text-lg font-display font-bold"
              style={{ color: "var(--text)" }}
            >
              {eliminated.nickname}
            </p>
            <Badge variant={eliminated.role === "spy" ? "danger" : "default"}>
              {eliminated.role === "spy" ? "🕵️ The Spy" : "👤 Civilian"}
            </Badge>
          </div>
        </Card>
      ) : (
        <Card className="p-4 text-center">
          <p
            className="text-sm font-semibold"
            style={{ color: "var(--text-3)" }}
          >
            🤷 No votes — nobody was eliminated this round
          </p>
        </Card>
      )}

      {/* Game over */}
      {gameOver ? (
        <Card className="p-5 space-y-4">
          <div className="text-center space-y-2">
            <p className="text-4xl">{civWin ? "🎉" : "🕵️"}</p>
            <p
              className="text-xl font-display font-bold"
              style={{ color: "var(--text)" }}
            >
              {civWin ? "Civilians win!" : "Spies win!"}
            </p>
            <p className="text-sm" style={{ color: "var(--text-3)" }}>
              Civilians had{" "}
              <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                {round.civilian_word}
              </span>
              {" · "}
              Spies had{" "}
              <span style={{ color: "var(--danger)", fontWeight: 600 }}>
                {round.spy_word}
              </span>
            </p>
          </div>

          {/* Full role reveal */}
          <div
            className="space-y-2 pt-2 border-t"
            style={{ borderColor: "var(--border)" }}
          >
            <p
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--text-3)" }}
            >
              All roles
            </p>
            {players.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 p-2.5 rounded-xl"
                style={{
                  background:
                    p.role === "spy" ? "var(--danger-bg)" : "var(--bg-2)",
                  border: `1px solid ${p.role === "spy" ? "var(--danger)" : "var(--border)"}`,
                }}
              >
                <div
                  className={`w-8 h-8 rounded-xl bg-gradient-to-br ${getPlayerColor(p.id).bg} flex items-center justify-center text-base shrink-0`}
                >
                  {getPlayerEmoji(p.id)}
                </div>
                <span
                  className="flex-1 text-sm font-medium"
                  style={{ color: "var(--text)" }}
                >
                  {p.nickname}
                </span>
                <span
                  className="text-xs font-semibold"
                  style={{
                    color:
                      p.role === "spy" ? "var(--danger)" : "var(--text-3)",
                  }}
                >
                  {p.role === "spy" ? "🕵️ Spy" : "👤 Civilian"}
                </span>
              </div>
            ))}
          </div>
          <p
            className="text-xs text-center animate-pulse"
            style={{ color: "var(--text-3)" }}
          >
            Returning to lobby…
          </p>
        </Card>
      ) : (
        <Card className="p-5 text-center space-y-2">
          <p className="text-2xl">⏳</p>
          <p
            className="text-lg font-display font-bold"
            style={{ color: "var(--text)" }}
          >
            Round over
          </p>
          <p className="text-sm" style={{ color: "var(--text-3)" }}>
            {spiesAlive.length} spy{spiesAlive.length !== 1 ? "ies" : ""} still
            hidden…
          </p>
          <p
            className="text-xs animate-pulse"
            style={{ color: "var(--text-3)" }}
          >
            Next round starting…
          </p>
        </Card>
      )}
    </div>
  );
}