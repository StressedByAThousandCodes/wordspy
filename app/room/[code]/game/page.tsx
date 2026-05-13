"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getPlayerEmoji, getPlayerColor } from "@/lib/player";
import { Card, Badge, Spinner } from "@/components/ui";
import { ThemeToggle } from "@/components/theme";
import type { Round, Player, Description, Vote, Room, ChatMessage } from "@/types";

type SafeRound = Omit<Round, "civilian_word" | "spy_word">;

export default function GamePage() {
  const router = useRouter();
  const params = useParams();
  const code = params.code as string;

  const [room, setRoom] = useState<Room | null>(null);
  const [round, setRound] = useState<SafeRound | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [descriptions, setDescriptions] = useState<Description[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [myDescription, setMyDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showDescribeModal, setShowDescribeModal] = useState(false);
  const [myWord, setMyWord] = useState<string | null>(null);
  const [myWordRoundId, setMyWordRoundId] = useState<string | null>(null);
  const [gameMessages, setGameMessages] = useState<ChatMessage[]>([]);
  const [gameChatInput, setGameChatInput] = useState("");
  const [resultReveal, setResultReveal] = useState<{
    players: Player[];
    civilianWord: string;
    spyWord: string;
  } | null>(null);

  const roundRef = useRef<SafeRound | null>(null);
  const hasAdvanced = useRef(false);
  const lastPhase = useRef<string | null>(null);
  const myPlayerIdRef = useRef<string | null>(null);
  const gameChatEndRef = useRef<HTMLDivElement>(null);
  const pendingDescriptionSubmit = useRef(false);

  const myPlayer = players.find((p) => p.id === myPlayerId);
  const alivePlayers = players.filter((p) => p.is_alive);
  const isAlive = myPlayer?.is_alive ?? false;

  const eliminatedPlayerId =
    votes.length > 0
      ? (() => {
          const counts = new Map<string, number>();
          for (const v of votes)
            counts.set(v.target_id, (counts.get(v.target_id) ?? 0) + 1);
          let max = 0, id: string | null = null;
          for (const [pid, count] of counts) {
            if (count > max) { max = count; id = pid; }
            else if (count === max) id = null;
          }
          return id;
        })()
      : null;

  const fetchMyWord = useCallback(async (roundId: string, playerId: string | null): Promise<string | null> => {
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch(`/api/rounds/${roundId}/my-role?playerId=${playerId}`);
        if (!res.ok) return null;
        const data = await res.json();
        if (data.word !== null && data.word !== undefined) return data.word as string;
        if (attempt < 2) await new Promise((r) => setTimeout(r, 500));
      }
      return null;
    } catch { return null; }
  }, []);

  const fetchPlayers = useCallback(async (roomId: string) => {
    const { data } = await supabase
      .from("players")
      .select("id, nickname, is_ready, is_alive, room_id, device_token, joined_at")
      .eq("room_id", roomId)
      .order("joined_at");
    if (data) setPlayers(data as Player[]);
    return (data ?? []) as Player[];
  }, []);

  const loadRoundData = useCallback(async (roundId: string) => {
    const [{ data: d }, { data: v }] = await Promise.all([
      supabase.from("descriptions").select("*").eq("round_id", roundId),
      supabase.from("votes").select("*").eq("round_id", roundId),
    ]);
    if (d) setDescriptions(d);
    if (v) setVotes(v);
  }, []);

  const loadResultReveal = useCallback(async (roundId: string, roomId: string) => {
    const [{ data: roundWithWords }, { data: playersWithRoles }] = await Promise.all([
      supabase.from("rounds").select("civilian_word, spy_word").eq("id", roundId).single(),
      supabase.from("players").select("id, nickname, is_ready, is_alive, room_id, device_token, joined_at, role").eq("room_id", roomId),
    ]);
    if (roundWithWords && playersWithRoles) {
      setResultReveal({
        players: playersWithRoles as Player[],
        civilianWord: roundWithWords.civilian_word,
        spyWord: roundWithWords.spy_word,
      });
    }
  }, []);

  // ── Countdown ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!round?.phase_ends_at) return;
    function tick() {
      setSecondsLeft(Math.max(0, Math.round((new Date(round!.phase_ends_at).getTime() - Date.now()) / 1000)));
    }
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [round?.phase_ends_at]);

  // ── Reset hasAdvanced on phase change ─────────────────────────────────────
  useEffect(() => {
    if (round?.phase && round.phase !== lastPhase.current) {
      hasAdvanced.current = false;
      lastPhase.current = round.phase;
    }
  }, [round?.phase]);

  // ── Open describe modal only after word confirmed ─────────────────────────
  useEffect(() => {
    if (round?.phase === "describing" && isAlive && !submitted && myWord !== null && myWordRoundId === round.id) {
      setShowDescribeModal(true);
    } else if (round?.phase !== "describing") {
      setShowDescribeModal(false);
    }
  }, [round?.phase, round?.id, isAlive, submitted, myWord, myWordRoundId]);

  // ── Auto-submit when timer expires ────────────────────────────────────────
  useEffect(() => {
    if (secondsLeft !== 0 || round?.phase !== "describing" || submitted || !isAlive) return;
    pendingDescriptionSubmit.current = true;
    setSubmitted(true);
    setShowDescribeModal(false);
    fetch("/api/descriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roundId: round!.id, playerId: myPlayerId, content: myDescription }),
    }).finally(() => { pendingDescriptionSubmit.current = false; });
  }, [secondsLeft]); // eslint-disable-line

  // ── Initial load ──────────────────────────────────────────────────────────
  useEffect(() => {
    const playerId = sessionStorage.getItem("playerId");
    if (!playerId) { router.replace(`/join?code=${code}`); return; }
    setMyPlayerId(playerId);
    myPlayerIdRef.current = playerId;

    async function load() {
      const { data: roomData } = await supabase.from("rooms").select("*").eq("code", code).single();
      if (!roomData) return;
      setRoom(roomData);
      await fetchPlayers(roomData.id);

      const { data: roundData } = await supabase
        .from("rounds")
        .select("id, room_id, round_number, phase, phase_ends_at, created_at")
        .eq("room_id", roomData.id)
        .order("round_number", { ascending: false })
        .limit(1)
        .single();

      if (roundData) {
        setRound(roundData as SafeRound);
        roundRef.current = roundData as SafeRound;
        await loadRoundData(roundData.id);
        if (roundData.phase === "describing") {
          const word = await fetchMyWord(roundData.id, playerId);
          setMyWord(word);
          setMyWordRoundId(roundData.id);
        } else if (roundData.phase === "result") {
          await loadResultReveal(roundData.id, roomData.id);
        }
      }

      const { data: msgs } = await supabase.from("messages").select("*").eq("room_id", roomData.id).order("created_at").limit(200);
      if (msgs) setGameMessages(msgs);
      setLoading(false);
    }
    load();
  }, [code, router]); // eslint-disable-line

  // ── Auto-scroll chat ──────────────────────────────────────────────────────
  useEffect(() => {
    gameChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [gameMessages]);

  // ── Phase advance on timer expiry ─────────────────────────────────────────
  useEffect(() => {
    if (secondsLeft !== 0 || !round || hasAdvanced.current) return;
    hasAdvanced.current = true;
    const delay = round.phase === "describing" ? 1000 : 0;
    setTimeout(() => {
      fetch(`/api/rounds/${round.id}/advance`, { method: "POST" }).catch(() => { hasAdvanced.current = false; });
    }, delay);
  }, [secondsLeft, round?.id, round?.phase]); // eslint-disable-line

  // ── Safety net retry ──────────────────────────────────────────────────────
  useEffect(() => {
    if (secondsLeft !== 0 || !round) return;
    const retryTimer = setTimeout(() => {
      fetch(`/api/rounds/${round.id}/advance`, { method: "POST" })
        .then((r) => r.json())
        .then((d) => console.log("Retry advance:", d))
        .catch((e) => console.error("Retry advance failed:", e));
    }, 3000);
    return () => clearTimeout(retryTimer);
  }, [secondsLeft, round?.id, round?.phase]); // eslint-disable-line

  // ── Realtime ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!room) return;
    const ch = supabase
      .channel(`game:${room.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rounds", filter: `room_id=eq.${room.id}` },
        async (payload) => {
          const incomingId = (payload.new as any)?.id;
          if (!incomingId) return;
          const { data: safeRound } = await supabase
            .from("rounds")
            .select("id, room_id, round_number, phase, phase_ends_at, created_at")
            .eq("id", incomingId)
            .single();
          if (!safeRound) return;
          setRound(safeRound as SafeRound);
          roundRef.current = safeRound as SafeRound;
          setSubmitted(false);
          setMyDescription("");
          setVotes([]);
          setDescriptions([]);
          setResultReveal(null);
          await loadRoundData(safeRound.id);
          await fetchPlayers(room.id);
          if (safeRound.phase === "result") {
            await loadResultReveal(safeRound.id, room.id);
          }
          const storedPlayerId = myPlayerIdRef.current;
          if (storedPlayerId && safeRound.phase === "describing") {
            setMyWord(null);
            setMyWordRoundId(null);
            const word = await fetchMyWord(safeRound.id, storedPlayerId);
            setMyWord(word);
            setMyWordRoundId(safeRound.id);
          } else {
            setMyWord(null);
            setMyWordRoundId(null);
          }
        })
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `room_id=eq.${room.id}` },
        async () => { await fetchPlayers(room.id); })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "descriptions" },
        async () => { if (roundRef.current) await loadRoundData(roundRef.current.id); })
      .on("postgres_changes", { event: "*", schema: "public", table: "votes" },
        async () => { if (roundRef.current) await loadRoundData(roundRef.current.id); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${room.id}` },
        async (payload) => {
          const updated = payload.new as Room;
          setRoom(updated);
          await fetchPlayers(room.id);
          if (updated.status === "lobby") router.push(`/room/${code}/lobby`);
        })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `room_id=eq.${room.id}` },
        (payload) => setGameMessages((prev) => [...prev, payload.new as ChatMessage]))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [room, code, router, fetchPlayers, loadRoundData, fetchMyWord, loadResultReveal]);

  // ── Actions ───────────────────────────────────────────────────────────────
  async function submitDescription() {
    if (!round || !myPlayerId || submitted) return;
    setSubmitted(true);
    setShowDescribeModal(false);
    const res = await fetch("/api/descriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roundId: round.id, playerId: myPlayerId, content: myDescription.trim() }),
    });
    if (!res.ok) setSubmitted(false);
  }

  async function castVote(targetId: string) {
    if (!round || !myPlayerId || !isAlive) return;
    const existing = votes.find((v) => v.voter_id === myPlayerId);
    if (existing?.target_id === targetId) return;
    await fetch(`/api/rounds/${round.id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voterId: myPlayerId, targetId }),
    });
  }

  async function sendGameMessage() {
    if (!gameChatInput.trim() || !myPlayerId || !room) return;
    const content = gameChatInput.trim();
    setGameChatInput("");
    await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId: room.id, playerId: myPlayerId, content }),
    });
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading || !round)
    return (
      <div className="min-h-screen flex items-center justify-center gap-3" style={{ background: "var(--bg)" }}>
        <Spinner />
        <span className="text-sm" style={{ color: "var(--text-3)" }}>Loading game…</span>
      </div>
    );

  const phaseDurations: Record<string, number> = {
    describing: room?.describe_seconds ?? 30,
    discussing: room?.discuss_seconds ?? 45,
    voting: room?.vote_seconds ?? 30,
    result: 8,
  };
  const phaseDuration = phaseDurations[round.phase] ?? 30;
  const timerPct = Math.min(100, (secondsLeft / phaseDuration) * 100);
  const isUrgent = secondsLeft <= 10 && secondsLeft > 0;

  const phaseInfo: Record<string, { label: string; desc: string }> = {
    describing: { label: "Describe", desc: "Write a one-sentence clue about your word" },
    discussing: { label: "Discuss", desc: "Read the clues — who sounds suspicious?" },
    voting: { label: "Vote", desc: "Choose who you think is the spy" },
    result: { label: "Result", desc: "" },
  };

  const wordReady = myWord !== null && myWordRoundId === round.id;

  // Chat is shown as sidebar on desktop for discussing + voting phases
  const showChatSidebar = round.phase === "discussing" || round.phase === "voting";

  // ── Chat panel (reused in sidebar and mobile) ─────────────────────────────
  const ChatPanel = ({ fullHeight = false }: { fullHeight?: boolean }) => (
    <div
      className={`flex flex-col rounded-2xl overflow-hidden ${fullHeight ? "h-full" : ""}`}
      style={{ border: "1px solid var(--border)", background: "var(--card)" }}
    >
      <div className="px-4 py-3 border-b flex items-center justify-between shrink-0" style={{ borderColor: "var(--border)" }}>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>Chat</p>
        <span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{gameMessages.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-0">
        {gameMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 py-6">
            <span className="text-2xl opacity-20">💬</span>
            <p className="text-xs" style={{ color: "var(--text-3)" }}>No messages yet</p>
          </div>
        )}
        {gameMessages.map((msg) => {
          const sender = players.find((p) => p.id === msg.player_id);
          const isMe = msg.player_id === myPlayerId;
          return (
            <div key={msg.id} className={`flex items-end gap-2 ${isMe ? "flex-row-reverse" : ""}`}>
              <div
                className="px-3 py-2 rounded-2xl text-xs leading-relaxed max-w-[85%] break-words"
                style={isMe
                  ? { background: "var(--accent)", color: "white" }
                  : { background: "var(--bg-2)", color: "var(--text)", border: "1px solid var(--border)" }}
              >
                {!isMe && <span className="block font-semibold mb-0.5" style={{ color: "var(--text-3)" }}>{sender?.nickname}</span>}
                {msg.content}
              </div>
            </div>
          );
        })}
        <div ref={gameChatEndRef} />
      </div>
      <div className="border-t px-3 py-2.5 flex gap-2 shrink-0" style={{ borderColor: "var(--border)", background: "var(--bg-2)" }}>
        <input
          placeholder="Say something…"
          value={gameChatInput}
          onChange={(e) => setGameChatInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") sendGameMessage(); }}
          maxLength={200}
          className="flex-1 rounded-xl px-3 py-2 text-xs outline-none"
          style={{ background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text)" }}
        />
        <button
          onClick={sendGameMessage}
          disabled={!gameChatInput.trim()}
          className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm shrink-0 disabled:opacity-40"
          style={{ background: "var(--accent)" }}
        >↑</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      {/* ── Header / timer ── */}
      <header className="sticky top-0 z-30 border-b shrink-0" style={{ background: "var(--bg)", borderColor: "var(--border)" }}>
        <div className="max-w-7xl mx-auto px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold" style={{ color: "var(--text-3)" }}>Round {round.round_number}</span>
              <span style={{ color: "var(--border-2)" }}>·</span>
              <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>{phaseInfo[round.phase]?.label}</span>
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
          <div className="h-1 rounded-full overflow-hidden" style={{ background: "var(--bg-3)" }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${timerPct}%`, background: isUrgent ? "var(--danger)" : "var(--accent)" }} />
          </div>
          {phaseInfo[round.phase]?.desc && (
            <p className="text-xs" style={{ color: "var(--text-3)" }}>{phaseInfo[round.phase].desc}</p>
          )}
        </div>
      </header>

      {/* ── Body: main content + optional chat sidebar ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Main scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <div className={`mx-auto px-4 pt-4 pb-8 space-y-4 ${showChatSidebar ? "max-w-full" : "max-w-2xl"}`}>

            {/* ── Describing phase ── */}
            {round.phase === "describing" && (
              <div className="max-w-2xl mx-auto space-y-4">
                <Card className="p-5 text-center space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>Your word</p>
                  <p className="text-3xl font-display font-bold" style={{ color: "var(--text)" }}>
                    {wordReady ? myWord : "…"}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-3)" }}>Describe it in one sentence without saying it directly</p>
                  {isAlive && !submitted && wordReady && (
                    <button
                      onClick={() => setShowDescribeModal(true)}
                      className="mt-1 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98]"
                      style={{ background: "var(--accent)" }}
                    >
                      ✏️ Write description
                    </button>
                  )}
                  {submitted && (
                    <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                      style={{ background: "var(--success-bg)", color: "var(--success)" }}>
                      ✓ Submitted
                    </div>
                  )}
                </Card>

                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                    Waiting · {descriptions.length}/{alivePlayers.length}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {players.map((p) => {
                      const isEliminated = !p.is_alive;
                      const emoji = getPlayerEmoji(p.id);
                      const color = getPlayerColor(p.id);
                      const hasSubmitted = descriptions.some((d) => d.player_id === p.id);
                      const isMe = p.id === myPlayerId;
                      return (
                        <Card key={p.id} className="flex items-center gap-3 p-3"
                          style={isEliminated
                            ? { opacity: 0.45, borderColor: "var(--border)", background: "var(--bg-2)" }
                            : isMe
                              ? { borderColor: "var(--accent)", background: "var(--accent-bg)" }
                              : {}}>
                          <div className={`relative w-9 h-9 rounded-xl bg-gradient-to-br ${color.bg} flex items-center justify-center text-lg shrink-0`}>
                            {emoji}
                            {isEliminated && <div className="absolute inset-0 rounded-xl bg-black/50 flex items-center justify-center text-xs">💀</div>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>{p.nickname}</p>
                            {isEliminated && <p className="text-xs" style={{ color: "var(--text-3)" }}>Eliminated · spectating</p>}
                          </div>
                          {!isEliminated && (
                            <span className="text-xs font-semibold shrink-0"
                              style={{ color: hasSubmitted ? "var(--success)" : "var(--text-3)" }}>
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
                <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
                  Descriptions · {descriptions.length} submitted
                </p>
                {/* Description cards — each player + their description in one card */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {players.map((p) => {
                    const emoji = getPlayerEmoji(p.id);
                    const color = getPlayerColor(p.id);
                    const desc = descriptions.find((d) => d.player_id === p.id);
                    const isMe = p.id === myPlayerId;
                    const isEliminated = !p.is_alive;
                    return (
                      <div
                        key={p.id}
                        className="rounded-2xl p-4 space-y-3"
                        style={{
                          background: isEliminated
                            ? "var(--bg-2)"
                            : isMe
                              ? "var(--accent-bg)"
                              : "var(--bg-2)",
                          border: `1px solid ${isEliminated
                            ? "var(--border)"
                            : isMe
                              ? "var(--accent)"
                              : "var(--border-2)"}`,
                          opacity: isEliminated ? 0.5 : 1,
                        }}
                      >
                        {/* Player header */}
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${color.bg} flex items-center justify-center text-base shrink-0`}>
                            {emoji}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>{p.nickname}</span>
                              {isMe && <span className="text-xs" style={{ color: "var(--text-3)" }}>(you)</span>}
                              {isEliminated && <span className="text-xs" style={{ color: "var(--danger)" }}>💀</span>}
                            </div>
                          </div>
                        </div>
                        {/* Divider */}
                        <div style={{ height: 1, background: "var(--border)" }} />
                        {/* Description */}
                        <p className="text-sm leading-relaxed"
                          style={{ color: desc?.content ? "var(--text)" : "var(--text-3)", fontStyle: desc?.content ? "normal" : "italic" }}>
                          {desc?.content || "No description submitted"}
                        </p>
                      </div>
                    );
                  })}
                </div>
                {/* Mobile chat (hidden on desktop — sidebar handles it) */}
                <div className="lg:hidden mt-4">
                  <ChatPanel />
                </div>
              </div>
            )}

            {/* ── Voting phase ── */}
            {round.phase === "voting" && (
              <div className="space-y-3">
                {!isAlive && (
                  <div className="text-center py-3 text-sm rounded-xl"
                    style={{ background: "var(--bg-2)", color: "var(--text-3)", border: "1px solid var(--border)" }}>
                    You were eliminated — watching only
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {players.filter((p) => p.id !== myPlayerId).map((p) => {
                    const isEliminated = !p.is_alive;
                    const emoji = getPlayerEmoji(p.id);
                    const color = getPlayerColor(p.id);
                    const voteCount = votes.filter((v) => v.target_id === p.id).length;
                    const iVotedFor = !!votes.find((v) => v.voter_id === myPlayerId && v.target_id === p.id);
                    return (
                      <button
                        key={p.id}
                        onClick={() => !isEliminated && isAlive && castVote(p.id)}
                        disabled={!isAlive || isEliminated}
                        className="w-full text-left transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed rounded-2xl"
                        style={{
                          background: iVotedFor ? "var(--accent-bg)" : "var(--card)",
                          border: `1px solid ${iVotedFor ? "var(--accent)" : "var(--card-border)"}`,
                        }}
                      >
                        <div className="flex items-center gap-3 p-3.5">
                          <div className={`relative w-10 h-10 rounded-xl bg-gradient-to-br ${color.bg} flex items-center justify-center text-xl shrink-0`}
                            style={isEliminated ? { opacity: 0.4 } : {}}>
                            {emoji}
                            {isEliminated && <div className="absolute inset-0 rounded-xl bg-black/50 flex items-center justify-center text-xs">💀</div>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{p.nickname}</p>
                            {iVotedFor && (
                              <p className="text-xs mt-0.5" style={{ color: "var(--accent)" }}>Your vote · tap to change</p>
                            )}
                            {voteCount > 0 && (
                              <div className="flex items-center gap-2 mt-1.5">
                                <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "var(--bg-3)" }}>
                                  <div className="h-full rounded-full transition-all duration-500"
                                    style={{ width: `${(voteCount / alivePlayers.length) * 100}%`, background: "var(--danger)" }} />
                                </div>
                                <span className="text-xs tabular-nums shrink-0" style={{ color: "var(--text-3)" }}>{voteCount}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-center" style={{ color: "var(--text-3)" }}>
                  {votes.length}/{alivePlayers.length} voted
                </p>
                {/* Mobile chat */}
                <div className="lg:hidden mt-4">
                  <ChatPanel />
                </div>
              </div>
            )}

            {/* ── Result phase ── */}
            {round.phase === "result" && (
              <div className="max-w-2xl mx-auto">
                <ResultPhase
                  players={players}
                  eliminatedPlayerId={eliminatedPlayerId}
                  resultReveal={resultReveal}
                />
              </div>
            )}
          </div>
        </div>

        {/* ── Desktop chat sidebar (discussing + voting only) ── */}
        {showChatSidebar && (
          <div
            className="hidden lg:flex flex-col border-l shrink-0"
            style={{
              width: 320,
              borderColor: "var(--border)",
              height: "calc(100vh - 73px)", // full height minus header
            }}
          >
            <ChatPanel fullHeight />
          </div>
        )}
      </div>

      {/* ── Describe modal ── */}
      {showDescribeModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 animate-fadeIn"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
          <div className="w-full max-w-md rounded-2xl p-5 space-y-4 animate-scaleIn"
            style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>Your word</p>
              <p className="text-3xl font-display font-bold" style={{ color: "var(--text)" }}>{myWord}</p>
              <p className="text-xs" style={{ color: "var(--text-3)" }}>One sentence. Don&apos;t say the word directly.</p>
            </div>
            <textarea
              rows={3} autoFocus
              placeholder="e.g. You use this every morning to start your day…"
              value={myDescription}
              onChange={(e) => setMyDescription(e.target.value)}
              maxLength={200}
              className="w-full rounded-xl px-3.5 py-3 text-sm outline-none resize-none transition-all"
              style={{ background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--text)" }}
              onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; e.target.style.boxShadow = "0 0 0 3px var(--accent-bg)"; }}
              onBlur={(e) => { e.target.style.borderColor = "var(--border)"; e.target.style.boxShadow = "none"; }}
            />
            <div className="flex items-center justify-between text-xs" style={{ color: "var(--text-3)" }}>
              <span>{myDescription.length}/200</span>
              <span className={isUrgent ? "font-bold" : ""} style={{ color: isUrgent ? "var(--danger)" : "var(--text-3)" }}>
                {secondsLeft}s left
              </span>
            </div>
            <div className="flex gap-2.5">
              <button onClick={() => setShowDescribeModal(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{ background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
                Later
              </button>
              <button onClick={submitDescription} disabled={submitted}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-40"
                style={{ background: "var(--accent)" }}>
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
function ResultPhase({
  players,
  eliminatedPlayerId,
  resultReveal,
}: {
  players: Player[];
  eliminatedPlayerId: string | null;
  resultReveal: { players: Player[]; civilianWord: string; spyWord: string } | null;
}) {
  const eliminated = eliminatedPlayerId
    ? (resultReveal?.players ?? players).find((p) => p.id === eliminatedPlayerId)
    : null;

  const revealPlayers = resultReveal?.players ?? [];
  const alivePlayers = revealPlayers.filter((p) => p.is_alive);
  const spiesAlive = alivePlayers.filter((p) => p.role === "spy");
  const civiliansAlive = alivePlayers.filter((p) => p.role === "civilian");

  // Win condition:
  // - All spies eliminated → civilians win
  // - Spies equal or outnumber civilians → spies win (>= not just >)
  const gameOver = resultReveal !== null && (
    spiesAlive.length === 0 || spiesAlive.length >= civiliansAlive.length
  );
  const civWin = resultReveal !== null && spiesAlive.length === 0;

  return (
    <div className="space-y-4 animate-fadeUp">
      {/* Eliminated card */}
      {eliminated ? (
        <Card className="p-5 text-center space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>Eliminated</p>
          <div className={`w-14 h-14 rounded-2xl mx-auto bg-gradient-to-br ${getPlayerColor(eliminated.id).bg} flex items-center justify-center text-3xl`}>
            {getPlayerEmoji(eliminated.id)}
          </div>
          <div>
            <p className="text-lg font-display font-bold" style={{ color: "var(--text)" }}>{eliminated.nickname}</p>
            {/* Only reveal role on game over */}
            {gameOver && eliminated.role && (
              <Badge variant={eliminated.role === "spy" ? "danger" : "default"}>
                {eliminated.role === "spy" ? "🕵️ The Spy" : "👤 Civilian"}
              </Badge>
            )}
          </div>
        </Card>
      ) : (
        <Card className="p-4 text-center">
          <p className="text-sm font-semibold" style={{ color: "var(--text-3)" }}>
            🤷 No votes — nobody was eliminated this round
          </p>
        </Card>
      )}

      {/* Game over reveal */}
      {gameOver && resultReveal ? (
        <Card className="p-5 space-y-4">
          <div className="text-center space-y-2">
            <p className="text-4xl">{civWin ? "🎉" : "🕵️"}</p>
            <p className="text-xl font-display font-bold" style={{ color: "var(--text)" }}>
              {civWin ? "Civilians win!" : "Spies win!"}
            </p>
            <p className="text-sm" style={{ color: "var(--text-3)" }}>
              Civilians had{" "}
              <span style={{ color: "var(--accent)", fontWeight: 600 }}>{resultReveal.civilianWord}</span>
              {" · "}
              Spies had{" "}
              <span style={{ color: "var(--danger)", fontWeight: 600 }}>{resultReveal.spyWord}</span>
            </p>
          </div>
          <div className="space-y-2 pt-2 border-t" style={{ borderColor: "var(--border)" }}>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>All roles</p>
            {resultReveal.players.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-xl"
                style={{
                  background: p.role === "spy" ? "var(--danger-bg)" : "var(--bg-2)",
                  border: `1px solid ${p.role === "spy" ? "var(--danger)" : "var(--border)"}`,
                }}>
                <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${getPlayerColor(p.id).bg} flex items-center justify-center text-base shrink-0`}>
                  {getPlayerEmoji(p.id)}
                </div>
                <span className="flex-1 text-sm font-medium" style={{ color: "var(--text)" }}>{p.nickname}</span>
                <span className="text-xs font-semibold" style={{ color: p.role === "spy" ? "var(--danger)" : "var(--text-3)" }}>
                  {p.role === "spy" ? "🕵️ Spy" : "👤 Civilian"}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-center animate-pulse" style={{ color: "var(--text-3)" }}>Returning to lobby…</p>
        </Card>
      ) : resultReveal ? (
        /* Game continues */
        <Card className="p-5 text-center space-y-2">
          <p className="text-2xl">⏳</p>
          <p className="text-lg font-display font-bold" style={{ color: "var(--text)" }}>Round over</p>
          <p className="text-sm" style={{ color: "var(--text-3)" }}>
            {spiesAlive.length} spy{spiesAlive.length !== 1 ? "ies" : ""} still hidden…
          </p>
          <p className="text-xs animate-pulse" style={{ color: "var(--text-3)" }}>Next round starting…</p>
        </Card>
      ) : (
        <Card className="p-5 text-center space-y-2">
          <Spinner />
          <p className="text-sm" style={{ color: "var(--text-3)" }}>Loading result…</p>
        </Card>
      )}
    </div>
  );
}